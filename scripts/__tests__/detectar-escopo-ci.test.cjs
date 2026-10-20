"use strict";
// Suite: detectar-escopo-ci — mapeamento MATRIZ_TESTES -> flags de skip do CI.
// Roda via npm run test:scripts (run-test-scripts.cjs descobre *.test.cjs).
// RUN_INDICES (feature indices-check-ci, 2026-09-05): indicesNecessario do plano
// vira flag para o step de indices:check no pr-gate (sem duplicar o DOC_GATE).
// PATCH-CI-FAST-LANES-20261001: RUN_SCRIPTS (lane de diff só scripts/**) e
// FRONT_MODE (coverage | changed | skip) — com PARIDADE OBRIGATORIA entre
// COVERAGE_THRESHOLD_FILES e o thresholds do vitest.config.ts (padrão A2).

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { computeFlags, computeInstalls, decidirFrontMode, decidirBackMode, COVERAGE_THRESHOLD_FILES, BACK_COVERAGE_THRESHOLD_FILES } = require("../detectar-escopo-ci.cjs");
const DETECT_SCRIPT = path.join(__dirname, "..", "detectar-escopo-ci.cjs");

// Isolamento OBRIGATORIO (bugfix 2026-09-11 — merge-gate vermelho em PR de scripts):
// o detector publica as flags em $GITHUB_ENV quando essa variavel existe. Em CI
// (job merge-gate) o arquivo REAL do job existe, entao um spawn de teste que
// herdasse process.env escrevia flags conservadoras (RUN_BACK/RUN_E2E/
// INSTALL_BACK=true) no job DEPOIS de o npm ci do backend ter sido pulado com
// INSTALL_BACK=false — o step "Backend tests" passava a rodar sem deps (139
// suites falhando com "Cannot find package 'dotenv'").
// Regra: spawn de teste NUNCA herda GITHUB_ENV; para observar a publicacao, o
// teste aponta um arquivo de fixture explicito (githubEnv).
function rodarDetector(argv = [], { githubEnv } = {}) {
  const env = { ...process.env };
  delete env.GITHUB_ENV;
  if (githubEnv) env.GITHUB_ENV = githubEnv;
  return spawnSync(process.execPath, [DETECT_SCRIPT, ...argv], { encoding: "utf8", env });
}

const F0 = "false";
const T0 = "true";

// helper: objeto completo esperado (todas as flags incl. RUN_INDICES)
// BACK_MODE (FRAME-CI-LANE-LIGHT-20261006): default deriva do runBack — mesma
// regra do computeFlags (coverage quando roda, skip quando não); testes que
// esperam fast-lane/changed passam backMode explícito.
// RUN_AUDITS (FRAME-GATES-ROTINAS-DIARIAS-20261015): default T0 = fail-safe
// (plano sem auditsNecessario roda); tiers de doc passam F0 nos dois últimos args.
const flags = (runTci, runBack, runE2e, runIndices, docOnly, docGate, runScripts = F0, frontMode = "coverage", backMode = runBack === T0 ? "coverage" : "skip", runAudits = T0) => ({
  RUN_TCI: runTci,
  RUN_BACK: runBack,
  RUN_E2E: runE2e,
  RUN_SCRIPTS: runScripts,
  FRONT_MODE: frontMode,
  BACK_MODE: backMode,
  RUN_INDICES: runIndices,
  RUN_AUDITS: runAudits,
  DOC_ONLY: docOnly || F0,
  DOC_GATE: docGate || F0,
});

test("docs+indices apenas — nada de teste pesado roda", () => {
  const f = computeFlags({ docs: 3, indices: 2 }, false);
  assert.equal(f.RUN_TCI, F0);
  assert.equal(f.RUN_BACK, F0);
  assert.equal(f.RUN_E2E, F0);
  assert.equal(f.DOC_ONLY, F0);
  assert.equal(f.DOC_GATE, F0);
  assert.equal(f.RUN_INDICES, F0);
});

test("tier 1: plano docs_only -> DOC_ONLY=true, RUN_* false, FRONT_MODE skip", () => {
  const f = computeFlags({ docs: 2 }, false, { docs_only: true, doc_gate: false });
  assert.deepEqual(f, flags(F0, F0, F0, F0, T0, F0, F0, "skip", "skip", F0));
});

