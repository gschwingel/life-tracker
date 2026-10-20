#!/usr/bin/env node
// scripts/pre-push.cjs — gate local antes do push (custo zero).
// Valida integridade de ledgers + grafo + lint + typecheck para não abrir PR
// quebrado. NÃO roda test:ci/E2E (responsabilidade do PR Gate no CI).
// Não-interativo (sem TTY).
// FR-GRAFO-T6: valida a integridade do grafo ativo (referências + schema +
// código→grafo). ERRO bloqueia o push; WARNING não.
// FRAME-GATES-ROTINAS-DIARIAS-20261015 (D5): o ex-PASS.1 (check de índices via
// indicesNecessário, C5 2026-09-11) FOI REMOVIDO — o frescor dos índices é do
// watchdog textual diário (indices-textual-watchdog.yml, entrega por PR com
// required checks) e nenhum gate por-PR reprova mais staleness. Detecção em
// sessão segue viva pelo trigger C6 (FDV-EXEC): consumiu stale -> regenera
// on-demand (npm run indices). "--indices-only" deixou de existir.
"use strict";

const { execSync, spawnSync } = require("node:child_process");
const path = require("node:path");

/** Gatilho do item 5 do checklist (docs/TESTING.md): código ou config no diff. */
const RE_LOTE = {
  codigo: /^(src\/|backend\/src\/|scripts\/|[^/]+\.cjs$)/,
  config: /^(package\.json|package-lock\.json|tsconfig.*\.json|vitest\.config\.[jt]s|eslint\.config\.[jt]s|playwright\.config\.[jt]s|\.github\/workflows\/.*\.ya?ml|backend\/package\.json|backend\/package-lock\.json|backend\/tsconfig\.json|backend\/vitest\.config\.[jt]s)$/,
};

/**
 * Decide se o gate de lote deve rodar para a base do push. PURO (tabela de teste):
 *  - base indeterminada -> roda (diff não confiável)
 *  - diff com código/config -> roda (item 5 do checklist)
 *  - docs-only/índices-only -> dispensado
 */
function decideLoteGate({ base, arquivos }) {
  if (!base) return { rodar: true, motivo: "base do push indeterminada (sem upstream/origin)" };
  if (!Array.isArray(arquivos)) return { rodar: true, motivo: "diff indisponível (falha de detecção nunca pula gate)" };
  const tocou = arquivos.filter((f) => RE_LOTE.codigo.test(f) || RE_LOTE.config.test(f));
  if (tocou.length > 0) return { rodar: true, motivo: `diff toca código/config (${tocou.length} arquivo(s): ${tocou.slice(0, 3).join(", ")}${tocou.length > 3 ? "…" : ""})` };
  if (arquivos.length === 0) return { rodar: false, motivo: "nenhum arquivo no diff (nada a validar no lote)" };
  return { rodar: false, motivo: "diff docs-only/índices-only (sem código/config)" };
}

/** Arquivos do diff da base do push até HEAD + working tree (mesma semântica do select-tests). */
function diffArquivosDesde(base) {
  if (!base) return null;
  try {
    const set = new Set();
    const add = (out) => {
      for (const l of String(out || "").split("\n")) {
        const f = l.trim();
        if (f) set.add(f);
      }
    };
    add(spawnSync("git", ["--no-pager", "diff", "--name-only", `${base}..HEAD`], { cwd: ROOT, encoding: "utf8" }).stdout);
    add(spawnSync("git", ["--no-pager", "diff", "--name-only"], { cwd: ROOT, encoding: "utf8" }).stdout);
    add(spawnSync("git", ["--no-pager", "diff", "--cached", "--name-only"], { cwd: ROOT, encoding: "utf8" }).stdout);
    return [...set].sort();
  } catch {
    return null;
  }
}

/** Orquestra a decisão do gate de lote. PURA (tabela de teste). */
function diffTocaCodigoDesde(base, deps = {}) {
  const arquivos = deps.arquivos !== undefined ? deps.arquivos : diffArquivosDesde(base);
  return decideLoteGate({ base, arquivos });
}

const ROOT = path.resolve(__dirname, "..");

const GATES_GRAFO = [
  { label: "grafo: referências do universo consolidado (T2)", args: ["scripts/validar-referencias-grafo.cjs"] },
  { label: "grafo: lint de schema de campos (T3)", args: ["scripts/validar-referencias-grafo.cjs", "--schema"] },
  { label: "grafo: código→grafo (T5)", args: ["scripts/verificar-codigo-grafo.cjs"] }
];

