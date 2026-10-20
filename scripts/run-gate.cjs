#!/usr/bin/env node
// scripts/run-gate.cjs
// Propósito: GATE ÚNICO de validação com paridade byte-a-byte com o CI
// (jobs pr-gate/merge-gate do pr-gate.yml) — mata a classe de falhas
// "verde local que é vermelho no CI" (drift de node_modules, browser do
// Playwright ausente, deps locais defasadas vs lockfile).
// Referência: saga CI 2026-09-03/04 — lint validou contra typescript-eslint
// defasado e deixou 2 erros vazarem; merge-gate falhou por Chromium ausente
// no runner SYSTEM; npm audit revelou highs que o lint local nunca viu.
//
// Uso:
//   node scripts/run-gate.cjs           # paridade pr-gate+merge-gate (sem E2E)
//   node scripts/run-gate.cjs --e2e     # + E2E gold (sobe/derruba backend local)
//
// POR QUE npm ci SEMPRE (nunca npm install / nunca reusa node_modules):
// o incidente de 2026-09-03 foi o node_modules LOCAL defasado mascarando erros
// que o lockfile (@typescript-eslint 8.58.0) já imporia. Paridade exige instalar
// do lockfile — é o que o CI faz.
//
// Regras (R-COMANDOS-NAO-INTERATIVOS): spawnSync determinístico, stdio inherit,
// fail-fast com resumo. Sem watch, sem pager, sem prompt.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const withE2e = process.argv.includes("--e2e");
const root = path.resolve(__dirname, "..");

// ── Skip doc-only (decisão humana Igor 2026-09-04) ───────────────────────────
// Fonte ÚNICA de classificação: o runner consome o plano JSON do select-tests.cjs
// (docs_only = tier 1, doc_gate = tier 2) — NUNCA reimplementa listas de paths.
// skip NÃO é evidência verde (R-EVIDENCIA-VALIDADE): cada skip grava 1 linha
// append-only em LILA-DEV/validacao/gate-skips.jsonl — nunca muta o evidence-json
// já validado de um lote (evidência é imutável e vinculada ao SHA).
// Conservador (E-INV-16): plano ausente/inválido/fullSuite -> gate integral.
function decideSkip(plan) {
  if (!plan || typeof plan !== "object") return "full";
  if (plan.fullSuite === true) return "full";
  if (plan.docs_only === true) return "doc-only";
  if (plan.doc_gate === true) return "doc-gate";
  return "full";
}

/** --base <ref> do chamador; ausente -> diff = working tree (commit avulso). */
function parseBase(argv) {
  const i = argv.indexOf("--base");
  if (i === -1) return null;
  const v = argv[i + 1];
  return v ? v : null;
}

/** Evidência de skip: 1 linha JSON append-only em LILA-DEV/validacao/gate-skips.jsonl. */
function recordSkip(kind, base, files) {
  const dir = path.join(root, "LILA-DEV", "validacao");
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    skip: kind,
    base: base || "working-tree",
    files,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/run-gate.cjs",
  });
  fs.appendFileSync(path.join(dir, "gate-skips.jsonl"), line + "\n");
}

module.exports = { decideSkip };

/** Roda um comando herdando stdio; shell:true é necessário no Windows (npm/npx). */
function step(name, command, opts = {}) {
  const t0 = Date.now();
  process.stdout.write(`\n▶ ${name}\n  $ ${command}\n`);
  const r = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...opts.env },
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`\n✖ FALHOU: ${name} (exit ${r.status ?? "?"} em ${dt}s)`);
    process.exit(r.status ?? 1);
  }
  console.log(`✔ ${name} — ${dt}s`);
}

const steps = [
  ["npm ci (raiz — paridade de lockfile com o CI)", "npm ci"],
  ["npm ci (backend)", "npm ci", { cwd: "backend" }],
  ["Lint (ESLint)", "npm run lint"],
  ["Typecheck frontend app", "npx tsc --noEmit -p tsconfig.app.json"],
  ["Typecheck frontend node", "npx tsc --noEmit -p tsconfig.node.json"],
  ["Typecheck backend", "npx tsc --noEmit", { cwd: "backend" }],
  ["Audits de dependência raiz + backend (paralelos; high/critical bloqueiam; retry 3x30s)", "node scripts/run-audits-parallel.cjs"],
  // DIETA (FRAME-DIETA-WIRING-20261007 D4): era `npm run test:ci`, que re-roda
  // `typecheck` (tsc app+node) já executado nos steps 4-5 acima. Composição
  // direta = mesmos checks, um tsc a menos por gate local (~30-60s).
  ["Suite crítica frontend (test:scripts + vitest)", "npm run test:scripts && npx vitest run"],
  ["Suite backend (vitest)", "npx vitest run", { cwd: "backend" }],
];

if (withE2e) {
  steps.push(
    ["Instala Chromium do Playwright (idempotente)", "npx playwright install chromium"],
    ["E2E gold G1-G3 (com backend local ativo)", 'npx playwright test --grep "@G1|@G2|@G3"', {
      env: { CI: "1" },
    }],
  );
}

function main() {
  // ── Check prévio de diff (fonte única: select-tests.cjs) ────────────────────
  // Sem --base: diff = working tree (staged+unstaged+untracked) — commit avulso.
  // Com --base <ref>: diff = <ref>..HEAD + working tree (contexto pós-commit).
  const base = parseBase(process.argv);
  const clsArgs = [path.join(__dirname, "select-tests.cjs"), "--json"];
  if (base) clsArgs.push("--base", base);
  const det = spawnSync(process.execPath, clsArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let plan = null;
  if (det.status === 0) {
    try {
      plan = JSON.parse(det.stdout);
    } catch {
      plan = null;
    }
  }
  if (plan === null) {
    console.error("[run-gate] classificador indisponível/inválido — fallback: gate integral");
  }
  const files = plan ? Number(plan.totalArquivosAlterados) || 0 : 0;
  const skip = decideSkip(plan);

  // Tier 1 — prosa .md: nenhum passo, exit 0 imediato.
  if (skip === "doc-only") {
    console.log(`gate: skipped (doc-only, base=${base || "working-tree"}, ${files} arquivos)`);
    recordSkip("doc-only", base, files);
    process.exit(0);
  }
  // Tier 2 — índices/grafo/ledger/mapa: apenas indices:check + indices:status.
  if (skip === "doc-gate") {
    console.log(`gate: doc-gate (base=${base || "working-tree"}, ${files} arquivos) — rodando indices:check + indices:status`);
    recordSkip("doc-gate", base, files);
    step("indices:check (frescor)", "npm run indices:check");
    step("indices:status (integridade)", "npm run indices:status");
    console.log("\n✅ DOC-GATE VERDE — índices frescos e íntegros");
    process.exit(0);
  }

  // Fallback conservador: gate integral (todos os passos acima, inalterado).
  console.log("═══ GATE LILA — paridade pr-gate/merge-gate ══");
  const t0 = Date.now();
  for (const [name, cmd, opts] of steps) step(name, cmd, opts ?? {});
  console.log(`\n✅ GATE VERDE — ${steps.length} passos em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (require.main === module) main();