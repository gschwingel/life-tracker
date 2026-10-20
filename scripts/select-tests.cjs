#!/usr/bin/env node
// scripts/select-tests.cjs
// Proposito: seletor DETERMINISTICO de testes do E4 (MATRIZ_TESTES do LILA-DEV/FDV-EXEC.md).
//   Classifica os arquivos alterados (git diff --base..HEAD + working tree) em classes e emite
//   o plano canonico: typechecks obrigatorios | testes relacionados | test:scripts/indices |
//   condicao de full suite | justificativa de selecao vazia. Zero inferencia do executor.
//   Contexto: E4 roda POS-COMMIT — `vitest run --changed` sem base usa a semantica uncommitted
//   do Vitest (zero testes selecionados, falso-falha exit 1). Por isso este script exige
//   --base no contexto pos-commit; sem --base assume fluxo PATCH pre-commit (D4, uncommitted valido).
// Uso:
//   node scripts/select-tests.cjs [--base <ref>] [--json] [--verbose] [--help]
//   --base    ref git (hash/branch) do inicio do frame — obrigatorio no contexto E4 (pos-commit)
//   --json    saida maquina (JSON) em vez do plano legivel
//   --verbose inclui a lista de arquivos classificados por classe
// Saida: plano deterministico | exit 0 (classificacao OK) | exit 1 (erro de git/uso)

"use strict";

const { execFileSync } = require("node:child_process");

const argv = process.argv.slice(2);

function usage() {
  console.log(`node scripts/select-tests.cjs [--base <ref>] [--json] [--verbose] [--help]

Seletor deterministico de testes do E4 (MATRIZ_TESTES do FDV-EXEC).

Opcoes:
  --base <ref>  ref git (hash/branch) do inicio do frame. Obrigatorio no contexto E4
                (pos-commit) — sem ele o Vitest --changed usa uncommitted (zero testes apos push).
  --json        saida maquina (JSON).
  --verbose     inclui lista de arquivos classificados.
  --help, -h    esta mensagem.`);
}

function fail(msg) {
  console.error(`[select-tests] ${msg}`);
  process.exit(1);
}

if (argv.includes("--help") || argv.includes("-h")) {
  usage();
  process.exit(0);
}
const json = argv.includes("--json");
const verbose = argv.includes("--verbose");
const baseIdx = argv.indexOf("--base");
let base = null;
if (baseIdx !== -1) {
  base = argv[baseIdx + 1];
  if (!base) fail("--base requer um valor (hash ou branch).");
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const tail = String(e.stderr || e.message || "git falhou")
      .trim()
      .split(/\r?\n/)
      .slice(-3)
      .join(" ");
    fail(`git ${args.join(" ")} falhou -> ${tail}`);
  }
}

// Arquivos alterados: diff base..HEAD + working tree (staged e unstaged) — no E4 o que resta
// nao-commitado sao docs/logs/indices de E3/E3.5 e precisam entrar na classificacao.
function changedFiles() {
  const set = new Set();
  const add = (out) => {
    for (const l of String(out).split(/\r?\n/)) {
      const f = l.trim();
      if (f) set.add(f);
    }
  };
  if (base) {
    add(git(["diff", "--name-only", `${base}..HEAD`]));
  }
  add(git(["diff", "--name-only"])); // unstaged
  add(git(["diff", "--cached", "--name-only"])); // staged
  add(git(["ls-files", "--others", "--exclude-standard"])); // untracked nao-ignorados (novos arquivos)
  return [...set].sort();
}

