// scripts/__tests__/jev-corpus-health.test.cjs
// PATCH-JEV-CORPUS-GUARD-20261004 — suíte node:test do núcleo puro de saúde do corpus JEV.
// O caso 1 é o REPLAY do incidente de 2026-10-04 com os NÚMEROS REAIS medidos em produção
// (869 turnos Auto, 867 em `jev_contract_mismatch`, `jev_confidence`/`jev_probabilities`
// 100% NULL): a guarda PRECISA gritar nesse shape — é a garantia de que o silêncio não
// volta a ser descoberto só na calibração.
const { test } = require("node:test");
const assert = require("node:assert");

const {
  ALARMS,
  LIMIAR_MISMATCH_PCT,
  MIN_AUTO_PARA_SEM_DECISAO,
  evaluateCorpusHealth,
} = require("../lib/jev-corpus-health.cjs");

/** Linha do log shadow no shape mínimo do veredito (defaults = turno Auto saudável). */
function linha(over = {}) {
  return {
    auto_mode: true,
    jev_choice: null,
    jev_confidence: 0.5,
    jev_probabilities: { L1: 0.6, L2: 0.3, L3: 0.1 },
    jev_model: "typesafe/jev-1.13-20260917",
    fallback_reason: null,
    ...over,
  };
}

/** Repete `n` linhas (mesmo shape). */
function repetir(n, over = {}) {
  return Array.from({ length: n }, () => linha(over));
}

test("REPLAY do incidente 2026-10-04 (869 Auto / 867 mismatch / confiança 100% NULL) ALARMA", () => {
  const mismatch = {
    fallback_reason: "jev_contract_mismatch",
    jev_confidence: null,
    jev_probabilities: null,
    jev_choice: null,
  };
  // 867 linhas no shape do incidente + 2 no mesmo shape (869 Auto no total, como medido).
  const rows = repetir(869, mismatch);
  const h = evaluateCorpusHealth(rows);

  assert.strictEqual(h.autoN, 869);
  assert.strictEqual(h.mismatchN, 869);
  assert.ok(h.mismatchPct > LIMIAR_MISMATCH_PCT, `mismatchPct=${h.mismatchPct} deve exceder ${LIMIAR_MISMATCH_PCT}`);
  assert.strictEqual(h.confidenceFilledPct, 0);
  assert.strictEqual(h.probabilitiesFilledPct, 0);
  assert.strictEqual(h.saudavel, false);
  assert.deepStrictEqual(h.alarms.sort(), [
    ALARMS.MISMATCH_ALTO,
    ALARMS.SEM_CONFIANCA,
    ALARMS.SEM_PROBABILIDADES,
  ].sort());
  // amostra grande + nenhum veredito => aviso âmbar (não é defeito de contrato)
  assert.deepStrictEqual(h.avisos, [ALARMS.SEM_DECISAO]);
});

test("o DRIFT de snapshot sozinho NÃO alarma saúde se a resposta é medida (modelo presente)", () => {
  const h = evaluateCorpusHealth(repetir(30, { fallback_reason: "low_confidence", jev_confidence: 0.44 }));
  assert.deepStrictEqual(h.alarms, []);
  assert.strictEqual(h.saudavel, true);
  assert.strictEqual(h.confidenceFilledPct, 100);
  assert.strictEqual(h.probabilitiesFilledPct, 100);
});

test("caso SÃO real pós-fix (7 turnos Auto, low_confidence) NÃO alarma e NÃO avisa", () => {
  const rows = [
    linha({ jev_confidence: 0.57, fallback_reason: "low_confidence" }),
    linha({ jev_confidence: 0.23, fallback_reason: "low_confidence" }),
    linha({ jev_confidence: 0.61, fallback_reason: "low_confidence" }),
    linha({ jev_confidence: 0.25, fallback_reason: "low_confidence" }),
    linha({ jev_confidence: 0.58, fallback_reason: "low_confidence" }),
    linha({ jev_confidence: 0.35, fallback_reason: "low_confidence" }),
    linha({ jev_confidence: 0.52, fallback_reason: "low_confidence" }),
  ];
  const h = evaluateCorpusHealth(rows);
  assert.strictEqual(h.autoN, 7);
  assert.deepStrictEqual(h.alarms, []);
  assert.deepStrictEqual(h.avisos, []); // autoN < MIN_AUTO_PARA_SEM_DECISAO
  assert.strictEqual(h.saudavel, true);
});

