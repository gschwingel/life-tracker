#!/usr/bin/env node
/**
 * scripts/verificar-vivacidade-jobs.cjs
 * FR-JOBS-VIVACIDADE-WATCHDOG -- SP-HARDENING-GATES-ASYNC / KF-FERRAMENTAS.
 *
 * POR QUE ESTE SCRIPT EXISTE
 * (fonte: LILA-DEV/planejamento/hardening/backlog.md §1 HB-001.. e
 *  executados/registry-ate-2026-09-25.md, fechamento de 2026-09-17)
 *
 * Os jobs AGENDADOS do projeto rodam em runner self-hosted local (postgres-backup,
 * probe e2e do runner) ou em ubuntu-latest (indices vetoriais). O modo de falha
 * dominante e o SILENCIO: maquina desligada deixa o job em `queued`
 * indefinidamente, token/PAT expirado derruba o run, cron atrasa horas e o
 * resultado e sempre o mesmo -- ausencia de run que parece saude.
 *
 * O indices-vetorial-watchdog.yml (SP-INDICES-VETORIAL-01b) cobre o RESULTADO
 * do cron vetorial (frescor por fileHash). Este script cobre a VIVACIDADE dos
 * jobs: o job rodou COM SUCESSO dentro da janela esperada?
 *
 * CONTRATO
 * - Camada 1 (silencio): consulta a API do GitHub (Actions runs) por alvo:
 *   ultimo run com event=schedule e conclusion=success.
 * - Alvo sem success dentro do teto (ou sem nenhum success agendado na
 *   historia retornada) = ALVO ESTOURADO -> exit 1.
 * - Camada 2 (duracao anormal): runs de QUALQUER evento dos workflows de lane
 *   light/fila com duracao de parede acima do teto na janela de 48h -> exit 1.
 *   Motivacao: checkout travou 9h08min em 2026-10-05 e o modo silencio nao o
 *   viu (plano-lane-light-resiliencia-v2).
 * - Alerta nunca silencioso: uma linha por alvo no stdout; exit 1 no fim.
 * - READ-ONLY: nunca conserta, nunca escreve, nunca dispara workflow.
 *
 * USO
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/verificar-vivacidade-jobs.cjs
 *   ... --json         # saida maquina-legivel (uma linha JSON)
 *   ... --dias-max 2   # teto GLOBAL de idade em dias (sobrescreve o teto por alvo)
 *
 * Roda em CI pelo job do .github/workflows/jobs-vivacidade.yml (diario) e
 * localmente para diagnostico. Sem dependencia externa: fetch global do Node 20+.
 */
"use strict";

const API = "https://api.github.com";

/**
 * Alvos monitorados. `tetoHoras` deriva do cron DECLARADO no proprio workflow
 * e da folga de fila observada (2-5h entre o horario do cron e a criacao do
 * run): diario -> 26h (mesmo numero do backlog item 1); semanal -> 192h (8d).
 */
