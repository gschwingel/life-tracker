// scripts/__tests__/lila-models.test.cjs
// Testes do CLI consolidado de modelos (hardening 2026-08-23).
// Cobrem caminhos sem rede: help, args ausentes, subcomando desconhecido,
// inspect sem id. Caminhos com fetch (search/check/qi/inspect com id) são
// validados por execução real no fechamento (casos válidos + casos de erro).
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { spawnSync } = require("child_process");

const CLI = path.join(__dirname, "..", "lila-models.cjs");

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("lila-models --help sai com 0 e imprime uso", () => {
  const r = run(["--help"]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Uso: node scripts\/lila-models\.cjs <subcomando> \[args\]/);
});

test("lila-models sem subcomando sai com 1 e imprime uso", () => {
  const r = run([]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /Uso: node scripts\/lila-models\.cjs <subcomando> \[args\]/);
});

test("lila-models com subcomando desconhecido sai com 1", () => {
  const r = run(["nao-existe"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /Subcomando desconhecido: nao-existe/);
});

test("lila-models inspect sem id sai com 1 e imprime uso", () => {
  const r = run(["inspect"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /Uso: node scripts\/lila-models\.cjs inspect <id>/);
});