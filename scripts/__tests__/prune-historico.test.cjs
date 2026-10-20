// scripts/__tests__/prune-historico.test.cjs
// Suíte node:test para prune-historico.cjs.
// Estratégia: sandbox temporário via PRUNE_BASE_DIR (override de root) + spawnSync.
// Nenhuma escrita acontece no repo real; --dry-run é verificado como zero-escrita.
// FRAME-CHANGELOG-REFORM-20261001: o CHANGELOG.md SAIU da superfície do prune
// (escritor único = gerar-changelog.cjs) — o modo aplicado NÃO pode tocá-lo (V5).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PRUNE = path.join(__dirname, "..", "prune-historico.cjs");
const BASE = "2026-08-24";

function criarSandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prune-test-"));
  // CHANGELOG.md — presente apenas para PROVAR que o prune não o toca mais (V5).
  fs.writeFileSync(path.join(tmp, "CHANGELOG.md"), [
    "# CHANGELOG — índice mecânico de declarações (changelog-block/v1)",
    "",
    "## [FEAT] FRAME-X — entrada do índice mecânico — 2026-08-20",
    "entry: FRAME-X.E1 | areas: chat | log: LILA-DEV/execucao/logs/FRAME-X-log.md",
    "",
  ].join("\n"));
  // AI-PROJECT-MANIFEST.md — sem cauda meta_* (extinta na v3.0): o prune nao toca docs/.
  fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "docs", "AI-PROJECT-MANIFEST.md"), [
    "# AI-PROJECT-MANIFEST",
    "",
    "Conteudo normal."
  ].join("\n"));
  // Logs — 1 keep, 2 archive (>15d), 1 sem data
  const logsDir = path.join(tmp, "LILA-DEV", "execucao", "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, "TEST-1-log.md"), "# Log\n\n**Data:** 2026-08-20\n");
  fs.writeFileSync(path.join(logsDir, "TEST-2-log.md"), "# Log\n\n**Data:** 2026-07-24\n");
  fs.writeFileSync(path.join(logsDir, "TEST-3-log.md"), "# Log\n\n**Data:** 2026-08-08\n");
  fs.writeFileSync(path.join(logsDir, "TEST-4-log.md"), "# Log sem data\n");
  // Reports — par antigo (>15d: 23d), par fresco (4d) e arquivo sem data na convenção
  // PATCH-REPORTS-RETENCAO-20261003: pares movem para backend/reports/arquivo/
  const reportsDir = path.join(tmp, "backend", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, "TEMA-A-2026-08-01.md"), "# Relatorio A\n");
  fs.writeFileSync(path.join(reportsDir, "TEMA-A-2026-08-01.json"), "{}");
  fs.writeFileSync(path.join(reportsDir, "TEMA-B-2026-08-20.md"), "# Relatorio B\n");
  fs.writeFileSync(path.join(reportsDir, "TEMA-B-2026-08-20.json"), "{}");
  fs.writeFileSync(path.join(reportsDir, "README.md"), "# Relatorios\n");
  return tmp;
}

function rodar(args, sandbox) {
  return spawnSync(process.execPath, [PRUNE, ...args], {
    encoding: "utf8",
    env: { ...process.env, PRUNE_BASE_DIR: sandbox },
  });
}