const ALVOS = [
  // l3-backfill-diario.yml e indices-vetorial-diario.yml REMOVIDOS dos alvos:
  // ambos foram condenados e apagados do repo em 2d8de871
  // [FRAME-REANC-L4-OPS-20260920]; monitorar workflow inexistente = falso
  // vermelho eterno (o watchdog ficou vermelho 27/09-01/10 e foi desligado a
  // mao por causa disso).
  { arquivo: "postgres-backup-diario.yml", nome: "Backup Postgres diario", cron: "0 3 * * *", tetoHoras: 26 },
  { arquivo: "indices-vetorial-watchdog.yml", nome: "Indice vetorial watchdog", cron: "30 4 * * *", tetoHoras: 26 },
  // FR-GUARDA-FLIPS-PENDENTES-20260920: o job `flips-pendentes` roda DENTRO do
  // gates-grafo.yml (mesmo disparo push/PR + cron semanal 0 6 * * 1) — não é
  // workflow próprio, logo não vira alvo novo: o teto de 192h deste alvo já
  // cobre o cron semanal do workflow INTEIRO, job incluído.
  { arquivo: "gates-grafo.yml", nome: "Gates de grafo (semanal; inclui job flips-pendentes)", cron: "0 6 * * 1", tetoHoras: 192 },
  { arquivo: "kf-gate-semantico.yml", nome: "KF gate semantico (semanal)", cron: "0 7 * * 1", tetoHoras: 192 },
  // Camada 3 do painel vital (Igor 2026-10-01): preso ao runner self-hosted —
  // se a máquina está off, o run não nasce e ESTE watchdog denuncia (26h).
  { arquivo: "e2e-db-probe.yml", nome: "Probe E2E DB do runner", cron: "10 9,21 * * *", tetoHoras: 26 },
  // P2 do painel vital (Igor 2026-10-01; sonda reescrita em node por
  // PATCH-HEALTH-SONDA-NODE-20261003): health de producao entre deploys.
  // Cadencia 6h -> teto 13h = 2 ciclos + folga de fila.
  { arquivo: "health-prod-probe.yml", nome: "Health prod probe (producao)", cron: "40 */6 * * *", tetoHoras: 13 },
  // FRAME-GATES-ROTINAS-DIARIAS-20261015: watchdog diario dos derivados
  // textuais (rastreabilidade, manifesto, indice do manifesto, pares) — dono
  // do frescor que sai dos gates per-PR. Mesmo teto do vetorial (26h).
  // TRANSITORIO: alvo novo pode ficar vermelho 1 ciclo ("sem run agendado")
  // se este job rodar (13:00 UTC) antes do primeiro cron 05:20 UTC pos-merge.
  { arquivo: "indices-textual-watchdog.yml", nome: "Indices textual watchdog", cron: "20 5 * * *", tetoHoras: 26 },
  // FRAME-GATES-ROTINAS-DIARIAS-20261015: varredura diaria de CVE (npm audit
  // raiz+backend, lane light) — complemento do RUN_AUDITS por-diff no merge-gate.
  { arquivo: "audit-diario.yml", nome: "Audit diario de dependencias", cron: "10 12 * * *", tetoHoras: 26 },
];

/** Teto default (horas) quando o chamador nao passa --dias-max e o alvo nao declara teto. */
const TETO_PADRAO_HORAS = 26;

/**
 * CAMADA 2 -- duracao anormal (plano-lane-light-resiliencia-v2, Igor 2026-10-06).
 *
 * O teto por cron acima so detecta SILENCIO (ultimo sucesso antigo). Um run que
 * PENDURA horas em execucao/fila num runner self-hosted nao viola esse teto:
 * em 2026-10-05 o checkout do runner light travou 9h08min (timeout-minutes nao
 * mordeu) e a fila inteira de PRs parou -- invisivel a este watchdog.
 *
 * Esta camada varre runs de QUALQUER evento dos workflows de lane light/fila e
 * denuncia os que estourarem o teto de duracao DE PAREDE (created_at ->
 * updated_at: fila + execucao). Teto 360min (6h) = 2x o pior pico de fila
 * medido em dia normal/sobrecarregado (4h16 no backup de 2026-10-05) e ainda
 * pega a classe wedge (9h08m, 551m). Janela de 48h: wedge novo e acionavel;
 * run antigo ja eh historico conhecido, nao vira ruido eterno.
 */
const ALVOS_EXECUCAO = [
  { arquivo: "gates-grafo.yml", tetoExecucaoMin: 360 },
  { arquivo: "postgres-backup-diario.yml", tetoExecucaoMin: 360 },
  { arquivo: "kf-gate-semantico.yml", tetoExecucaoMin: 360 },
  { arquivo: "e2e-db-probe.yml", tetoExecucaoMin: 360 },
  // fila-merge.yml REMOVIDO dos alvos: condenado e apagado do repo
  // [FRAME-FIM-FILA-EAGER-20261006 E2]; monitorar workflow inexistente =
  // falso vermelho eterno (jobs-vivacidade vermelho estrutural desde o
  // aposentamento — mesma doutrina dos alvos removidos em 2d8de871).
  { arquivo: "deploy.yml", tetoExecucaoMin: 360 },
  { arquivo: "backup-restore-drill.yml", tetoExecucaoMin: 360 },
  { arquivo: "sessao-disciplina.yml", tetoExecucaoMin: 360 },
  { arquivo: "sonda-gate-fold.yml", tetoExecucaoMin: 360 },
  { arquivo: "sonda-semantica-docs.yml", tetoExecucaoMin: 360 },
  // FRAME-GATES-ROTINAS-DIARIAS-20261015: novos workflows de lane light —
  // mesmo teto de execucao dos demais (checkout LFS + npm ci no textual).
  { arquivo: "indices-textual-watchdog.yml", tetoExecucaoMin: 360 },
  { arquivo: "audit-diario.yml", tetoExecucaoMin: 360 },
];

/** Janela (horas) de runs considerados na camada de duracao. */
const JANELA_EXECUCAO_HORAS = 48;

