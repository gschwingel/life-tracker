"use strict";
// Suite: verificar-fechamento-frames — regra de identidade (quem exige nó).
// D3 (#1168) tapa o furo de fechamento de FRAMES; a isenção de logs-evidência
// de patch/lane (FLUXO-LANES §1/§2: "patch não cunha nó; entrega = log E3")
// corrige a colisão de 2026-10-07 (veredito Igor: "mudar o gate agora").

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { IDENTIDADE_RE, exigeNo, normalizarIdLog, LOG_RE } = require("../verificar-fechamento-frames.cjs");

test("identidade: KF/FR/SP/FRAME/LANE exigem nó no grafo", () => {
  for (const id of [
    "FR-OAE-CONTRATO-01",
    "SP-PATCH-STT-MOBILE-20260923",
    "KF-19",
    "FRAME-FIM-FILA-EAGER-20261006",
    "LANE-DOCS",
  ]) {
    assert.equal(exigeNo(id), true, id);
  }
});

test("log-evidência de patch/auditoria/lane livre é isento (FLUXO-LANES §1/§2)", () => {
  for (const id of [
    "PATCH-FILA-CHECKS-MSS-FIRST-20261006",
    "PATCH-SKIP-WRITE-CHURN-TIMESTAMP-20261006",
    "PATCH-REVERTE-FLIP-OAE-20261006",
    "FIX-SONO-T2-PROMPT-HARDENING-20260830",
    "CHORE-EXEMPLO-20261007",
    "HARDENING-M3-M4-LOW-20260928",
    "MERGE-FR-06",
    "AUDITORIA-FDV-EXEC-SP-SONO-ANCORAGEM",
    "2026-09-26-ERRATA-SWEEP-LFS-POINTER",
    "5S",
  ]) {
    assert.equal(exigeNo(id), false, id);
  }
});

test("o prefixo de identidade é ANCORADO no início (MERGE-FR-06 não casa por conter FR-)", () => {
  assert.equal(IDENTIDADE_RE.test("MERGE-FR-06"), false);
  assert.equal(IDENTIDADE_RE.test("FR-"), true);
});

test("REGRESSÃO 2026-10-07: os 3 logs desta sessão seriam reprovados sem a isenção", () => {
  // Antes da isenção, o gate exigia nó para TODO log novo — impossibilitava o
  // log E3 de patch que o FLUXO-LANES manda escrever (pr-gate do #1178).
  const ids = [
    "PATCH-FILA-CHECKS-MSS-FIRST-20261006",
    "PATCH-SKIP-WRITE-CHURN-TIMESTAMP-20261006",
    "PATCH-REVERTE-FLIP-OAE-20261006",
  ];
  assert.ok(ids.every((id) => !exigeNo(id)));
});

test("REGRESSÃO 2026-10-11: o sufixo -E3 do log não é identidade (o nó é do FRAME)", () => {
  // Sem a normalização, o ID derivado de `FRAME-X-E3-log.md` era `FRAME-X-E3`
  // e o gate reprovava o PR do frame legítimo (caso: FRAME-REMOCAO-STEPUP-
  // AUTOMERGE-20261011, o 1º E3 log de frame adicionado após o gate de 2026-10-07).
  const m = LOG_RE.exec("LILA-DEV/execucao/logs/FRAME-X-E3-log.md");
  assert.ok(m, "LOG_RE precisa casar o log E3");
  assert.equal(normalizarIdLog(m[1]), "FRAME-X");
  assert.equal(exigeNo(normalizarIdLog(m[1])), true, "segue exigindo o nó do FRAME");

  // Log principal (sem -E3) permanece intacto.
  const principal = LOG_RE.exec("LILA-DEV/execucao/logs/FRAME-X-log.md");
  assert.ok(principal);
  assert.equal(normalizarIdLog(principal[1]), "FRAME-X");

  // Um id que legitimamente termine em -E3 não é mutilado além do sufixo único.
  assert.equal(normalizarIdLog("FRAME-E3-E3"), "FRAME-E3");
});