test("tier 2: plano doc_gate -> DOC_GATE=true, RUN_* false, RUN_INDICES true, FRONT_MODE skip", () => {
  const f = computeFlags({ indices: 3 }, false, { docs_only: false, doc_gate: true });
  assert.deepEqual(f, flags(F0, F0, F0, T0, F0, T0, F0, "skip", "skip", F0));
});

test("fullSuite vence docs_only (defensivo) — tudo roda, sem doc skip", () => {
  const f = computeFlags({ docs: 1 }, true, { docs_only: true });
  assert.deepEqual(f, flags(T0, T0, T0, F0, F0, F0));
});

test("sem plan (chamada legada 2 args) — DOC_* default false", () => {
  const f = computeFlags({ frontend: 1 }, false);
  assert.equal(f.DOC_ONLY, F0);
  assert.equal(f.DOC_GATE, F0);
  assert.equal(f.RUN_INDICES, F0);
});

test("frontend — roda test:ci e E2E, nao backend", () => {
  const f = computeFlags({ frontend: 1 }, false);
  assert.equal(f.RUN_TCI, T0);
  assert.equal(f.RUN_BACK, F0);
  assert.equal(f.RUN_E2E, T0);
  assert.equal(f.RUN_SCRIPTS, F0);
  assert.equal(f.FRONT_MODE, "coverage"); // main() afrouxa p/ changed só com diff materializado
});

test("frontend_tests — mesmo mapa de frontend", () => {
  const f = computeFlags({ frontend_tests: 2 }, false);
  assert.equal(f.RUN_TCI, T0);
  assert.equal(f.RUN_BACK, F0);
  assert.equal(f.RUN_E2E, T0);
});

test("backend_tests — roda backend e E2E, nao test:ci", () => {
  const f = computeFlags({ backend_tests: 2 }, false);
  assert.equal(f.RUN_TCI, F0);
  assert.equal(f.RUN_BACK, T0);
  assert.equal(f.RUN_E2E, T0);
  assert.equal(f.RUN_SCRIPTS, F0);
});

test("backend — mesmo mapa de backend_tests", () => {
  const f = computeFlags({ backend: 1 }, false);
  assert.equal(f.RUN_TCI, F0);
  assert.equal(f.RUN_BACK, T0);
  assert.equal(f.RUN_E2E, T0);
});

test("config_shared — full suite (tudo roda)", () => {
  const f = computeFlags({ config_shared: 1 }, false);
  assert.deepEqual(f, flags(T0, T0, T0, F0, F0, F0));
});

// PATCH-CI-FAST-LANES-20261001 (item 4): scripts deixa de arrastar a suíte front
// com coverage — ganha lane própria (só test:scripts + warm-up do .bin).
test("scripts-only — lane RUN_SCRIPTS (sem suíte front, sem E2E)", () => {
  const f = computeFlags({ scripts: 1 }, false);
  assert.equal(f.RUN_TCI, F0);
  assert.equal(f.RUN_SCRIPTS, T0);
  assert.equal(f.FRONT_MODE, "skip");
  assert.equal(f.RUN_BACK, F0);
  assert.equal(f.RUN_E2E, F0);
});

test("scripts+frontend — RUN_TCI vence (front step já inclui test:scripts)", () => {
  const f = computeFlags({ scripts: 1, frontend: 1 }, false);
  assert.equal(f.RUN_TCI, T0);
  assert.equal(f.RUN_SCRIPTS, F0);
  assert.equal(f.FRONT_MODE, "coverage");
});

test("scripts+backend — lane scripts + backend, sem suíte front", () => {
  const f = computeFlags({ scripts: 1, backend: 1 }, false);
  assert.equal(f.RUN_TCI, F0);
  assert.equal(f.RUN_SCRIPTS, T0);
  assert.equal(f.RUN_BACK, T0);
  assert.equal(f.RUN_E2E, T0);
});

test("other — conservador: tudo roda (E-INV-16)", () => {
  const f = computeFlags({ other: 1 }, false);
  assert.deepEqual(f, flags(T0, T0, T0, F0, F0, F0));
});

test("fullSuite=true forca tudo, mesmo com classes parciais", () => {
  const f = computeFlags({ docs: 1 }, true);
  assert.deepEqual(f, flags(T0, T0, T0, F0, F0, F0));
});

test("classes ausentes sao tratadas como zero", () => {
  const f = computeFlags({}, false);
  assert.deepEqual(f, flags(F0, F0, F0, F0, F0, F0, F0, "skip"));
});

