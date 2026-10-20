#!/usr/bin/env node
// sonda-gate-rodar.cjs — driver do GATE REQUIRED da sonda semântica de docs
// (gatilho do fold — PATCH-20260926-003, deliberação Igor 2026-09-29).
// Gatilho: PR que toca doc AI-facing do escopo da gramática — DERIVADO do mesmo
// mecanismo da sentinela (verificar-pontos-cegos.cjs §7 − ISENCOES_IAIA, via
// arquivosGovernados()); nunca cópia WET (a lista hardcoded de 9 docs deixou o
// FLUXO-LANES.md nascer fora do gatilho — dívida PATCH-20261004-001, homeostase
// 2026-10-04).
// Para cada doc alterado: roda scripts/ai-readability-docs.cjs com
//   --doc <versão do PR>  --baseline <base-sha:path>  (versão pré-PR)
// e agrega o relatório.
// CONTRATO ÚNICO — ESTRITO (deliberação Igor 2026-09-29; detalhe em §VEREDITO
// abaixo): REPROVA → ::error + exit 1; AVISO → ::warning + exit 0.
// Entradas: --base-sha <sha> (base do PR — obrigatório no modo PR)
//           --doc <path> --baseline <ref> (modo manual: doc único, base arbitrária)
//           --skip-probe (NÃO roda LLM — só lista os docs alcançados; CI seco/teste)
// Saída: relatório JSON agregado no stdout + summary markdown.
// VEREDITO ESTRITO (deliberação Igor 2026-09-29): exit 1 = REPROVA (r1 Q+A < 0.60;
//   r2 2+ provas) — check vermelho; exit 0 = passou ou aviso (a2 sem baseline;
//   a3 sumarização isolada; a4 síntese isolada).
// CHECK REQUIRED (veredito humano Igor 2026-10-20 — promovido no painel):
//   REPROVA vira exit 1 e BLOQUEIA merge (required checks da main: merge-gate,
//   pr-gate, gates-grafo, manifest-frescor, sonda-gate).
//   a1 renovado: heartbeat-ping dos juízes ANTES das provas; juiz morto = exit 1
//   LOUD (gate required não pode pular em silêncio); falha individual de prova
//   por doc continua AVISO — a1 por-doc: falha de instrumento no doc não reprova
//   (heartbeat cobre o detector global).
// Sem node_modules: apenas node builtins + o irmão ai-readability-docs.cjs.
"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

// Escopo derivado — fonte ÚNICA é a sentinela §E (escopo governado §7 menos
// isenções). Require irmão seguro: verificar-pontos-cegos.cjs não executa nada
// no require (guard require.main) e não importa este arquivo (sem ciclo).
const { arquivosGovernados } = require("./verificar-pontos-cegos.cjs");

// ---------------------------------------------------------------------------
// Núcleo puro (exportado p/ testes offline)
// ---------------------------------------------------------------------------

/** Interseção dos arquivos alterados no diff com o escopo da gramática. */
function docsAlcancados(arquivosAlterados) {
  const escopo = new Set(arquivosGovernados());
  return arquivosAlterados.filter((f) => escopo.has(f));
}

/**
 * Veredito ESTRITO (deliberação Igor 2026-09-29 — o aviso verde virou olhos
 * fechados: fold com perda real já ocorreu, overrideFrozen 2→1 no #898).
 * REPROVA (exit 1, check REQUIRED desde o veredito Igor 2026-10-20 — bloqueia
 * merge; → a reprova por infra é SÓ o heartbeat de juiz, abaixo):
 *   r1 | Q+A < 0.60 — a prova DECISIVA de retenção (responder fatos lendo só o fold)
 *   r2 | 2+ provas falhando — sinal convergente de perda
 * NÃO REPROVA (aviso loud, exit 0 — gate required não pode reprovar por infra de
 * prova; sem baseline não há o que medir):
 *   a1 | sonda indisponível no doc (rede/credencial/parse) — a1 por-doc: falha de
 *        instrumento no doc não reprova (heartbeat cobre o detector global)
 *   a2 | doc novo sem baseline
 *   a3 | sumarização sozinha < 0.60 — variância do medidor provada na calibração N=4 (#933)
 *   a4 | edição sintética sozinha < 1.0 — suspeita, não condenação
 */
