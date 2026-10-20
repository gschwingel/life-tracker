// scripts/__tests__/select-tests.test.cjs
// E4-TESTES-MATRIZ: suíte do seletor determinístico de testes (MATRIZ_TESTES do FDV-EXEC).
// Cada teste cria um repo git TEMPORÁRIO (fixture por classe), roda o script via spawn e
// valida a classificação/plano. Zero side effects no repo real — determinístico.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "..", "select-tests.cjs");

function git(dir, args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function runSelect(dir, extra = []) {
  return spawnSync(process.execPath, [SCRIPT, ...extra], { cwd: dir, encoding: "utf8" });
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "select-tests-"));
  git(dir, ["init", "-b", "main", "-q"]);
  git(dir, ["config", "user.email", "t@t.t"]);
  git(dir, ["config", "user.name", "t"]);
  const write = (rel, content) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write("src/app.ts", "export const a = 1;\n");
  write("backend/src/route.ts", "export const r = 1;\n");
  write("scripts/helper.cjs", "module.exports = 1;\n");
  write("docs/a.md", "# a\n");
  write("package.json", "{}\n");
  git(dir, ["add", "-A"]);
  const c = git(dir, ["commit", "-m", "base", "-q"]);
  assert.equal(c.status, 0, `commit base falhou: ${c.stderr}`);
  return dir;
}