test("mismatch ABAIXO do limiar não alarma (5% < 10%)", () => {
  const rows = [...repetir(95, { fallback_reason: "low_confidence" }), ...repetir(5, {
    fallback_reason: "jev_contract_mismatch",
    jev_confidence: 0.5,
  })];
  const h = evaluateCorpusHealth(rows);
  assert.strictEqual(h.mismatchPct, 5);
  assert.strictEqual(h.alarms.includes(ALARMS.MISMATCH_ALTO), false);
  assert.deepStrictEqual(h.alarms, []);
  assert.strictEqual(h.saudavel, true);
});

test("mismatch EXATAMENTE no limiar não alarma (10% não é > 10%)", () => {
  const rows = [...repetir(90), ...repetir(10, { fallback_reason: "jev_contract_mismatch" })];
  const h = evaluateCorpusHealth(rows);
  assert.strictEqual(h.mismatchPct, 10);
  assert.strictEqual(h.alarms.includes(ALARMS.MISMATCH_ALTO), false);
});

test("SEM_DECISAO só dispara com amostra >= 20 e ZERO vereditos", () => {
  const poucos = evaluateCorpusHealth(repetir(19, { fallback_reason: "low_confidence" }));
  assert.deepStrictEqual(poucos.avisos, []);
  const muitos = evaluateCorpusHealth(repetir(20, { fallback_reason: "low_confidence" }));
  assert.deepStrictEqual(muitos.avisos, [ALARMS.SEM_DECISAO]);
  assert.deepStrictEqual(muitos.alarms, []); // âmbar, não vermelho
});

test("SEM_DECISAO NÃO dispara quando há veredito (mesmo que poucos)", () => {
  const rows = [...repetir(30, { fallback_reason: "low_confidence" }), linha({ jev_choice: "L3", fallback_reason: null })];
  const h = evaluateCorpusHealth(rows);
  assert.deepStrictEqual(h.avisos, []);
  assert.ok(h.decisionRate > 0);
});

test("linhas não-Auto (auto_mode false/null) são OUTRA população — não entram no veredito", () => {
  const rows = [
    linha({ auto_mode: false, jev_confidence: null, fallback_reason: null }),
    linha({ auto_mode: null, jev_confidence: null, fallback_reason: null }),
    linha({ auto_mode: true, jev_confidence: 0.9, fallback_reason: "low_confidence" }),
  ];
  const h = evaluateCorpusHealth(rows);
  assert.strictEqual(h.autoN, 1);
  assert.strictEqual(h.confidenceFilledPct, 100);
  assert.deepStrictEqual(h.alarms, []); // as duas não-Auto NULL não contaminam
});

test("autoN = 0 (sem turnos Auto) NÃO alarma nem avisa", () => {
  const h = evaluateCorpusHealth([]);
  assert.strictEqual(h.autoN, 0);
  assert.deepStrictEqual(h.alarms, []);
  assert.deepStrictEqual(h.avisos, []);
  assert.strictEqual(h.saudavel, true);
  assert.strictEqual(h.mismatchPct, 0); // sem NaN
});

test("entrada inválida (não-array) é tratada como vazia — nunca lança", () => {
  for (const entrada of [null, undefined, 42, "x", {}]) {
    const h = evaluateCorpusHealth(entrada);
    assert.strictEqual(h.autoN, 0);
    assert.deepStrictEqual(h.alarms, []);
  }
});

test("confiança 0 é valor MEDIDO (não confundir com null)", () => {
  const h = evaluateCorpusHealth(repetir(3, { jev_confidence: 0 }));
  assert.strictEqual(h.confidenceFilledPct, 100);
  assert.strictEqual(h.alarms.includes(ALARMS.SEM_CONFIANCA), false);
});

test("cada campo é isolado (só probabilidades NULL alarma só probabilidades)", () => {
  const soSemProb = evaluateCorpusHealth(repetir(3, { jev_probabilities: null }));
  assert.deepStrictEqual(soSemProb.alarms, [ALARMS.SEM_PROBABILIDADES]);
  const soSemModelo = evaluateCorpusHealth(repetir(3, { jev_model: null }));
  assert.deepStrictEqual(soSemModelo.alarms, [ALARMS.SEM_MODELO]);
});

test("constantes exportadas batem com o contrato declarado", () => {
  assert.strictEqual(LIMIAR_MISMATCH_PCT, 10);
  assert.strictEqual(MIN_AUTO_PARA_SEM_DECISAO, 20);
  assert.strictEqual(ALARMS.SEM_CONFIANCA, "CORPUS_SEM_CONFIANCA");
  assert.strictEqual(ALARMS.MISMATCH_ALTO, "CORPUS_CONTRACT_MISMATCH_ALTO");
});