test("front+back no mesmo diff — tudo roda", () => {
  const f = computeFlags({ frontend: 1, backend: 1 }, false);
  assert.deepEqual(f, flags(T0, T0, T0, F0, F0, F0));
});

// --- RUN_INDICES (feature indices-check-ci) -----------------------------------------

test("RUN_INDICES: plan indicesNecessario=true (diff de scripts/indices) -> true", () => {
  const f = computeFlags({ scripts: 1 }, false, { docs_only: false, doc_gate: false, indicesNecessario: true });
  assert.equal(f.RUN_INDICES, T0);
  assert.equal(f.RUN_SCRIPTS, T0);
});

test("RUN_INDICES: plan indicesNecessario=false (diff de codigo puro) -> false", () => {
  const f = computeFlags({ frontend: 1 }, false, { docs_only: false, doc_gate: false, indicesNecessario: false });
  assert.equal(f.RUN_INDICES, F0);
  assert.equal(f.RUN_TCI, T0);
});

test("RUN_INDICES: fullSuite com plan indicesNecessario=true propaga true", () => {
  const f = computeFlags({ config_shared: 1 }, true, { indicesNecessario: true });
  assert.deepEqual(f, flags(T0, T0, T0, T0, F0, F0));
});

test("RUN_INDICES: DOC_GATE=true -> true (D2-v2: dono unico do indices:check é o pr-gate)", () => {
  const f = computeFlags({ indices: 3 }, false, { docs_only: false, doc_gate: true, indicesNecessario: true });
  assert.deepEqual(f, flags(F0, F0, F0, T0, F0, T0, F0, "skip", "skip", F0));
});

test("RUN_INDICES: DOC_ONLY=true -> false (tier 1 nao roda gates)", () => {
  const f = computeFlags({ docs: 2 }, false, { docs_only: true, doc_gate: false, indicesNecessario: true });
  assert.deepEqual(f, flags(F0, F0, F0, F0, T0, F0, F0, "skip", "skip", F0));
});

test("RUN_INDICES: conservative() (base ausente/vazio) -> true (E-INV-16: falha nunca pula)", () => {
  // conservative e caminho interno do main(): executa o script com --base vazio.
  const r = rodarDetector(["--base", ""]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /conservador \(tudo roda\)/);
  assert.match(r.stdout, /RUN_INDICES=true/);
  assert.match(r.stdout, /RUN_SCRIPTS=true/);
  assert.match(r.stdout, /FRONT_MODE=coverage/);
});

// --- FRONT_MODE (PATCH-CI-FAST-LANES-20261001, item 2): decisao pura ----------------

test("FRONT_MODE: sem RUN_TCI -> skip (qualquer diff)", () => {
  assert.equal(decidirFrontMode({ runTci: false, files: ["src/lib/api-client.ts"] }), "skip");
  assert.equal(decidirFrontMode({ runTci: false, files: null }), "skip");
});

test("FRONT_MODE: fullSuite/docs tiers -> coverage (nunca changed)", () => {
  assert.equal(decidirFrontMode({ runTci: true, fullSuite: true, files: ["src/lib/x.ts"] }), "coverage");
  assert.equal(decidirFrontMode({ runTci: true, docsOnly: true, files: [] }), "coverage");
  assert.equal(decidirFrontMode({ runTci: true, docGate: true, files: [] }), "coverage");
});

test("FRONT_MODE: diff indisponivel/indeterminado -> coverage (conservador, E-INV-16)", () => {
  assert.equal(decidirFrontMode({ runTci: true, files: null }), "coverage");
  assert.equal(decidirFrontMode({ runTci: true, files: [] }), "coverage");
  assert.equal(decidirFrontMode({ runTci: true, files: undefined }), "coverage");
});

test("FRONT_MODE: arquivo de threshold tocado -> coverage; só arquivos comuns -> changed", () => {
  assert.equal(decidirFrontMode({ runTci: true, files: ["src/lib/api-client.ts"] }), "coverage");
  assert.equal(decidirFrontMode({ runTci: true, files: ["src/hooks/useChatSender.ts", "src/lib/outro.ts"] }), "coverage");
  assert.equal(decidirFrontMode({ runTci: true, files: ["src/components/chat/ChatPanel.tsx", "src/__tests__/components/chat/ChatPanel.test.tsx"] }), "changed");
});

