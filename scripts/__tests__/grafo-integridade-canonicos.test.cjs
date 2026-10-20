// Contrato dos invariantes canônicos do grafo (PR-A normalização AI-first 2026-09-06):
//   S2 — validador de integridade conhece composição de agregados (zero "🟢 sem log" perene);
//   S3 — nó sem campo snapshot = ERRO (guard; hoje nenhum nó viola);
//   deprecado canônico = campo `deprecated` (nota com "deprecated" não é morte).
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "..", "validar-integridade.cjs");

test("validar-integridade (repo real): guard snapshot ativo e zero nós sem snapshot", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Todos os nós têm campo snapshot declarado/);
  assert.doesNotMatch(r.stdout, /não tem campo snapshot declarado/);
});

test("validar-integridade (repo real): composição de agregados elimina o ruído '🟢 sem log'", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /sem log de execução/);
});