const RE = {
  config: /^(package\.json|package-lock\.json|tsconfig.*\.json|vitest\.config\.[jt]s|eslint\.config\.[jt]s|playwright\.config\.[jt]s|\.github\/workflows\/.*\.ya?ml|backend\/package\.json|backend\/package-lock\.json|backend\/tsconfig\.json|backend\/vitest\.config\.[jt]s)$/,
  protocol: /^LILA-DEV\/(FDV-.*\.md|PROTOCOLO-.*\.md|README-DEV-AI\.md)$|^\.clinerules$/,
  srcTest: /^src\/.*\.(test|spec)\.[jt]sx?$/,
  src: /^src\//,
  backTest: /^backend\/src\/.*\.test\.ts$/,
  back: /^backend\/src\//,
  scripts: /^scripts\/|^indice-vetorial\.bin$/,
  cjsRoot: /^[^/]+\.cjs$/,
  // indice-vetorial.bin fora do tier-2 (drenagem 2026-10-05, #1131): o .bin é
  // INPUT de ranking (fixtures douradas de recall@5 consomem os vetores) — diff
  // que o toca roda test:scripts (gate golden incluso), nunca doc-gate que pula
  // testes. O .json do sidecar segue tier-2 (metadados; freshness já cobre).
  indices: /^(indice-.*\.json|LILA-DEV\/(indice|matriz)-.*\.json|LILA-DEV\/planejamento\/(grafo|decisoes-ledger|mapa-areas).*\.json|LILA-DEV\/areas\/)/,
  docs: /^(docs\/|.*\.md$|.*\/prompts\/)/,
  // FRAME-GATES-ROTINAS-DIARIAS-20261015: fonte única do sinal RUN_AUDITS —
  // diff que toca lockfile revalida o estado de dependências NO PR (audits);
  // diff que não toca conta com o audit-diário (12:10 UTC). NÃO é classe de
  // classificação (lockfile segue config_shared para RUN_TCI/RUN_BACK/RUN_E2E
  // — mudança de dependência continua puxando suíte integral); é sinal
  // adicional consumido por scripts/detectar-escopo-ci.cjs.
  lockfile: /^(package-lock\.json|backend\/package-lock\.json)$/,
};

function classify(file) {
  if (RE.config.test(file)) return "config_shared";
  if (RE.protocol.test(file)) return "protocol";
  if (RE.srcTest.test(file)) return "frontend_tests";
  if (RE.src.test(file)) return "frontend";
  if (RE.backTest.test(file)) return "backend_tests";
  if (RE.back.test(file)) return "backend";
  if (RE.scripts.test(file) || RE.cjsRoot.test(file)) return "scripts";
  if (RE.indices.test(file)) return "indices";
  if (RE.docs.test(file)) return "docs";
  return "other";
}

const files = changedFiles();
const byClass = new Map();
for (const f of files) {
  const c = classify(f);
  if (!byClass.has(c)) byClass.set(c, []);
  byClass.get(c).push(f);
}
const has = (c) => byClass.has(c) && byClass.get(c).length > 0;

// ── Plano (ordem deterministica — a mesma para qualquer executor) ────────────
const typechecks = new Set();
if (has("config_shared")) {
  typechecks.add("app");
  typechecks.add("node");
  typechecks.add("backend");
} else {
  if (has("frontend") || has("frontend_tests")) typechecks.add("app");
  if (has("backend") || has("backend_tests")) typechecks.add("backend");
}
const typecheckCmds = [
  ...(typechecks.has("app") ? ["npx tsc --noEmit -p tsconfig.app.json"] : []),
  ...(typechecks.has("node") ? ["npx tsc --noEmit -p tsconfig.node.json"] : []),
  ...(typechecks.has("backend") ? ["cd backend && npx tsc --noEmit"] : []),
];

const testsFront = has("frontend") || has("frontend_tests");
const testsBack = has("backend") || has("backend_tests");
const relatedCmds = [];
if (testsFront) relatedCmds.push(base ? `npx vitest run --changed ${base}` : "npx vitest run --changed");
if (testsBack) relatedCmds.push(base ? `cd backend && npx vitest run --changed ${base}` : "cd backend && npx vitest run --changed");

const testScriptsNeeded = has("scripts") || has("indices");
const indicesNeeded = has("indices") || has("protocol") || has("scripts");

const fullReasons = [];
if (has("config_shared")) fullReasons.push("config de teste/build alterada (config_shared)");
if (has("frontend") && has("backend")) fullReasons.push("alteracao transversal front+backend no mesmo diff (contrato compartilhado)");
if (has("protocol")) fullReasons.push("mudanca de protocolo (FDV/PROTOCOLO/.clinerules)");
const codeTouched = testsFront || testsBack;
if (!codeTouched && (has("frontend") || has("backend"))) {
  fullReasons.push("selecao vazia com codigo alterado (nada selecionado pela matriz)");
}
if (relatedCmds.length === 0 && (has("frontend_tests") || has("backend_tests"))) {
  fullReasons.push("arquivos de teste alterados mas nenhum comando relacionado emitido (inconclusivo)");
}
// Riscos nao detectaveis estaticamente (decisao humana/executor no relatorio E4):
// merge de frames (C3), bugfix de alcance incerto, dependencia nao declarada, solicitacao humana.