// --- PARIDADE (padrão A2): COVERAGE_THRESHOLD_FILES x vitest.config.ts --------------
// Arquivo com threshold novo no vitest.config.ts sem entrar em
// COVERAGE_THRESHOLD_FILES = a lane changed o pularia em silêncio. O teste fixa a
// lista — encolhimento/drift = vermelho AQUI, nunca no PATH-GATE sumido.

test("PARIDADE: COVERAGE_THRESHOLD_FILES == chaves de coverage.thresholds no vitest.config.ts", () => {
  const cfgPath = path.join(__dirname, "..", "..", "vitest.config.ts");
  const fonte = fs.readFileSync(cfgPath, "utf8");
  // Cada entrada de threshold é um objeto inline `"path": { ... }` — única forma de
  // `"..." : {` no config (include/alias são arrays/expressão, não objeto literal).
  const noConfig = [...fonte.matchAll(/"([^"]+)":\s*\{[^{}]*\}/g)].map((m) => m[1]).sort();
  assert.ok(noConfig.length > 0, "nenhum arquivo de threshold extraído — regex do teste quebrou");
  assert.deepEqual(
    [...COVERAGE_THRESHOLD_FILES].sort(),
    noConfig,
    "COVERAGE_THRESHOLD_FILES divergiu do vitest.config.ts — sincronize a lista em detectar-escopo-ci.cjs"
  );
});

test("PARIDADE: BACK_COVERAGE_THRESHOLD_FILES == chaves de coverage.thresholds no backend/vitest.config.ts", () => {
  const cfgPath = path.join(__dirname, "..", "..", "backend", "vitest.config.ts");
  const fonte = fs.readFileSync(cfgPath, "utf8");
  const noConfig = [...fonte.matchAll(/"([^"]+)":\s*\{[^{}]*\}/g)].map((m) => "backend/" + m[1]).sort();
  assert.ok(noConfig.length > 0, "nenhum arquivo de threshold extraido do backend — regex do teste quebrou");
  assert.deepEqual(
    [...BACK_COVERAGE_THRESHOLD_FILES].sort(),
    noConfig,
    "BACK_COVERAGE_THRESHOLD_FILES divergiu do backend/vitest.config.ts — sincronize a lista em detectar-escopo-ci.cjs"
  );
});

// --- FRAME-CI-LANE-LIGHT-20261006: decidirBackMode (espelho de decidirFrontMode) ----

test("BACK_MODE: sem RUN_BACK -> skip", () => {
  assert.equal(decidirBackMode({ runBack: false, files: ["backend/src/routes/auth.ts"] }), "skip");
  assert.equal(decidirBackMode({ runBack: false, files: null }), "skip");
});

test("BACK_MODE: fullSuite/docs tiers -> coverage (gate integral)", () => {
  assert.equal(decidirBackMode({ runBack: true, fullSuite: true, files: ["backend/src/lib/x.ts"] }), "coverage");
  assert.equal(decidirBackMode({ runBack: true, docsOnly: true, files: [] }), "coverage");
  assert.equal(decidirBackMode({ runBack: true, docGate: true, files: [] }), "coverage");
});

test("BACK_MODE: diff ilegivel -> coverage (conservador, E-INV-16)", () => {
  assert.equal(decidirBackMode({ runBack: true, files: null }), "coverage");
  assert.equal(decidirBackMode({ runBack: true, files: [] }), "coverage");
});

test("BACK_MODE: rota gateada no diff -> coverage; rota nao-gateada -> changed", () => {
  assert.equal(decidirBackMode({ runBack: true, files: ["backend/src/routes/chat.ts"] }), "coverage");
  assert.equal(decidirBackMode({ runBack: true, files: ["backend/src/lib/x.ts", "backend/src/routes/auth.ts"] }), "coverage");
  assert.equal(decidirBackMode({ runBack: true, files: ["backend/src/lib/x.ts", "backend/src/services/y.ts"] }), "changed");
});

// --- C4: instalacoes por escopo (INSTALL_ROOT / INSTALL_BACK) -----------------------
// Tabela do prompt (secao 5.4) adaptada ao grafo REAL de consumidores do merge-gate:
// raiz = test:ci/E2E/test:scripts (lane scripts); backend = vitest backend/backend
// do E2E. Audits nao consomem node_modules. Fallback obrigatorio: qualquer duvida
// -> os DOIS npm ci.

test("C4: frontend puro — raiz sim, backend sim (E2E usa o backend local)", () => {
  const f = computeFlags({ frontend: 1 }, false);
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
});