function decidirVeredito(rel) {
  if (rel.erro) return { veredito: "AVISO", motivo: "sonda indisponível: " + rel.erro };
  if (rel.skip) return { veredito: "AVISO", motivo: rel.motivo || "sem baseline — sondagem manual" };
  const c = rel.checks || {};
  const provas = [
    { nome: "sumarização", pass: !!(c.summarization && c.summarization.pass) },
    { nome: "Q+A", pass: !!(c.qaProbe && c.qaProbe.pass) },
    { nome: "edição sintética", pass: !!(c.syntheticEdits && c.syntheticEdits.pass) },
  ];
  const falhas = provas.filter((p) => !p.pass).map((p) => p.nome);
  const qaPass = provas[1].pass;
  if (!qaPass) {
    return { veredito: "REPROVA", motivo: "r1 — Q+A abaixo do piso (retenção " + (c.qaProbe ? c.qaProbe.retencao : "—") + " < 0.60): informação respondível foi perdida no fold" };
  }
  if (falhas.length >= 2) {
    return { veredito: "REPROVA", motivo: "r2 — sinal convergente (" + falhas.join(" + ") + " abaixo do piso)" };
  }
  if (falhas.length === 1) {
    return { veredito: "AVISO", motivo: "prova isolada abaixo do piso (" + falhas[0] + ") — variância conhecida do medidor; Q+A decisivo passou" };
  }
  return { veredito: "PASSA", motivo: "retenção integral nas 3 provas" };
}

/**
 * Heurística de fold: o diff REMOVE linhas de prosa (>=60 chars, fora de
 * bullet/tabela/heading/quote/fence). Serve para ANOTAR o run (fold detectado
 * vs edição simples) — a retenção em si quem mede são as provas da sonda.
 */
