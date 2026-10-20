#!/usr/bin/env node
/**
 * scripts/verificar-disciplina-sessao.cjs
 * FR-SESSAO-ISOLADA-WORKTREE-20260921 -- SP-GUARDS-VALIDADORES / KF-FERRAMENTAS.
 * Guarda da 7ª camada (decisão Igor 2026-09-21): re-leitura de estado fresco é
 * default estrutural. Doc canônico: docs/FLUXO-SESSAO-ISOLADA.md.
 *
 * NATUREZA NÃO-BLOQUEANTE: exit 0 SEMPRE com varredura concluída — alerta
 * visível no stdout, veredito e limpeza são humanos (mesma natureza de
 * flips-pendentes; promoção a required check é decisão humana
 * futura). DELIBERADAMENTE NÃO há branch protection no GitHub (decisão Igor,
 * 2026-09-21: "não vamos mexer na configuração do github") — a detecção de
 * push direto é o substituto por alerta.
 *
 * ACHADOS QUE A GUARDA PROCURA
 * 1. push-direto — commits na origin/main (sem merges) DO DESDE DA CANONIZAÇÃO
 *    (padrão: 2026-09-21, data da aprovação deste fluxo; flag --desde=YYYY-MM-DD)
 *    cujo assunto NÃO termina com "(#NNN)": todo commit legítimo da main nasce
 *    de PR squash-merged com o número no assunto. O histórico ANTERIOR ao desde
 *    é fóssil (era pré-PR do repo, milhares de commits diretos) e fica fora —
 *    mesma isenção do grafo-historico. Commit novo direto na main = execução
 *    fora do fluxo de sessão/PR.
 * 2. worktree-orfa — worktree local cuja branch já está 100% mergeada na
 *    origin/main: trabalho incorporado, sessão não descartada (o DESCARTE é
 *    fase do ritual; o lixo de sessão é estado velho esperando confundir uma
 *    IA futura).
 * 3. sessao-base-desalinhada — o cwd é uma sessão com .sessao.json cuja base
 *    (GATE-BASE) NÃO é ancestral do HEAD atual: a sessão foi rebasada/resetada
 *    sem re-abertura — o fato gravado e o estado real divergem.
 * 4. sessao-abandonada (FRAME-LACO-ESTADO-20261002, decisão Igor 2026-10-02) —
 *    worktree NÃO-mergeada + dirty (trabalho não commitado) + último commit da
 *    branch com mais de DIAS_ABANDONO_PADRAO dias: decisão cristalizada como
 *    rascunho numa sessão morta — a metade descoberta do save-point (a
 *    recuperação é humana: abrir sessão naquela branch e consolidar).
 *    Clean ou recente NÃO é achado (trabalho commitado é recuperável).
 *
 * SAÍDA
 * Uma linha por achado: "ACHADO | <tipo> | <detalhe>". Resumo ao fim.
 * Exit 0 com varredura concluída; exit 2 falha de infraestrutura (git
 * indisponível, histórico ausente) — falha explícita, nunca silenciosa.
 *
 * USO
 *   node scripts/verificar-disciplina-sessao.cjs   (local: varre tudo)
 *   --desde=YYYY-MM-DD  (push-direto: limite histórico; default canonização)
 *   --dias=N            (sessao-abandonada: idade do último commit; default 7)
 *   (CI: roda no job sessao-disciplina com fetch-depth: 0 — só o check 1/3)
 * Env de teste: LILA_SESSAO_ROOT (raiz), injeção de git nos testes.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RE_PUSH_DIRETO = /\(#\d+\)\s*$/;
// Desde da canonização do fluxo (decisão Igor 2026-09-21): a vigilância vale
// para commits novos; o histórico anterior é fóssil da era pré-PR.
const DESDE_PADRAO = "2026-09-21";
// Abandono de sessão (FRAME-LACO-ESTADO-20261002): valor da sugestão aprovada
// ("Vamos seguir com sua sugestão", Igor 2026-10-02). Override: --dias=N.
const DIAS_ABANDONO_PADRAO = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** git real. */
function gitReal(args, cwd) {
  const { execFileSync } = require("child_process");
  return execFileSync("git", ["--no-pager", ...args], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/**
 * Classifica commits da main. Pura.
 * commits: [{ hash, assunto }] (sem merges). Merge-squash legítimo termina com
 * "(#NNN)"; o resto é push direto.
 */
function classificarCommits(commits) {
  const achados = [];
  for (const c of commits || []) {
    if (!c || !c.hash) continue;
    if (!RE_PUSH_DIRETO.test(c.assunto || "")) {
      achados.push({ tipo: "push-direto", detalhe: c.hash.slice(0, 8) + " " + (c.assunto || "").slice(0, 70) });
    }
  }
  return achados;
}

/**
 * Classifica worktrees. Pura.
 * entries: [{ caminho, head, branch|null, principal }] na ordem do porcelain.
 * estadoSessao(branch) → { merged, dirty, ultimoCommitTs? }: merged = branch
 * contida na origin/main; dirty = a sessão tem trabalho não commitado;
 * ultimoCommitTs = %ct do último commit da branch (quando disponível).
 * Regras: branch "main" nunca é achado; sessão limpa+mergeada = órfã
 * (descartar); sessão mergeada mas SUJA = alerta separado (descartar perderia
 * trabalho não commitado — veredito humano); NÃO-mergeada + SUJA + último
 * commit mais velho que diasAbandono = sessao-abandonada (decisão em risco —
 * FRAME-LACO-ESTADO-20261002). agoraMs injetável para teste.
 */
function classificarWorktrees(entries, estadoSessao, agoraMs = Date.now(), diasAbandono = DIAS_ABANDONO_PADRAO) {
  const achados = [];
  for (const w of entries || []) {
    if (!w || w.principal || !w.branch) continue;
    if (w.branch === "main") continue; // worktree vinculada na main — nunca é sessão
    let estado;
    try { estado = estadoSessao(w.branch, w.caminho) || {}; } catch { estado = {}; }
    const merged = !!estado.merged;
    const dirty = !!estado.dirty;
    if (merged && dirty) {
      achados.push({ tipo: "worktree-mergeada-suja", detalhe: w.caminho + " (" + w.branch + " já mergeada MAS com trabalho não commitado — commit ou descarte consciente)" });
    } else if (merged) {
      achados.push({ tipo: "worktree-orfa", detalhe: w.caminho + " (" + w.branch + " já mergeada e limpa — descartar)" });
    } else if (dirty && Number.isFinite(estado.ultimoCommitTs)) {
      const dias = Math.floor((agoraMs - estado.ultimoCommitTs * 1000) / MS_POR_DIA);
      if (dias > diasAbandono) {
        achados.push({
          tipo: "sessao-abandonada",
          detalhe: w.caminho + " (" + w.branch + " não mergeada, trabalho não commitado, último commit há " + dias + " dias — decisão possivelmente não cristalizada; abrir sessão na branch e consolidar ou descartar consciente)",
        });
      }
    }
  }
  return achados;
}

/** Parseia `git worktree list --porcelain`. Pura. */
function parseWorktrees(saida) {
  const entries = [];
  let atual = null;
  let primeiro = true;
  for (const linha of String(saida).split(/\r?\n/)) {
    if (!linha.trim()) { if (atual) { entries.push(atual); atual = null; } continue; }
    const [chave, ...resto] = linha.split(" ");
    const valor = resto.join(" ");
    if (chave === "worktree") {
      if (atual) entries.push(atual);
      atual = { caminho: valor, head: null, branch: null, principal: primeiro };
      primeiro = false;
    } else if (atual && chave === "HEAD") atual.head = valor;
    else if (atual && chave === "branch") atual.branch = (valor || "").replace(/^refs\/heads\//, "");
  }
  if (atual) entries.push(atual);
  return entries;
}

/** Parseia `git log --format=%H|%s`. Pura. */
function parseLog(saida) {
  return String(saida).split(/\r?\n/).filter(Boolean).map((l) => {
    const i = l.indexOf("|");
    return { hash: l.slice(0, i), assunto: l.slice(i + 1) };
  });
}

function coletarAchados({ gitExec, repoRoot, desde = DESDE_PADRAO, diasAbandono = DIAS_ABANDONO_PADRAO }) {
  const achados = [];

  // 1. push-direto: history da origin/main DESDE a canonização (sem merges —
  //    o squash é o padrão). Histórico anterior é fóssil da era pré-PR.
  const log = gitExec(["log", "origin/main", "--no-merges", "--since=" + desde, "--format=%H|%s"], repoRoot);
  achados.push(...classificarCommits(parseLog(log)));

  // 2. worktree órfãs/abandonadas (relevantes no checkout local; em CI a lista é trivial).
  try {
    const lista = gitExec(["worktree", "list", "--porcelain"], repoRoot);
    const entries = parseWorktrees(lista);
    achados.push(...classificarWorktrees(entries, (branch, caminho) => {
      let merged;
      try { gitExec(["merge-base", "--is-ancestor", branch, "origin/main"], repoRoot); merged = true; }
      catch { merged = false; }
      let dirty;
      try { dirty = gitExec(["-C", caminho, "status", "--porcelain"], repoRoot).trim().length > 0; }
      catch { dirty = false; }
      let ultimoCommitTs;
      try { ultimoCommitTs = parseInt(gitExec(["log", "-1", "--format=%ct", branch], repoRoot).trim(), 10); }
      catch { ultimoCommitTs = NaN; }
      return { merged, dirty, ultimoCommitTs };
    }, Date.now(), diasAbandono));
  } catch (err) {
    if (!/not a git repository|fatal: this operation must be run in a work tree/i.test(String(err && err.message))) throw err;
  }

  // 3. .sessao.json do cwd: GATE-BASE deve ser ancestral do HEAD.
  const arquivoSessao = path.join(repoRoot, ".sessao.json");
  if (fs.existsSync(arquivoSessao)) {
    try {
      const sessao = JSON.parse(fs.readFileSync(arquivoSessao, "utf8"));
      if (sessao && sessao.base) {
        gitExec(["merge-base", "--is-ancestor", sessao.base, "HEAD"], repoRoot);
        // ancestral = alinhada; nada a reportar
      }
    } catch {
      achados.push({ tipo: "sessao-base-desalinhada", detalhe: ".sessao.json presente mas o GATE-BASE não é ancestral do HEAD (rebase/reset sem re-abertura)" });
    }
  }

  return achados;
}

function formatar(achados, origem) {
  const linhas = [];
  linhas.push("=== disciplina de sessão isolada (decisão Igor 2026-09-21 — 7ª camada IA-first) ===");
  if (achados.length === 0) linhas.push("Nenhum achado — disciplina de sessão íntegra.");
  for (const a of achados) linhas.push("ACHADO | " + a.tipo + " | " + a.detalhe);
  linhas.push("");
  linhas.push("Resultado: " + achados.length + " achado(s). Alerta NÃO-bloqueante (exit 0) — limpeza e veredito são humanos. `main` é PROTEGIDA desde 2026-09-26 (enforce_admins=false desde o veredito humano 2026-10-16: regime menos restritivo mantido — o dono PODE bypassar check vermelho; sessão/bot não têm caminho) + required checks; achados `push-direto` são leitura histórica ou override do dono registrado.");
  linhas.push("origem da varredura: " + origem);
  return linhas.join("\n");
}

function main(argv) {
  const args = (argv || []).slice();
  const desdeArg = args.find((a) => a.startsWith("--desde="));
  const diasArg = args.find((a) => a.startsWith("--dias="));
  const repoRoot = process.env.LILA_SESSAO_ROOT || process.cwd();
  try {
    const achados = coletarAchados({
      gitExec: gitReal,
      repoRoot,
      desde: desdeArg ? desdeArg.slice("--desde=".length) : DESDE_PADRAO,
      diasAbandono: diasArg ? parseInt(diasArg.slice("--dias=".length), 10) : DIAS_ABANDONO_PADRAO,
    });
    process.stdout.write(formatar(achados, repoRoot) + "\n");
    return 0; // exit 0 SEMPRE com varredura concluída — guarda não-bloqueante
  } catch (err) {
    process.stderr.write("[disciplina-sessao] ERRO: " + (err && err.message ? err.message : String(err)) + " — falha explícita, nunca silenciosa\n");
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { RE_PUSH_DIRETO, DESDE_PADRAO, DIAS_ABANDONO_PADRAO, classificarCommits, classificarWorktrees, parseWorktrees, parseLog, coletarAchados, formatar, main };