const selectionEmpty = relatedCmds.length === 0 && !testScriptsNeeded && !indicesNeeded;

// ── Tiers de skip doc-only (decisao humana 2026-09-04, fonte unica de classificacao) ──
// Tier 1 (docs_only): TODOS os arquivos sao .md de prosa (classe docs + extensao .md)
//   — nenhum passo de gate (run-gate/detectar-escopo-ci consomem este flag).
// Tier 2 (doc_gate): TODOS os arquivos sao JSONs de indice/grafo/ledger/mapa
//   (classe indices) — apenas indices:check + indices:status.
// Diff misto, other, config_shared, protocol ou zero arquivos -> false/false
// (fallback conservador: gate integral — E-INV-16).
const singleClass = byClass.size === 1;
const docs_only =
  files.length > 0 && singleClass && byClass.has("docs") && files.every((f) => /\.md$/i.test(f));
const doc_gate = files.length > 0 && singleClass && byClass.has("indices");

const plan = {
  base: base || null,
  contexto: base ? "E4 pos-commit" : "PATCH pre-commit (D4 — uncommitted)",
  totalArquivosAlterados: files.length,
  classes: Object.fromEntries([...byClass.entries()].map(([k, v]) => [k, v.length])),
  typechecksObrigatorios: typecheckCmds,
  testesRelacionados: relatedCmds,
  testScriptsNecessario: testScriptsNeeded,
  indicesNecessario: indicesNeeded,
  // FRAME-GATES-ROTINAS-DIARIAS-20261015 (D4): audits por-PR só quando o
  // estado de dependências muda; consumidor: detectar-escopo-ci (RUN_AUDITS).
  // Campo AUSENTE no plano (versões mismatched) = consumidor trata como true
  // (fail-safe — sinal ausente nunca pula gate).
  auditsNecessario: files.some((f) => RE.lockfile.test(f)),
  fullSuite: fullReasons.length > 0,
  fullSuiteMotivos: fullReasons,
  selecaoVazia: selectionEmpty,
  docs_only: docs_only,
  doc_gate: doc_gate,
  notaSelecaoVazia: selectionEmpty
    ? "Nenhum teste relacionado pela matriz — pulo justificado no relatorio E4 (nao executar vitest)."
    : null,
  notaFalhaRelacionados:
    "Se `vitest run --changed` falhar com 'No test files found' (selecao vazia por grafo de modulos), escalar para full suite.",
  comandosProibidos: ["npx vitest run --changed (sem base, pos-commit)"],
};

if (json) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

console.log("[select-tests] plano deterministico (MATRIZ_TESTES FDV-EXEC)");
console.log(`  contexto: ${plan.contexto}${base ? ` | base: ${base}` : ""}`);
console.log(`  arquivos alterados: ${files.length}`);
console.log("  classes:");
for (const [c, v] of byClass.entries()) {
  console.log(`    ${c.padEnd(15)} ${v.length}`);
}
console.log("  typechecks obrigatorios:");
for (const c of typecheckCmds) console.log(`    $ ${c}`);
if (relatedCmds.length) {
  console.log("  testes relacionados:");
  for (const c of relatedCmds) console.log(`    $ ${c}`);
} else {
  const nota = selectionEmpty
    ? plan.notaSelecaoVazia
    : "matriz nao selecionou testes relacionados (indices/scripts/protocolo em foco) — ver full suite abaixo";
  console.log(`  testes relacionados: NENHUM — ${nota}`);
}
console.log(`  test:scripts: ${testScriptsNeeded ? "obrigatorio" : "nao"}`);
console.log(`  indices (check+status): ${indicesNeeded ? "obrigatorio" : "nao"}`);
console.log(`  full suite: ${plan.fullSuite ? "SIM" : "nao"}`);
for (const r of fullReasons) console.log(`    motivo: ${r}`);
console.log(`  doc-only (skip total, tier 1): ${plan.docs_only ? "SIM" : "nao"}`);
console.log(`  doc-gate (so indices, tier 2): ${plan.doc_gate ? "SIM" : "nao"}`);
if (verbose) {
  console.log("  arquivos por classe:");
  for (const [c, v] of byClass.entries()) {
    console.log(`    [${c}]`);
    for (const f of v) console.log(`      ${f}`);
  }
}