test("C4: backend puro — raiz sim (E2E roda no raiz), backend sim", () => {
  const f = computeFlags({ backend: 1 }, false);
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
});

test("C4: scripts-only — raiz sim (test:scripts), backend NAO", () => {
  const f = computeFlags({ scripts: 2, docs: 1 }, false);
  assert.equal(f.RUN_TCI, F0);
  assert.equal(f.RUN_SCRIPTS, T0);
  assert.equal(f.RUN_BACK, F0);
  assert.equal(f.RUN_E2E, F0);
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: T0, INSTALL_BACK: F0 });
});

test("C4: scripts+backend — os dois npm ci", () => {
  const f = computeFlags({ scripts: 1, backend: 1 }, false);
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
});

test("C4: compartilhado (config_shared/fullSuite) — os dois npm ci", () => {
  const f = computeFlags({ config_shared: 1 }, false);
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
});

test("C4: other (nao classificado) — os dois npm ci", () => {
  const f = computeFlags({ other: 1 }, false);
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
});

test("C4: documentacao pura (tier 1) — nenhuma instalacao", () => {
  const f = computeFlags({ docs: 2 }, false, { docs_only: true });
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: F0, INSTALL_BACK: F0 });
});

test("C4: indices/grafo (tier 2 doc-gate) — zero instalacao (passo de indices do merge-gate saiu na dieta; indices:check é do pr-gate)", () => {
  const f = computeFlags({ indices: 3 }, false, { doc_gate: true });
  assert.deepEqual(computeInstalls(f), { INSTALL_ROOT: F0, INSTALL_BACK: F0 });
});