/**
 * Ultimo run da lista (ordem da API: mais recente primeiro) com
 * event=schedule e conclusion=success. Pura -- nao faz IO.
 * Lista vazia / sem success agendado -> null.
 */
function selecionarUltimoSucesso(runs) {
  if (!Array.isArray(runs)) return null;
  for (const run of runs) {
    const evento = run && run.event;
    const conclusao = run && run.conclusion;
    if (evento === "schedule" && conclusao === "success") return run;
  }
  return null;
}

/** Run mais recente da lista (qualquer evento/conclusao) -- diagnostico. */
function selecionarUltimoRun(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return null;
  return runs[0];
}

/** Idade em horas de um run (por created_at) em relacao a `agoraMs`. null se sem data. */
function idadeHoras(run, agoraMs) {
  const criado = run && run.created_at;
  if (!criado) return null;
  const ts = Date.parse(criado);
  if (Number.isNaN(ts)) return null;
  return Math.round(((agoraMs - ts) / 3600000) * 10) / 10;
}

/** Duracao de parede do run em minutos (created_at -> updated_at). null se sem datas uteis. */
function duracaoMinutos(run) {
  if (!run || !run.created_at || !run.updated_at) return null;
  const inicio = Date.parse(run.created_at);
  const fim = Date.parse(run.updated_at);
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  return Math.round(((fim - inicio) / 60000) * 10) / 10;
}

/**
 * Camada 2: runs que estouraram o teto de duracao dentro da janela. PURA.
 * Entrada: runs de QUALQUER evento (ordem da API) + instante de referencia.
 * Saida: lista de ofensores { id, event, conclusion, duracaoMinutos, html_url },
 * mais longos primeiro. Sem runs uteis -> lista vazia (camada 1 cuida do silencio).
 */
function avaliarDuracao({ runs, agoraMs, tetoExecucaoMin, janelaHoras }) {
  const ofensores = [];
  if (!Array.isArray(runs)) return ofensores;
  const limiteJanelaMs = (janelaHoras || JANELA_EXECUCAO_HORAS) * 3600000;
  for (const run of runs) {
    const criado = run && run.created_at ? Date.parse(run.created_at) : NaN;
    if (!Number.isFinite(criado) || agoraMs - criado > limiteJanelaMs) continue;
    const dur = duracaoMinutos(run);
    if (dur !== null && dur > tetoExecucaoMin) {
      ofensores.push({
        id: run.id || null,
        event: run.event || null,
        conclusion: run.conclusion || run.status || null,
        duracaoMinutos: dur,
        html_url: run.html_url || null,
        created_at: run.created_at || null,
      });
    }
  }
  ofensores.sort((a, b) => b.duracaoMinutos - a.duracaoMinutos);
  return ofensores;
}

/**
 * Avalia a vivacidade de cada alvo. PURA (recebe os runs ja buscados).
 * Entrada:
 *   alvos          -- lista de { arquivo, nome, tetoHoras }
 *   runsPorArquivo -- mapa arquivo -> array de runs (API)
 *   agoraMs        -- instante de referencia
 *   tetoGlobalHoras-- opcional: sobrepoe o teto de TODOS os alvos
 * Saida: lista de veredictos { arquivo, nome, ok, motivo, idadeHoras, ultimoSucesso, ultimoRun }
 */
function avaliarVivacidade({ alvos, runsPorArquivo, agoraMs, tetoGlobalHoras }) {
  const veredictos = [];
  for (const alvo of alvos) {
    const runs = runsPorArquivo ? runsPorArquivo[alvo.arquivo] : null;
    const teto = typeof tetoGlobalHoras === "number" ? tetoGlobalHoras : (alvo.tetoHoras || TETO_PADRAO_HORAS);
    const sucesso = selecionarUltimoSucesso(runs);
    const ultimoRun = selecionarUltimoRun(runs);
    const idade = idadeHoras(sucesso, agoraMs);

    let ok = true;
    let motivo;
    if (!Array.isArray(runs) || runs.length === 0) {
      ok = false;
      motivo = "sem run agendado na historia retornada pela API";
    } else if (!sucesso) {
      ok = false;
      motivo = "nenhum run agendado com SUCESSO na historia retornada";
    } else if (idade === null) {
      ok = false;
      motivo = "run de sucesso sem created_at parseavel";
    } else if (idade > teto) {
      ok = false;
      motivo = "ultimo sucesso ha " + idade + "h (teto " + teto + "h)";
    } else {
      motivo = "ultimo sucesso ha " + idade + "h (teto " + teto + "h)";
    }

    veredictos.push({
      arquivo: alvo.arquivo,
      nome: alvo.nome,
      tetoHoras: teto,
      ok: ok,
      motivo: motivo,
      idadeHoras: idade,
      ultimoSucesso: sucesso
        ? { created_at: sucesso.created_at, html_url: sucesso.html_url || null }
        : null,
      ultimoRun: ultimoRun
        ? { event: ultimoRun.event || null, conclusion: ultimoRun.conclusion || null, created_at: ultimoRun.created_at || null, status: ultimoRun.status || null }
        : null,
    });
  }
  return veredictos;
}