test("prune-historico --help sai com 0 e imprime uso", () => {
  const sandbox = criarSandbox();
  try {
    const r = rodar(["--help"], sandbox);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Uso: node scripts\/prune-historico\.cjs \[--dry-run\] \[--base YYYY-MM-DD\]/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-historico --dry-run classifica e não escreve nada", () => {
  const sandbox = criarSandbox();
  try {
    const antes = fs.readFileSync(path.join(sandbox, "CHANGELOG.md"), "utf8");
    const r = rodar(["--dry-run", "--base", BASE], sandbox);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /prune-historico \(DRY-RUN\) — base 2026-08-24/);
    // Sem linha de CHANGELOG no report (saiu da superfície do prune)
    assert.strictEqual(/CHANGELOG:/.test(r.stdout), false);
    // Cauda meta_* extinta: o report nao classifica mais tail de manifesto.
    assert.strictEqual(/meta_/.test(r.stdout), false);
    // logs: 1 keep + 2 archive (>15d: 31d e 16d vão para o endpoint único) + 1 semData
    assert.match(r.stdout, /logs: manter=1 desidratar=0 arquivar=2 semData=1/);
    assert.match(r.stdout, /sem data \(mantidos\): TEST-4-log\.md/);
    assert.match(r.stdout, /Nada foi escrito \(dry-run\)\./);

    // Zero escrita no sandbox
    assert.strictEqual(fs.readFileSync(path.join(sandbox, "CHANGELOG.md"), "utf8"), antes);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs-arquivo")), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-historico modo aplicado: arquiva >15d em logs-arquivo e NUNCA toca o CHANGELOG (V5)", () => {
  const sandbox = criarSandbox();
  try {
    const changelogAntes = fs.readFileSync(path.join(sandbox, "CHANGELOG.md"), "utf8");
    const manifestAntes = fs.readFileSync(path.join(sandbox, "docs", "AI-PROJECT-MANIFEST.md"), "utf8");
    const r = rodar(["--base", BASE], sandbox);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /prune-historico \(APLICADO\) — base 2026-08-24/);

    // Logs: keep (TEST-1) e noDate (TEST-4) permanecem; >15d (TEST-2 31d e TEST-3 16d) vão para logs-arquivo/
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs", "TEST-1-log.md")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs", "TEST-4-log.md")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs", "TEST-2-log.md")), false);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs", "TEST-3-log.md")), false);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs-arquivo", "TEST-2-log.md")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs-arquivo", "TEST-3-log.md")), true);

    // V5 (FRAME-CHANGELOG-REFORM-20261001): byte-a-byte intocado no modo APLICADO
    assert.strictEqual(fs.readFileSync(path.join(sandbox, "CHANGELOG.md"), "utf8"), changelogAntes);

    // MANIFEST: cauda meta_* extinta — o prune nao escreve em docs/ (byte-a-byte intocado).
    const manifest = fs.readFileSync(path.join(sandbox, "docs", "AI-PROJECT-MANIFEST.md"), "utf8");
    assert.strictEqual(manifest, manifestAntes);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-historico limites de borda: 15d fica, >15d arquiva", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "prune-borda-"));
  try {
    const logsDir = path.join(sandbox, "LILA-DEV", "execucao", "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, "A-log.md"), "**Data:** 2026-08-09\n");
    fs.writeFileSync(path.join(logsDir, "B-log.md"), "**Data:** 2026-07-25\n");
    fs.writeFileSync(path.join(logsDir, "C-log.md"), "**Data:** 2026-07-24\n");

    const r = rodar(["--dry-run", "--base", BASE], sandbox);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(/CHANGELOG:/.test(r.stdout), false);
    assert.strictEqual(/meta_/.test(r.stdout), false); // cauda meta_* extinta
    assert.match(r.stdout, /logs: manter=1 desidratar=0 arquivar=2 semData=0/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-historico relatorios: dry-run classifica pares e nao escreve", () => {
  const sandbox = criarSandbox();
  try {
    const r = rodar(["--dry-run", "--base", BASE], sandbox);
    assert.strictEqual(r.status, 0, r.stderr);
    // manter = par TEMA-B (md+json); arquivar = par TEMA-A (23d); semData = README
    assert.match(r.stdout, /relatorios: manter=2 arquivar=2 semData=1/);
    assert.match(r.stdout, /sem data \(mantidos\): README\.md/);
    // Dry-run: destino de arquivo não é criado
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "arquivo")), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-historico relatorios: modo aplicado move o par >15d para backend/reports/arquivo", () => {
  const sandbox = criarSandbox();
  try {
    const r = rodar(["--base", BASE], sandbox);
    assert.strictEqual(r.status, 0, r.stderr);
    // Par antigo sai do canal ativo e move inteiro (basename a basename)
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "TEMA-A-2026-08-01.md")), false);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "TEMA-A-2026-08-01.json")), false);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "arquivo", "TEMA-A-2026-08-01.md")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "arquivo", "TEMA-A-2026-08-01.json")), true);
    // Par fresco e arquivo sem data permanecem no canal ativo
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "TEMA-B-2026-08-20.md")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "TEMA-B-2026-08-20.json")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "backend", "reports", "README.md")), true);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-historico relatorios: sem backend/reports no sandbox, segue de pe", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "prune-sem-reports-"));
  try {
    // logs/ vazio: processLogs exige o diretório; backend/reports NÃO existe — a guarda existsSync é o que este teste prova
    fs.mkdirSync(path.join(sandbox, "LILA-DEV", "execucao", "logs"), { recursive: true });
    const r = rodar(["--dry-run", "--base", BASE], sandbox);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /relatorios: manter=0 arquivar=0 semData=0/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