// ── C5: check condicional de índices no pre-push ─────────────────────────────
// Base do push: a ref remota de destino. `@{push}` cobre o upstream configurado;
// sem upstream, origin/HEAD (default branch do remoto). Sem nenhuma das duas
// (clone novo/branch órfã) o diff é INDETERMINÁVEL -> o check roda.
function resolvePushBase() {
  const gitQuiet = (args) => {
    const r = spawnSync("git", ["--no-pager", ...args], { cwd: ROOT, encoding: "utf8" });
    return r.status === 0 ? String(r.stdout || "").trim() : null;
  };
  const push = gitQuiet(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{push}"]);
  if (push && push !== "@{push}") return push;
  const originHead = gitQuiet(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (originHead) return originHead;
  const originMain = gitQuiet(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"]);
  return originMain ? "refs/remotes/origin/main" : null;
}

/**
 * Executa os gates de grafo (env permite fixtures nos testes).
 * Retorna a lista de gates com falha (vazio = push liberado no critério grafo).
 */
function runGrafoGates(env) {
  const falhas = [];
  for (const gate of GATES_GRAFO) {
    process.stdout.write(`[pre-push] ${gate.label}...\n`);
    const r = spawnSync(process.execPath, gate.args.map((a) => path.join(ROOT, a)), {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ...env }
    });
    if (r.status !== 0) {
      if (r.stdout) process.stdout.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      falhas.push(gate.label);
    }
  }
  return falhas;
}

/**
 * Executa o gate de lote 1× por push quando a faixa o exigir (HB-009).
 * Critério: item 5 do checklist de smoke (docs/TESTING.md) — `gate-lote` no
 * encerramento do lote. Roda quando o diff da base do push toca `src/**`,
 * `backend/src/**`, `scripts/**` ou config (mesmo gatilho do item 3 do
 * checklist), nunca em push docs-only. NUNCA muta arquivos: falha = bloqueia
 * o push e aponta `node scripts/gate-lote.cjs`. Dependências injetáveis.
 */ function runLoteGate(deps = {}) {
  const base = (deps.resolveBase || resolvePushBase)();
  const decideLoteFn = deps.diffTocaCodigo || diffTocaCodigoDesde;
  const decisaoLote = decideLoteFn(base);
  if (!decisaoLote.rodar) {
    process.stdout.write(`[pre-push] lote: gate dispensado — ${decisaoLote.motivo}\n`);
    return true;
  }
  process.stdout.write(`[pre-push] lote: verificando (gate-lote 1× por push) — ${decisaoLote.motivo}\n`);
  const runLote = deps.runLote || (() => spawnSync(process.execPath, [path.join(ROOT, "scripts", "gate-lote.cjs")], { cwd: ROOT, encoding: "utf8" }));
  const r = runLote();
  if (r.status === 0) return true;
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.stderr.write(
    "\n[pre-push] FALHA — gate de lote reprovou (item 5 do checklist docs/TESTING.md).\n" +
      "[pre-push] Correção canônica (explícita, sem mutação pelo hook): node scripts/gate-lote.cjs\n"
  );
  return false;
}

/**
 * Gate de integridade dos ledgers append-only (RESTAURACAO-BACKLOG-HB-20260922:
 * 86627f2a apagou 14 entradas do backlog de hardening por reescrita integral).
 * Critério vive no script (funções puras testadas); aqui é só invocação
 * bloqueante — exit != 0 (violação OU erro de ambiente) bloqueia o push.
 */
function runLedgersGate(deps = {}) {
  const spawn = deps.spawn || ((args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" }));
  const r = spawn([path.join(ROOT, "scripts", "validar-ledgers.cjs")]);
  if (r.status === 0) return true;
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.stderr.write(
    "[pre-push] FALHA — integridade de ledger append-only (ver scripts/validar-ledgers.cjs).\n"
  );
  return false;
}

function run(label, cmd, cwd = ROOT) {
  process.stdout.write(`[pre-push] ${label}...\n`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

if (require.main === module) {
  try {
    if (!runLedgersGate()) process.exit(1);
    if (!runLoteGate()) process.exit(1);
    run("lint (eslint)", "npm run lint");
    run("typecheck frontend (app)", "npx tsc --noEmit -p tsconfig.app.json");
    run("typecheck frontend (node)", "npx tsc --noEmit -p tsconfig.node.json");
    run("typecheck backend", "npx tsc --noEmit", path.join(ROOT, "backend"));
    const falhasGrafo = runGrafoGates();
    if (falhasGrafo.length) {
      process.stderr.write("[pre-push] FALHA — ERRO(s) no grafo ativo bloqueiam o push: " + falhasGrafo.join(" | ") + "\n");
      process.exit(1);
    }
    process.stdout.write("[pre-push] OK — gate local passou.\n");
  } catch {
    process.stderr.write("[pre-push] FALHA — corrija antes de fazer push.\n");
    process.exit(1);
  }
}

module.exports = { runGrafoGates, GATES_GRAFO, runLedgersGate, runLoteGate, decideLoteGate, diffTocaCodigoDesde, resolvePushBase };