test("C4: sinal ausente/desconhecido — os dois npm ci (E-INV-16)", () => {
  assert.deepEqual(computeInstalls(undefined), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
  assert.deepEqual(computeInstalls({}), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
  assert.deepEqual(computeInstalls({ RUN_TCI: T0, RUN_BACK: F0 }), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
});

test("C4: sinais contraditorios (tier doc + gate pesado) — os dois npm ci", () => {
  assert.deepEqual(computeInstalls(flags(T0, T0, T0, F0, T0, F0)), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
  assert.deepEqual(computeInstalls({ ...flags(F0, F0, F0, F0, F0, T0), RUN_SCRIPTS: T0 }), { INSTALL_ROOT: T0, INSTALL_BACK: T0 });
  // doc-gate puro: passo de indices do merge-gate saiu na dieta (D2-v2) — zero instalacao
  assert.deepEqual(computeInstalls(flags(F0, F0, F0, T0, F0, T0)), { INSTALL_ROOT: F0, INSTALL_BACK: F0 });
});

test("C4: conservative() do CLI publica INSTALL_ROOT/INSTALL_BACK=true", () => {
  const r = rodarDetector(["--base", ""]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /INSTALL_ROOT=true/);
  assert.match(r.stdout, /INSTALL_BACK=true/);
});

test("fast-lane (B): diff só de catálogo + neutros -> ehFastLane true", () => {
  const { ehFastLane } = require("../detectar-escopo-ci.cjs");
  const files = [
    "src/lib/models.ts",
    "src/lib/image-models.ts",
    "src/__tests__/lib/image-models.test.ts",
    "backend/src/lib/image-model-ids.ts",
    "backend/src/services/openrouter.ts",
    "docs/AI-PROJECT-MANIFEST.md",
    "LILA-DEV/execucao/logs/PATCH-X-log.md",
  ];
  assert.equal(ehFastLane(files), true);
});

test("fast-lane (B): arquivo fora do allowlist -> lanço completo (false)", () => {
  const { ehFastLane } = require("../detectar-escopo-ci.cjs");
  assert.equal(ehFastLane(["src/lib/models.ts", "src/components/chat/ChatPanel.tsx"]), false);
  assert.equal(ehFastLane(["docs/AI-PROJECT-MANIFEST.md"]), false); // só neutros
  assert.equal(ehFastLane([]), false);
});

// --- Regressão do vazamento de GITHUB_ENV (bugfix 2026-09-11) ------------------------
// Antes do fix: o spawn do detector herdava process.env e escrevia as flags no
// arquivo REAL do job do merge-gate, invertendo RUN_BACK/INSTALL_BACK depois das
// decisoes de instalacao (backend rodava sem deps). Os testes abaixo fixam o
// contrato: (1) spawn de teste nao escreve no GITHUB_ENV herdado; (2) com arquivo
// de fixture explicito a publicacao continua funcionando (contrato de producao);
// (3) nenhum spawn cru do detector pode reaparecer neste arquivo.

test("isolamento: spawn de teste NAO escreve no GITHUB_ENV herdado (regressao do merge-gate)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-escopo-env-"));
  const arquivoDoJob = path.join(dir, "job-github-env.txt");
  const antes = "RUN_BACK=false\nINSTALL_BACK=false\n";
  fs.writeFileSync(arquivoDoJob, antes);
  const salvo = process.env.GITHUB_ENV;
  process.env.GITHUB_ENV = arquivoDoJob; // simula o arquivo real do job no runner
  try {
    const r = rodarDetector(["--base", ""]); // caminho conservador: o mais perigoso
    assert.equal(r.status, 0);
    assert.equal(
      fs.readFileSync(arquivoDoJob, "utf8"),
      antes,
      "spawn de teste escreveu no GITHUB_ENV do job — flags do merge-gate seriam contaminadas"
    );
  } finally {
    if (salvo === undefined) delete process.env.GITHUB_ENV;
    else process.env.GITHUB_ENV = salvo;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publicacao: com githubEnv explicito o detector escreve as flags (contrato de producao)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-escopo-pub-"));
  const fixture = path.join(dir, "fixture-github-env.txt");
  fs.writeFileSync(fixture, "");
  try {
    const r = rodarDetector(["--base", ""], { githubEnv: fixture });
    assert.equal(r.status, 0);
    const publicado = fs.readFileSync(fixture, "utf8");
    assert.match(publicado, /RUN_BACK=true/);
    assert.match(publicado, /RUN_E2E=true/);
    assert.match(publicado, /INSTALL_BACK=true/);
    assert.match(publicado, /RUN_SCRIPTS=true/);
    assert.match(publicado, /FRONT_MODE=coverage/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("guard estrutural: todo spawn do detector passa por rodarDetector()", () => {
  const fonte = fs.readFileSync(__filename, "utf8");
  const cru = fonte.match(/spawnSync\(\s*process\.execPath,\s*\[DETECT_SCRIPT/g) || [];
  assert.equal(
    cru.length,
    1,
    "spawn cru do detector detectado — use rodarDetector(): spawn que herda GITHUB_ENV contamina o job do merge-gate"
  );
});

// ── FRAME-GATES-ROTINAS-DIARIAS-20261015 (D4): RUN_AUDITS ─────────────────────
// Audits por-PR somente quando o diff toca lockfile; complemento diario:
// audit-diario.yml (12:10 UTC). Fail-safe duplo: campo ausente no plano e env
// ausente no job NUNCA pulam o gate — so "false" explicito pula.
test("RUN_AUDITS: diff com lockfile (auditsNecessario=true) roda audits", () => {
  const flags = computeFlags({ frontend: 1 }, false, { auditsNecessario: true });
  assert.equal(flags.RUN_AUDITS, "true");
});

test("RUN_AUDITS: diff sem lockfile (auditsNecessario explicito false) pula", () => {
  const flags = computeFlags({ docs: 2 }, false, { auditsNecessario: false });
  assert.equal(flags.RUN_AUDITS, "false");
});

test("RUN_AUDITS: campo ausente no plano = fail-safe roda (E-INV-16)", () => {
  assert.equal(computeFlags({ frontend: 1 }, false, {}).RUN_AUDITS, "true");
  assert.equal(computeFlags({ frontend: 1 }, false, null).RUN_AUDITS, "true");
});

test("RUN_AUDITS: fullSuite sempre true; tiers de doc sempre false", () => {
  assert.equal(computeFlags(null, true, { auditsNecessario: false }).RUN_AUDITS, "true");
  assert.equal(computeFlags(null, false, { docs_only: true, auditsNecessario: true }).RUN_AUDITS, "false");
  assert.equal(computeFlags(null, false, { doc_gate: true, auditsNecessario: true }).RUN_AUDITS, "false");
});

test("publicacao conservadora inclui RUN_AUDITS=true (fail-safe no job)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-escopo-audits-"));
  const fixture = path.join(dir, "fixture-github-env.txt");
  fs.writeFileSync(fixture, "");
  try {
    const r = rodarDetector(["--base", ""], { githubEnv: fixture });
    assert.equal(r.status, 0);
    const publicado = fs.readFileSync(fixture, "utf8");
    assert.match(publicado, /RUN_AUDITS=true/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