/** Relatorio textual ASCII (uma linha por alvo) + resumo. Pura. */
function formatarRelatorio(veredictos, agoraMs) {
  const linhas = [];
  linhas.push("=== vivacidade de jobs agendados (" + new Date(agoraMs).toISOString() + ") ===");
  for (const v of veredictos) {
    linhas.push(
      (v.ok ? "[OK] " : "[FALHA] ") + v.arquivo + " -- " + v.nome + " :: " + v.motivo
    );
    if (v.ultimoSucesso && v.ultimoSucesso.created_at) {
      linhas.push("        ultimo sucesso: " + v.ultimoSucesso.created_at + (v.ultimoSucesso.html_url ? " | " + v.ultimoSucesso.html_url : ""));
    }
    if (v.ultimoRun) {
      linhas.push(
        "        ultimo run agendado: event=" + (v.ultimoRun.event || "?") + " conclusion=" + (v.ultimoRun.conclusion || v.ultimoRun.status || "?") + " created_at=" + (v.ultimoRun.created_at || "?")
      );
    }
  }
  const estourados = veredictos.filter((v) => !v.ok);
  linhas.push(
    estourados.length === 0
      ? "\nResultado: " + veredictos.length + " alvo(s) vivos. Nenhum job agendado em silencio."
      : "\nResultado: " + estourados.length + " de " + veredictos.length + " alvo(s) ESTOURADO(S) -- alerta visivel, nunca silencioso."
  );
  return linhas.join("\n");
}

/**
 * Busca os runs AGENDADOS de UM workflow na API do GitHub (read-only).
 *
 * O filtro `event=schedule` VAI NA API de proposito: workflows que tambem
 * rodam em push/PR (gates-grafo, kf-gate-semantico) inundam a historia
 * recente — sem o filtro, um cron semanal que nunca rodou ficaria invisivel
 * atras de dezenas de runs de push, e o alvo saudavel pareceria estourado.
 *
 * Erro de rede/HTTP vira excecao com mensagem clara (o chamador decide o exit).
 */
async function buscarRuns({ repo, token, arquivo, fetchImpl, porPagina, evento }) {
  const n = typeof porPagina === "number" ? porPagina : 20;
  // evento="schedule" (default, compat com camada 1) filtra cron; evento="" ou
  // null = TODOS os eventos (usado pela camada de duracao, que precisa enxergar
  // runs de PR/push).
  const eventoAlvo = evento === undefined ? "schedule" : evento;
  const filtroEvento = eventoAlvo ? "?event=" + encodeURIComponent(eventoAlvo) + "&" : "?";
  const url = API + "/repos/" + repo + "/actions/workflows/" + arquivo + "/runs" + filtroEvento + "per_page=" + n;
  const doFetch = fetchImpl || globalThis.fetch;
  const resposta = await doFetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lila-vivacidade-watchdog",
    },
  });
  if (!resposta || !resposta.ok) {
    const status = resposta ? resposta.status : "sem-resposta";
    throw new Error("GitHub API " + arquivo + " -> HTTP " + status);
  }
  const corpo = await resposta.json();
  return Array.isArray(corpo && corpo.workflow_runs) ? corpo.workflow_runs : [];
}