function planFor(dir, extra) {
  const r = runSelect(dir, extra);
  assert.equal(r.status, 0, `exit != 0: ${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

test("--help sai com 0 e imprime uso", () => {
  const r = runSelect(process.cwd(), ["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--base/);
});

test("base invalida sai com 1 e mensagem acionavel", () => {
  const dir = makeFixture();
  try {
    const r = runSelect(dir, ["--base", "ref-inexistente"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ref-inexistente/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mudanca em src -> frontend relacionado + typecheck app", () => {
  const dir = makeFixture();
  try {
    fs.appendFileSync(path.join(dir, "src/app.ts"), "\nexport const b = 2;\n");
    const plan = planFor(dir, ["--base", "HEAD", "--json"]);
    assert.equal(plan.classes.frontend, 1);
    assert.ok(plan.testesRelacionados.some((c) => c.includes("vitest run --changed HEAD") && !c.includes("cd backend")));
    assert.ok(plan.typechecksObrigatorios.some((c) => c.includes("tsconfig.app.json")));
    assert.equal(plan.fullSuite, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mudanca em backend/src -> relacionado backend + typecheck backend", () => {
  const dir = makeFixture();
  try {
    fs.appendFileSync(path.join(dir, "backend/src/route.ts"), "\nexport const s = 2;\n");
    const plan = planFor(dir, ["--base", "HEAD", "--json"]);
    assert.equal(plan.classes.backend, 1);
    assert.ok(plan.testesRelacionados.some((c) => c.includes("cd backend && npx vitest run --changed HEAD")));
    assert.ok(plan.typechecksObrigatorios.some((c) => c.includes("npx tsc --noEmit") && c.includes("cd backend")));
    assert.equal(plan.fullSuite, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("mudanca em package.json -> config_shared + full suite", () => {
  const dir = makeFixture();
  try {
    fs.writeFileSync(path.join(dir, "package.json"), '{ "x": 1 }\n');
    const plan = planFor(dir, ["--base", "HEAD", "--json"]);
    assert.equal(plan.classes.config_shared, 1);
    assert.equal(plan.fullSuite, true);
    assert.ok(plan.fullSuiteMotivos.some((m) => m.includes("config")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mudanca de doc -> selecao vazia, sem full suite", () => {
  const dir = makeFixture();
  try {
    fs.writeFileSync(path.join(dir, "docs/a.md"), "# a\nmais\n");
    const plan = planFor(dir, ["--base", "HEAD", "--json"]);
    assert.equal(plan.classes.docs, 1);
    assert.equal(plan.testesRelacionados.length, 0);
    assert.equal(plan.fullSuite, false);
    assert.equal(plan.selecaoVazia, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("arquivo novo untracked em src e detectado (ls-files --others)", () => {
  const dir = makeFixture();
  try {
    fs.writeFileSync(path.join(dir, "src/novo.ts"), "export const n = 1;\n");
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.classes.frontend, 1);
    assert.ok(plan.testesRelacionados.some((c) => c.includes("vitest run --changed")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mudanca em LILA-DEV/FDV-EXEC.md (staged) -> protocol + indicesNecessario", () => {
  const dir = makeFixture();
  try {
    const p = path.join(dir, "LILA-DEV/FDV-EXEC.md");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "FDV-EXEC v3.10\n");
    git(dir, ["add", "LILA-DEV/FDV-EXEC.md"]);
    const plan = planFor(dir, ["--base", "HEAD", "--json"]);
    assert.equal(plan.classes.protocol, 1);
    assert.equal(plan.indicesNecessario, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mudanca mista front+backend -> full suite por contrato", () => {
  const dir = makeFixture();
  try {
    fs.appendFileSync(path.join(dir, "src/app.ts"), "\nexport const b = 2;\n");
    fs.appendFileSync(path.join(dir, "backend/src/route.ts"), "\nexport const s = 2;\n");
    const plan = planFor(dir, ["--base", "HEAD", "--json"]);
    assert.ok(plan.fullSuiteMotivos.some((m) => m.includes("front+backend")));
    assert.equal(plan.testesRelacionados.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Tiers de skip doc-only (PATCH-DOC-ONLY-GATES 2026-09-04) ─────────────────

test("tier 1: diff .md puro -> docs_only=true, doc_gate=false", () => {
  const dir = makeFixture();
  try {
    fs.writeFileSync(path.join(dir, "docs/a.md"), "# a\nlinha nova\n");
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.classes.docs, 1);
    assert.equal(plan.docs_only, true);
    assert.equal(plan.doc_gate, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("tier 1 cobre .md fora de docs/ (Method/**, README, LILA-DEV)", () => {
  const dir = makeFixture();
  try {
    const p = path.join(dir, "Method/x.md");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "# x\n");
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.docs_only, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("diff misto .md + .ts -> fallback conservador (nenhum flag, gate integral)", () => {
  const dir = makeFixture();
  try {
    fs.writeFileSync(path.join(dir, "docs/a.md"), "# a\nmais\n");
    fs.appendFileSync(path.join(dir, "src/app.ts"), "\nexport const b = 2;\n");
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.docs_only, false);
    assert.equal(plan.doc_gate, false);
    assert.equal(plan.fullSuite, false); // misto simples: gate integral sem full suite
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("tier 2: JSON de indice -> doc_gate=true, docs_only=false", () => {
  const dir = makeFixture();
  try {
    const p = path.join(dir, "LILA-DEV/indice-rastreabilidade.json");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ "v": 2 }\n');
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.classes.indices, 1);
    assert.equal(plan.doc_gate, true);
    assert.equal(plan.docs_only, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("package.json (config_shared) -> gate cheio (nenhum flag)", () => {
  const dir = makeFixture();
  try {
    fs.writeFileSync(path.join(dir, "package.json"), '{ "x": 2 }\n');
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.docs_only, false);
    assert.equal(plan.doc_gate, false);
    assert.equal(plan.fullSuite, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("path desconhecido (other) -> gate cheio (nenhum flag)", () => {
  const dir = makeFixture();
  try {
    const p = path.join(dir, "dados/blob.bin");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "bin\n");
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.classes.other, 1);
    assert.equal(plan.docs_only, false);
    assert.equal(plan.doc_gate, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("diff vazio (nada alterado) -> nenhum flag (conservador)", () => {
  const dir = makeFixture();
  try {
    const plan = planFor(dir, ["--json"]);
    assert.equal(plan.totalArquivosAlterados, 0);
    assert.equal(plan.docs_only, false);
    assert.equal(plan.doc_gate, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

