// Suite: gerar-manifest-esqueleto — foco no `last_update` CANÔNICO do meta.
// PATCH-DOCS-CHECK-LAST-UPDATE-20260910: o YAML entrega data como objeto `Date`
// e a interpolação crua gravava `Date.toString()` — formato que o docs:check
// (verificar-frescor-docs) rejeita. Estes testes travam a regressão.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dataIso, render } = require("../gerar-manifest-esqueleto.cjs");

const HOJE = new Date().toISOString().slice(0, 10);

test("dataIso: objeto Date (YAML sem aspas) vira YYYY-MM-DD", () => {
  // 2026-09-07T21:00-03:00 == 2026-09-08T00:00Z (mesmo caso do defeito real)
  const d = new Date("2026-09-07T21:00:00-03:00");
  assert.equal(dataIso(d), "2026-09-08");
});

test("dataIso: string ISO é preservada", () => {
  assert.equal(dataIso("2026-09-08"), "2026-09-08");
  assert.equal(dataIso("  2026-09-08  "), "2026-09-08");
});

test("dataIso: timestamp completo é normalizado para o dia", () => {
  assert.equal(dataIso("2026-09-08T00:00:00.000Z"), "2026-09-08");
});

test("dataIso: ausente/vazio cai no dia corrente (ISO)", () => {
  assert.equal(dataIso(undefined), HOJE);
  assert.equal(dataIso(null), HOJE);
  assert.equal(dataIso(""), HOJE);
});

test("dataIso: valor não-data passa verbatim (nunca inventa)", () => {
  assert.equal(dataIso("pendente"), "pendente");
});

test("render: meta carrega last_update=YYYY-MM-DD com data vinda do YAML", () => {
  const fonte = {
    meta: { versao_manifesto: "3.0", last_update: new Date("2026-09-07T21:00:00-03:00") },
    secoes: [],
  };
  const md = render(fonte);
  const linhaMeta = md.split("\n").find((l) => l.startsWith("meta:"));
  assert.ok(linhaMeta, "meta ausente no render");
  assert.match(linhaMeta, /last_update=2026-09-08(\s|\|)/);
  assert.doesNotMatch(linhaMeta, /GMT|Horário Padrão|Mon Sep/);
});

test("render: meta sem last_update usa o dia corrente em ISO", () => {
  const fonte = { meta: { versao_manifesto: "3.0" }, secoes: [] };
  const linhaMeta = render(fonte).split("\n").find((l) => l.startsWith("meta:"));
  assert.match(linhaMeta, new RegExp("last_update=" + HOJE + "(\\s|\\|)"));
});