/** Parser minimo de flags (sem dependencia nova, nao-interativo). */
function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const saida = { json: false, diasMax: null, repo: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") saida.json = true;
    else if (arg === "--dias-max") {
      const bruto = args[i + 1];
      i += 1;
      const valor = Number(bruto);
      if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error("--dias-max exige um numero > 0 (recebido: " + String(bruto) + ")");
      }
      saida.diasMax = valor;
    } else if (arg === "--repo") {
      saida.repo = args[i + 1] || null;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      saida.help = true;
    } else {
      throw new Error("flag desconhecida: " + arg);
    }
  }
  return saida;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(
      "uso: node scripts/verificar-vivacidade-jobs.cjs [--json] [--dias-max N] [--repo owner/nome]\n" +
        "env: GITHUB_TOKEN (ou GH_TOKEN) e GITHUB_REPOSITORY (ou --repo)\n"
    );
    return 0;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const repo = opts.repo || process.env.GITHUB_REPOSITORY || "";
  if (!token) {
    process.stderr.write("[vivacidade] ERRO: GITHUB_TOKEN (ou GH_TOKEN) ausente -- sem token nao ha consulta (falha explicita, nunca silenciosa)\n");
    return 2;
  }
  if (!repo || repo.indexOf("/") === -1) {
    process.stderr.write("[vivacidade] ERRO: repositorio alvo ausente -- use GITHUB_REPOSITORY=owner/nome ou --repo owner/nome\n");
    return 2;
  }

  const agoraMs = Date.now();
  const runsPorArquivo = {};
  const erros = [];
  for (const alvo of ALVOS) {
    try {
      runsPorArquivo[alvo.arquivo] = await buscarRuns({ repo: repo, token: token, arquivo: alvo.arquivo });
    } catch (err) {
      erros.push(alvo.arquivo + ": " + (err && err.message ? err.message : String(err)));
      runsPorArquivo[alvo.arquivo] = null;
    }
  }

  const veredictos = avaliarVivacidade({
    alvos: ALVOS,
    runsPorArquivo: runsPorArquivo,
    agoraMs: agoraMs,
    tetoGlobalHoras: opts.diasMax === null ? undefined : opts.diasMax * 24,
  });

  // Camada 2 (duracao anormal): runs de QUALQUER evento na janela, por workflow
  // de lane light/fila. Erro de consulta aqui tambem e falha (fail-loud).
  const execucao = [];
  for (const alvo of ALVOS_EXECUCAO) {
    let runsTodos = null;
    try {
      runsTodos = await buscarRuns({ repo: repo, token: token, arquivo: alvo.arquivo, porPagina: 50, evento: "" });
    } catch (err) {
      erros.push("execucao/" + alvo.arquivo + ": " + (err && err.message ? err.message : String(err)));
    }
    const ofensores = avaliarDuracao({
      runs: runsTodos,
      agoraMs: agoraMs,
      tetoExecucaoMin: alvo.tetoExecucaoMin,
    });
    if (ofensores.length > 0) {
      execucao.push({ arquivo: alvo.arquivo, tetoExecucaoMin: alvo.tetoExecucaoMin, ofensores: ofensores });
    }
  }

  const houveFalhaDeConsulta = erros.length > 0;
  const estourados = veredictos.filter((v) => !v.ok);
  const ok = !houveFalhaDeConsulta && estourados.length === 0 && execucao.length === 0;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ ok: ok, checadoEm: new Date(agoraMs).toISOString(), repo: repo, veredictos: veredictos, execucao: execucao, erros: erros }) + "\n"
    );
  } else {
    process.stdout.write(formatarRelatorio(veredictos, agoraMs) + "\n");
    if (execucao.length > 0) {
      process.stdout.write("\n=== duracao anormal (camada 2 -- teto de parede, fila incluida) ===\n");
      for (const item of execucao) {
        for (const o of item.ofensores) {
          process.stdout.write(
            "[FALHA] execucao: " + item.arquivo + " -- run " + o.id + " durou " + o.duracaoMinutos + "m (teto " + item.tetoExecucaoMin + "m) event=" + (o.event || "?") + (o.html_url ? " | " + o.html_url : "") + "\n"
          );
        }
      }
    } else {
      process.stdout.write("\n[CAMADA 2] duracao anormal: nenhum run acima do teto na janela de " + JANELA_EXECUCAO_HORAS + "h.\n");
    }
    for (const erro of erros) process.stdout.write("[FALHA] consulta: " + erro + "\n");
  }

  return ok ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((err) => {
      process.stderr.write("[vivacidade] ERRO inesperado: " + (err && err.message ? err.message : String(err)) + "\n");
      process.exitCode = 1;
    });
}

module.exports = {
  ALVOS,
  ALVOS_EXECUCAO,
  JANELA_EXECUCAO_HORAS,
  TETO_PADRAO_HORAS,
  selecionarUltimoSucesso,
  selecionarUltimoRun,
  idadeHoras,
  duracaoMinutos,
  avaliarVivacidade,
  avaliarDuracao,
  formatarRelatorio,
  buscarRuns,
  parseArgs,
  main,
};
