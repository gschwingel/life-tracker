// scripts/__tests__/run-gate.test.cjs
// Suíte: decideSkip do run-gate.cjs — short-circuit por tier (doc-only/doc-gate/full)
// a partir do plano do select-tests.cjs (fonte única). Roda via npm run test:scripts.
// A execução REAL do runner (com diff mockado via working tree) é feita fora da suíte
// — o run-gate opera sobre o repo real; casos de integração estão no log E3 do patch.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { decideSkip } = require("../run-gate.cjs");

test("tier 1: plano docs_only -> skip doc-only", () => {
  assert.equal(decideSkip({ docs_only: true, doc_gate: false, fullSuite: false }), "doc-only");
});

test("tier 2: plano doc_gate -> skip doc-gate", () => {
  assert.equal(decideSkip({ docs_only: false, doc_gate: true, fullSuite: false }), "doc-gate");
});

test("diff misto (.md + .ts): plano sem flags -> gate integral (fallback conservador)", () => {
  assert.equal(decideSkip({ docs_only: false, doc_gate: false, fullSuite: false, classes: { docs: 1, frontend: 1 } }), "full");
});

test("package.json (config_shared, fullSuite) -> gate integral", () => {
  assert.equal(decideSkip({ docs_only: false, doc_gate: false, fullSuite: true }), "full");
});

test("path desconhecido (other, sem flags) -> gate integral", () => {
  assert.equal(decideSkip({ docs_only: false, doc_gate: false, fullSuite: false, classes: { other: 1 } }), "full");
});

test("plano null/undefined/invalido -> gate integral (E-INV-16)", () => {
  assert.equal(decideSkip(null), "full");
  assert.equal(decideSkip(undefined), "full");
  assert.equal(decideSkip("nope"), "full");
});

test("fullSuite vence mesmo com docs_only true (defensivo)", () => {
  assert.equal(decideSkip({ docs_only: true, fullSuite: true }), "full");
});

test("plano vazio ({}): sem flags -> gate integral", () => {
  assert.equal(decideSkip({}), "full");
});