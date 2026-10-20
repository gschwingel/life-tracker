/**
 * scripts/lib/jev-corpus-health.cjs
 * PATCH-JEV-CORPUS-GUARD-20261004 (sob work_id FRAME-JEV-BICEFALO-20260924) — núcleo
 * PURO da SAÚDE do corpus do decisor JEV (cabeça reasoning, modo Auto).
 *
 * POR QUE ESTE MÓDULO EXISTE
 * O defeito de 2026-10-04 (envelope do provider mudou para `answers`; o parser lia só o
 * top-level) deixou o corpus SEM SINAL em 867/869 turnos Auto — `jev_confidence` e
 * `jev_probabilities` 100% NULL — e NADA alarmou: o relatório era manual e saía 0, o
 * único alarme era de drift de snapshot. O defeito só apareceu ~10 dias depois, na
 * calibração. Este núcleo transforma a "assinatura do silêncio" em ALARME MECÂNICO.
 *
 * POR QUE .cjs (e não o `jev-corpus.ts` do backend)
 * A guarda roda no ritual SEMANAL (scripts/prune-semanal.cjs), que é um script de raiz e
 * invoca suas guardas com `node <script>.cjs` — sem tsx, sem build. Manter o núcleo em
 * CommonJS é o que permite UMA implementação compartilhada por guarda e teste.
 *
 * INVARIANTES
 *  - PURO: sem I/O, sem banco, sem `Date.now()` — recebe linhas, devolve veredito.
 *  - NUNCA inventa: mede só o que está na linha (`null` = "não medido", nunca 0).
 *  - `alarms` = VERMELHO (defeito provável); `avisos` = ÂMBAR (calibração, não bug).
 */
"use strict";

/** Códigos canônicos de alarme/aviso (strings estáveis — log/alerta dependem delas). */
const ALARMS = {
  /** A assinatura EXATA do incidente 2026-10-04: envelope quebrado. */
  SEM_CONFIANCA: "CORPUS_SEM_CONFIANCA",
  SEM_PROBABILIDADES: "CORPUS_SEM_PROBABILIDADES",
  SEM_MODELO: "CORPUS_SEM_MODELO",
  MISMATCH_ALTO: "CORPUS_CONTRACT_MISMATCH_ALTO",
  /** ÂMBAR: veredito nunca vence — pode ser limiar/calibração, não contrato. */
  SEM_DECISAO: "CORPUS_SEM_DECISAO",
};

/** % de `jev_contract_mismatch` acima do qual o contrato é considerado divergente. */
const LIMIAR_MISMATCH_PCT = 10;
/** Nº mínimo de turnos Auto para o aviso de "nunca decide" (amostra pequena não conta). */
const MIN_AUTO_PARA_SEM_DECISAO = 20;
/** Janela default da guarda (cadência semanal). */
const JANELA_DIAS_DEFAULT = 7;

/** Valor "medido" (nunca confundir null/"" com 0). */
function presente(valor) {
  return valor !== null && valor !== undefined && valor !== "";
}

/** Percentual com 2 casas; denominador 0 => 0 (jamais NaN). */
function pct(numerador, denominador) {
  if (denominador === 0) return 0;
  return Math.round((numerador / denominador) * 10000) / 100;
}

/**
 * Avalia a saúde do corpus em uma lista de linhas do log shadow.
 * Linhas: { auto_mode, jev_choice, jev_confidence, jev_probabilities, jev_model, fallback_reason }.
 * Só `auto_mode === true` entra no veredito (as demais são outra população).
 * Devolve { autoN, mismatchN, mismatchPct, confidenceFilledPct, probabilitiesFilledPct,
 *          modelFilledPct, decisionRate, alarms, avisos, saudavel }.
 */
function evaluateCorpusHealth(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  const auto = lista.filter((r) => r && r.auto_mode === true);
  const autoN = auto.length;

  let mismatchN = 0;
  let confFilled = 0;
  let probsFilled = 0;
  let modelFilled = 0;
  let decididos = 0;
  for (const r of auto) {
    if (r.fallback_reason === "jev_contract_mismatch") mismatchN += 1;
    // confiança 0 é um número MEDIDO (só null/undefined/NaN = não medida).
    if (typeof r.jev_confidence === "number" && Number.isFinite(r.jev_confidence)) confFilled += 1;
    if (presente(r.jev_probabilities)) probsFilled += 1;
    if (presente(r.jev_model)) modelFilled += 1;
    if (presente(r.jev_choice)) decididos += 1;
  }

  const mismatchPct = pct(mismatchN, autoN);
  const confidenceFilledPct = pct(confFilled, autoN);
  const probabilitiesFilledPct = pct(probsFilled, autoN);
  const modelFilledPct = pct(modelFilled, autoN);
  const decisionRate = pct(decididos, autoN);

  const alarms = [];
  const avisos = [];
  if (autoN >= 1) {
    // Bloco "envelope quebrado": houve turno Auto e a resposta não trouxe NADA medível.
    if (confFilled === 0) alarms.push(ALARMS.SEM_CONFIANCA);
    if (probsFilled === 0) alarms.push(ALARMS.SEM_PROBABILIDADES);
    if (modelFilled === 0) alarms.push(ALARMS.SEM_MODELO);
    if (mismatchPct > LIMIAR_MISMATCH_PCT) alarms.push(ALARMS.MISMATCH_ALTO);
    // ÂMBAR: amostra suficiente e nenhum veredito venceu (limiar/calibração).
    if (autoN >= MIN_AUTO_PARA_SEM_DECISAO && decididos === 0) avisos.push(ALARMS.SEM_DECISAO);
  }

  return {
    autoN,
    mismatchN,
    mismatchPct,
    confidenceFilledPct,
    probabilitiesFilledPct,
    modelFilledPct,
    decisionRate,
    alarms,
    avisos,
    saudavel: alarms.length === 0,
  };
}

module.exports = {
  ALARMS,
  LIMIAR_MISMATCH_PCT,
  MIN_AUTO_PARA_SEM_DECISAO,
  JANELA_DIAS_DEFAULT,
  evaluateCorpusHealth,
};