function detectarFold(diffTexto) {
  const linhas = String(diffTexto).split(/\r?\n/);
  let removidas = 0;
  let emFence = false;
  for (const l of linhas) {
    // Marcador de diff removido antes de tudo: fence e estruturais são
    // avaliados no CORPO da linha (contexto " ", remoção "-", adição "+").
    const removida = /^-/.test(l) && !/^---/.test(l);
    const corpo = /^[+-]/.test(l) && !/^(---|\+\+\+)/.test(l) ? l.slice(1) : l;
    if (/^```/.test(corpo)) { emFence = !emFence; continue; }
    if (emFence || !removida) continue;
    const ehEstrutural =
      /^\s*[-*+]\s/.test(corpo) || /^\s*#/.test(corpo) || /^[>|]/.test(corpo) ||
      (corpo.match(/\|/g) || []).length >= 3;
    if (!ehEstrutural && corpo.trim().length >= 60) removidas++;
  }
  return removidas;
}

/** Extrai o JSON agregado do stdout da sonda (JSON seguido de linha-resumo). */
function parseSaidaSonda(stdout) {
  const ini = stdout.indexOf("{");
  const fim = stdout.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error("saída da sonda sem JSON: " + stdout.slice(0, 120));
  return JSON.parse(stdout.slice(ini, fim + 1));
}

/** Linha markdown de 1 doc para o $GITHUB_STEP_SUMMARY (com veredito estrito). */
function linhaSummary(rel) {
  const c = rel.checks || {};
  const fmt = (v) => (typeof v === "number" ? v.toFixed(2) : String(v ?? "—"));
  const v = rel.veredito || (rel.pass ? "PASSA" : "REPROVA");
  const icone = v === "PASSA" ? "✅" : v === "AVISO" ? "⚠️" : "❌";
  return (
    "| " + rel.doc + " | " + rel.score + "/100 | " + icone + " " + v +
    " | " + fmt(c.summarization && c.summarization.retencao) +
    " | " + fmt(c.qaProbe && c.qaProbe.retencao) +
    " | " + fmt(c.syntheticEdits && c.syntheticEdits.accuracy) + " |"
  );
}

// ---------------------------------------------------------------------------
// Heartbeat dos juízes (a1-closure — veredito humano Igor 2026-10-20)
// ---------------------------------------------------------------------------
// Mesma fonte de defaults do irmão ai-readability-docs.cjs (FLAGS.llm1/llm2):
// env AI_READABILITY_LLM1/LLM2 com os modelos vigentes do juiz.
const JUIZ_LLM1 = process.env.AI_READABILITY_LLM1 || "openai/gpt-6-luna";
const JUIZ_LLM2 = process.env.AI_READABILITY_LLM2 || "deepseek/deepseek-v4.1-flash-1017";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const HEARTBEAT_TIMEOUT_MS = 30000;

/** Credencial DRY: env primeiro; senão o carregador exportado do irmão (.env). */
function credencialOpenRouter() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  // Require lazy: --skip-probe (modo seco) nunca carrega o irmão.
  return require("./ai-readability-docs.cjs").loadOpenRouterKey();
}

/**
 * Heartbeat barato: UMA chamada mínima ao MESMO endpoint OpenRouter dos juízes
 * (temperature 0, prompt "ping"), timeout 30s. NÃO lança — devolve
 * { vivo, erro }. falha aqui = juiz morto | lento | sem credencial.
 */
async function pingJuiz(model, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs || HEARTBEAT_TIMEOUT_MS;
  let apiKey = opts.apiKey;
  if (apiKey === undefined) {
    try {
      apiKey = credencialOpenRouter();
    } catch (err) {
      return { vivo: false, erro: "credencial indisponível: " + String(err && err.message ? err.message : err) };
    }
  }
  if (!apiKey) return { vivo: false, erro: "OPENROUTER_API_KEY ausente (env ou .env)" };
  if (typeof fetchImpl !== "function") return { vivo: false, erro: "fetch global ausente (exige Node 18+)" };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], temperature: 0 }),
      signal: ctl.signal,
    });
    if (!res || !res.ok) {
      let txt = "";
      try { txt = await res.text(); } catch { /* corpo ilegível: o status basta */ }
      return { vivo: false, erro: "OpenRouter HTTP " + (res && res.status) + " (" + model + "): " + String(txt).slice(0, 200) };
    }
    return { vivo: true, erro: null };
  } catch (err) {
    const abortado = !!(err && (err.name === "AbortError" || err.name === "TimeoutError")) || ctl.signal.aborted;
    return { vivo: false, erro: abortado ? "timeout " + timeoutMs + "ms (" + model + ")" : String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pinga os juízes em PARALELO. Juiz morto = fail LOUD (exit 1): o check é
 * required e não pode aprovar sem medir — ÚNICO caminho de reprova por infra.
 */
async function heartbeatJuizes(modelos, opts = {}) {
  const lista = Array.isArray(modelos) ? modelos : [];
  const resultados = await Promise.all(
    lista.map(async (model) => {
      try {
        return { model, ...(await pingJuiz(model, opts)) };
      } catch (err) {
        return { model, vivo: false, erro: String(err && err.message ? err.message : err) };
      }
    })
  );
  const mortos = resultados.filter((r) => !r.vivo);
  return {
    vivo: mortos.length === 0,
    resultados,
    mortos: mortos.map((r) => r.model),
    modeloMorto: mortos.length ? mortos[0].model : null,
    erro: mortos.length ? mortos[0].erro : null,
  };
}

module.exports = {
  escopoGramatica: arquivosGovernados,
  docsAlcancados,
  detectarFold,
  parseSaidaSonda,
  decidirVeredito,
  linhaSummary,
  pingJuiz,
  heartbeatJuizes,
  executar,
  JUIZ_LLM1,
  JUIZ_LLM2,
};

// ---------------------------------------------------------------------------
// Execução (CLI)
// ---------------------------------------------------------------------------

function args() {
  const f = { baseSha: null, doc: null, baseline: null, skipProbe: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--base-sha") f.baseSha = process.argv[++i];
    else if (a === "--doc") f.doc = process.argv[++i];
    else if (a === "--baseline") f.baseline = process.argv[++i];
    else if (a === "--skip-probe") f.skipProbe = true;
  }
  return f;
}

function gitDiffNomes(base) {
  return execFileSync("git", ["diff", "--name-only", base, "HEAD"], {
    cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  }).split(/\r?\n/).filter(Boolean);
}

function gitDiffTexto(base, doc) {
  return execFileSync("git", ["diff", base, "HEAD", "--", doc], {
    cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  });
}

function rodarSonda(doc, baseline) {
  const args = ["scripts/ai-readability-docs.cjs", "--doc", doc, "--baseline", baseline];
  const stdout = execFileSync("node", args, {
    cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  });
  return parseSaidaSonda(stdout);
}

async function executar(f, deps = {}) {
  let alvos;
  if (f.doc) {
    // Modo manual: doc único, fora do escopo também (diagnóstico ad hoc).
    alvos = [f.doc];
  } else {
    if (!f.baseSha) {
      console.error("sonda-gate-rodar: --base-sha obrigatório no modo PR (ou --doc/--baseline no modo manual).");
      return 2;
    }
    alvos = docsAlcancados(gitDiffNomes(f.baseSha));
  }

  if (alvos.length === 0) {
    console.log(JSON.stringify({ pr: f.baseSha, docs: [], falhas: 0, noOp: true }));
    console.log("\nSonda-gate: nenhum doc do escopo AI-facing alterado — no-op.");
    return 0;
  }

  if (f.skipProbe) {
    console.log(JSON.stringify({ pr: f.baseSha, docs: alvos.map((d) => ({ doc: d })), falhas: 0, skipProbe: true }));
    console.log("\nSonda-gate (--skip-probe): " + alvos.length + " doc(s) alcançado(s): " + alvos.join(", "));
    return 0;
  }

  // HEARTBEAT (a1-closure, veredito Igor 2026-10-20): ping dos DOIS juízes antes
  // das provas. Gate REQUIRED não pode aprovar sem medir — juiz morto = exit 1
  // LOUD. Este é o ÚNICO caminho de reprova por infraestrutura.
  const juizes = deps.juizes || [JUIZ_LLM1, JUIZ_LLM2];
  const hb = await heartbeatJuizes(juizes, { fetchImpl: deps.fetchImpl, apiKey: deps.apiKey });
  if (!hb.vivo) {
    console.error("::error::juiz " + hb.modeloMorto + " morto (heartbeat falhou): " + hb.erro);
    if (hb.mortos.length > 1) console.error("::error::juízes mortos (heartbeat falhou): " + hb.mortos.join(", "));
    return 1;
  }
  console.log("heartbeat ok: " + hb.resultados.map((r) => r.model).join(", "));

  const resultados = [];
  for (const doc of alvos) {
    const baseline = f.baseline || (f.baseSha ? f.baseSha + ":" + doc : null);
    if (!baseline) {
      resultados.push({ doc, score: null, pass: true, skip: true, ...decidirVeredito({ skip: true }), motivo: "sem baseline — sondagem manual futura" });
      continue;
    }
    let foldDetectado = 0;
    try { foldDetectado = f.baseSha ? detectarFold(gitDiffTexto(f.baseSha, doc)) : 0; } catch { /* diff indisponível — anotação zero */ }
    try {
      const rel = rodarSonda(doc, baseline);
      rel.doc = doc;
      rel.foldRemovidas = foldDetectado;
      rel.vereditoResultado = decidirVeredito(rel);
      rel.veredito = rel.vereditoResultado.veredito;
      rel.motivoVeredito = rel.vereditoResultado.motivo;
      resultados.push(rel);
    } catch (err) {
      // a1 por-doc: falha de instrumento no doc NÃO reprova (heartbeat cobre o
      // detector global) — declarada loud em AVISO + exit 0.
      const erroMsg = String(err.message).slice(0, 200);
      resultados.push({ doc, score: null, pass: true, erro: erroMsg, foldRemovidas: foldDetectado, veredito: "AVISO", motivoVeredito: "sonda indisponível: " + erroMsg });
      console.error("::warning::sonda indisponível para " + doc + ": " + String(err.message).slice(0, 120));
    }
  }

  const reprovados = resultados.filter((r) => r.veredito === "REPROVA");
  const avisos = resultados.filter((r) => r.veredito === "AVISO");
  const agregado = {
    pr: f.baseSha,
    docs: resultados,
    reprovados: reprovados.map((r) => r.doc),
    avisos: avisos.map((r) => r.doc),
    noOp: false,
    nota: "gate ESTRITO + REQUIRED (deliberação Igor 2026-09-29; promoção a required: veredito Igor 2026-10-20): REPROVA = r1 (Q+A < 0.60) ou r2 (2+ provas) → exit 1 e merge bloqueado; juiz morto no heartbeat = exit 1 (a1-closure, único caminho de reprova por infra); falha individual de prova no doc e doc sem baseline = aviso (a1 por-doc/a2); sumarização e síntese isoladas = aviso (a3/a4)",
  };
  console.log(JSON.stringify(agregado, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    const linhas = [
      "### Sonda semântica de docs (estrito)",
      "",
      "| Doc | Nota | Veredito | Sumarização | Q+A | Sintética |",
      "|---|---|---|---|---|---|",
      ...resultados.map(linhaSummary),
      "",
      "_REPROVA: Q+A < 0.60 (prova decisiva) ou 2+ provas abaixo do piso. Aviso isolado não reprova (variância do medidor — calibração #933). Juiz morto no heartbeat reprova (exit 1 — check required); infra de prova individual e doc sem baseline não reprovam._",
    ];
    require("fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join("\n") + "\n");
  }
  for (const r of avisos) {
    console.error("::warning::sonda semântica (" + r.doc + "): " + (r.motivoVeredito || "aviso") + " — não reprova");
  }
  for (const r of reprovados) {
    console.error("::error::sonda semântica ESTRITO (" + r.doc + "): " + r.motivoVeredito);
  }
  console.log("\nSonda-gate estrito: " + resultados.length + " doc(s) sondado(s), " + reprovados.length + " reprovado(s), " + avisos.length + " aviso(s).");
  return reprovados.length > 0 ? 1 : 0;
}

async function main() {
  process.exitCode = await executar(args());
}

if (require.main === module) main();
