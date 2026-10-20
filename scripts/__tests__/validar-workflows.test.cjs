"use strict";

// Testes do gate de higiene de workflows (C1 do PATCH-OTIMIZACAO-PR-CI-FAILFAST).
// R4 — actions/setup-node deve usar SEMPRE a versão canônica do pipeline. Sem esta
// regra, o job manifest-frescor voltou a ficar em @v4 enquanto pr-gate/merge-gate
// usavam @v7 (drift silencioso de cache/runtime no mesmo evento de PR).
// Estratégia: fixtures em tmp + spawn do validador com LILA_WF_DIR (o script lê a
// pasta real por padrão) — cobre a decisão end-to-end, sem tocar .github/workflows.

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "..", "validar-workflows.cjs");
const V7 = "v7";
const V4 = "v4";
// R5 (HB-011): versão canônica injetada nos testes — o validador tem override por
// env justamente para o teste não depender do .nvmrc real (que muda por decisão
// humana). Se o override falhar, o teste falha por medição, nunca por sorte.
const NODE_CANON = "22.22.2";

/** Workflow mínimo conforme (timeout + concurrency) parametrizado pela action. */
function workflowYaml({ setupNode, checkout, timeout = true, nodeVersion = NODE_CANON }) {
  const linhas = [
    "name: fixture",
    "on: [push]",
    "jobs:",
    "  a:",
    "    runs-on: ubuntu-latest",
  ];
  if (timeout) linhas.push("    timeout-minutes: 5");
  linhas.push("    concurrency:");
  linhas.push("      group: fixture-" + "${ github.ref }");
  linhas.push("      cancel-in-progress: true");
  linhas.push("    steps:");
  if (checkout) linhas.push(`      - uses: actions/checkout@${checkout}`);
  if (setupNode) {
    linhas.push(`      - uses: actions/setup-node@${setupNode}`);
    linhas.push("        with:");
    linhas.push(`          node-version: ${nodeVersion}`);
    linhas.push("          cache: npm");
  }
  linhas.push("      - run: echo ok");
  return linhas.join("\n") + "\n";
}

function fixtureDir(nome, yaml) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `validar-wf-${nome}-`));
  fs.writeFileSync(path.join(tmp, "fixture.yml"), yaml);
  return tmp;
}

function runValidator(dir, envExtra = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, LILA_WF_DIR: dir, LILA_NODE_VERSION: NODE_CANON, ...envExtra },
  });
}

test("R4: setup-node@v4 convivendo com a versão canônica → BLOQUEIA com violação legível", () => {
  const dir = fixtureDir("drift", workflowYaml({ setupNode: V4 }));
  const r = runValidator(dir);
  assert.equal(r.status, 1, "drift de versão deve falhar o gate");
  assert.match(r.stderr, /actions\/setup-node@v4/);
  assert.match(r.stderr, new RegExp(`versão canônica do pipeline é @${V7}`));
});

test("R4: setup-node na versão canônica → PASSA e o resumo declara a versão", () => {
  const dir = fixtureDir("canonico", workflowYaml({ setupNode: V7 }));
  const r = runValidator(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`setup-node@${V7}`));
});

test("R4: drift é reportado junto das demais violações (não mascara higiene R2/R3)", () => {
  const dir = fixtureDir("misto", workflowYaml({ setupNode: V4, timeout: false }));
  const r = runValidator(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /sem timeout-minutes/);
  assert.match(r.stderr, /actions\/setup-node@v4/);
});

test("R4: outras actions fora da versão canônica não disparam a regra (escopo é setup-node)", () => {
  const dir = fixtureDir("outras", workflowYaml({ setupNode: V7, checkout: V4 }));
  const r = runValidator(dir);
  assert.equal(r.status, 0, r.stderr);
});

test("R4: job sem nenhum setup-node → neutro (regra não inventa ocorrência)", () => {
  const dir = fixtureDir("sem-node", workflowYaml({ setupNode: null }));
  const r = runValidator(dir);
  assert.equal(r.status, 0, r.stderr);
});

// ── R5 (HB-011) — versão canônica de NODE (`.nvmrc`) ─────────────────────────

test("R5: node-version divergente da canônica → BLOQUEIA com violação legível", () => {
  const dir = fixtureDir("node-drift", workflowYaml({ setupNode: V7, nodeVersion: "20" }));
  const r = runValidator(dir);
  assert.equal(r.status, 1, "drift de versão de Node deve falhar o gate");
  assert.match(r.stderr, /node-version: 20/);
  assert.match(r.stderr, new RegExp(`versao canonica \\('\\.nvmrc'\\) e ${NODE_CANON}`));
});

test("R5: node-version na canônica → PASSA e o resumo declara a versão de Node", () => {
  const dir = fixtureDir("node-canon", workflowYaml({ setupNode: V7 }));
  const r = runValidator(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`node ${NODE_CANON.replace(/\./g, "\\.")}`));
});

test("R5: `.nvmrc` ilegível → regra NEUTRA (não inventa violação) e o resumo declara a ausência", () => {
  const dir = fixtureDir("node-sem-nvmrc", workflowYaml({ setupNode: V7, nodeVersion: "20" }));
  const r = runValidator(dir, { LILA_NODE_VERSION: "" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sem \.nvmrc/);
});

test("R5: drift de Node reportado junto das demais violações (não mascara R2/R3/R4)", () => {
  const dir = fixtureDir(
    "node-misto",
    workflowYaml({ setupNode: V4, nodeVersion: "20", timeout: false }),
  );
  const r = runValidator(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /sem timeout-minutes/);
  assert.match(r.stderr, /actions\/setup-node@v4/);
  assert.match(r.stderr, /node-version: 20/);
});
