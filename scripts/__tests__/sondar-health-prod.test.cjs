// scripts/__tests__/sondar-health-prod.test.cjs
// Self-test da sonda de health de producao (scripts/sondar-health-prod.cjs,
// PATCH-HEALTH-SONDA-NODE-20261003).
//
// Cobre a SPEC do P2 (painel vital, decisao Igor 2026-10-01):
//   - sucesso imediato encerra com 1 sonda (producao saudavel);
//   - blip: sonda 1 falha, sonda 2 passa -> ok (evita vermelho por blip de rota);
//   - 2 sondas falhadas -> NOT ok (exit 1 na CLI);
//   - pausas preservadas (tentativa 15s / entre sondas 60s) via pausaFn espiã;
//   - GET sem token, status != 200, timeout/rede -> falha explicita;
//   - sem URL -> exit 2 (fail-closed, nunca silencioso).
// Roda em CI como parte de `npm run test:scripts` (run-test-scripts.cjs descobre
// scripts/__tests__/*.test.cjs flat).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "sondar-health-prod.cjs"));
const { tentarUmaVez, executarSonda, sondar, formatarRelatorio, parseArgs, main } = mod;

function fetchOk() {
  return async () => ({ status: 200 });
}

function fetchStatus(status) {
  return async () => ({ status });
}

function fetchErro() {
  return async () => {
    throw new Error("network down");
  };
}

/** pausaFn espiã: registra intervalos e resolve na hora (teste sem dormir). */
function pausaEspia(registro) {
  return async (ms) => {
    registro.push(ms);
  };
}

const CFG_RAPIDO = { tentativasPorSonda: 3, pausaTentativaMs: 5, sondas: 2, pausaEntreSondasMs: 7, timeoutMs: 50 };

test("tentarUmaVez: 200 -> ok; outro status e excecao -> falha explicita, nunca lanca", async () => {
  assert.deepStrictEqual(await tentarUmaVez("u", fetchOk(), 10), { ok: true, status: 200, erro: null });
  const ruim = await tentarUmaVez("u", fetchStatus(503), 10);
  assert.strictEqual(ruim.ok, false);
  assert.match(ruim.erro, /HTTP 503/);
  const rede = await tentarUmaVez("u", fetchErro(), 10);
  assert.strictEqual(rede.ok, false);
  assert.match(rede.erro, /network down/);
});

test("executarSonda: sucesso na 1a tentativa encerra sem pausa", async () => {
  const pausas = [];
  const sonda = await executarSonda({ url: "u", fetchImpl: fetchOk(), tentativas: 3, pausaTentativaMs: 5, timeoutMs: 50, pausaFn: pausaEspia(pausas) });
  assert.strictEqual(sonda.ok, true);
  assert.strictEqual(sonda.tentativasFeitas.length, 1);
  assert.deepStrictEqual(pausas, []);
});

test("executarSonda: falha esgota as tentativas com pausa entre elas", async () => {
  const pausas = [];
  const sonda = await executarSonda({ url: "u", fetchImpl: fetchStatus(500), tentativas: 3, pausaTentativaMs: 5, timeoutMs: 50, pausaFn: pausaEspia(pausas) });
  assert.strictEqual(sonda.ok, false);
  assert.strictEqual(sonda.tentativasFeitas.length, 3);
  assert.deepStrictEqual(pausas, [5, 5]);
});

test("sondar: producao saudavel encerra na 1a sonda (sem pausa entre sondas)", async () => {
  const pausas = [];
  const r = await sondar({ url: "u", fetchImpl: fetchOk(), pausaFn: pausaEspia(pausas), opcoes: CFG_RAPIDO });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sondasFeitas.length, 1);
  assert.deepStrictEqual(pausas, []);
});

test("sondar: blip (sonda 1 falha, sonda 2 passa) -> ok com pausa entre sondas", async () => {
  const pausas = [];
  let chamadas = 0;
  const fetchInstavel = async () => {
    chamadas += 1;
    // Sonda 1: 3 tentativas ruins; sonda 2: 200 logo na 1a tentativa.
    return chamadas <= 3 ? { status: 503 } : { status: 200 };
  };
  const r = await sondar({ url: "u", fetchImpl: fetchInstavel, pausaFn: pausaEspia(pausas), opcoes: CFG_RAPIDO });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sondasFeitas.length, 2);
  assert.deepStrictEqual(pausas, [5, 5, 7]);
});

test("sondar: 2 sondas falhadas -> not ok (exit 1 na CLI), pausa entre sondas respeitada", async () => {
  const pausas = [];
  const r = await sondar({ url: "u", fetchImpl: fetchStatus(503), pausaFn: pausaEspia(pausas), opcoes: CFG_RAPIDO });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.sondasFeitas.length, 2);
  assert.deepStrictEqual(pausas, [5, 5, 7, 5, 5]);
});

test("formatarRelatorio: nomeia url, marca falhas e veredicto (ASCII)", async () => {
  const r = await sondar({ url: "https://prod", fetchImpl: fetchErro(), pausaFn: pausaEspia([]), opcoes: { tentativasPorSonda: 1, sondas: 1, pausaTentativaMs: 1, pausaEntreSondasMs: 1, timeoutMs: 10 } });
  const texto = formatarRelatorio("https://prod/api/v1/health", r);
  assert.match(texto, /https:\/\/prod\/api\/v1\/health/);
  assert.match(texto, /network down/);
  assert.match(texto, /nunca silencioso/);
  assert.ok([...texto].every((ch) => (ch.codePointAt(0) ?? 0) < 128), "relatorio deve ser ASCII");
});

test("parseArgs: flags canonicas e falha explicita em entrada invalida", () => {
  assert.deepStrictEqual(parseArgs([]), { url: null, json: false });
  assert.strictEqual(parseArgs(["--json"]).json, true);
  assert.strictEqual(parseArgs(["--url", "https://x"]).url, "https://x");
  assert.throws(() => parseArgs(["--foo"]), /flag desconhecida/);
});

test("main: sem url em argv nem env -> exit 2 (fail-closed, sem consulta)", async () => {
  const antes = process.env.RAILWAY_PUBLIC_URL;
  delete process.env.RAILWAY_PUBLIC_URL;
  const codigo = await main([]);
  assert.strictEqual(codigo, 2);
  if (antes !== undefined) process.env.RAILWAY_PUBLIC_URL = antes;
});

test("main: sonda ok -> exit 0; producao fora -> exit 1 (fetch injetado via sondar)", async () => {
  // main() usa globalThis.fetch — injeta, roda, restaura.
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = fetchOk();
    assert.strictEqual(await main(["--url", "https://prod"]), 0);
    globalThis.fetch = fetchStatus(503);
    assert.strictEqual(await main(["--url", "https://prod"]), 1);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
