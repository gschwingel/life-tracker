"use strict";

// Testes do executor de audits paralelos (C2 do PATCH-OTIMIZACAO-PR-CI-FAILFAST).
// Invariantes cobertas: falha de um audit nunca e mascarada pelo outro; retry
// preservado; retry esgotado permanece BLOQUEANTE; exit code agregado nunca zero
// diante de falha. Runner injetado (fake) — nenhum teste toca a rede.

const { test } = require("node:test");
const assert = require("node:assert");
const { runAudits, runAudit, exitCodeFor, classifyAuditFailure } = require("../run-audits-parallel.cjs");

const RAIZ = { id: "raiz" };
const BACKEND = { id: "backend" };
const SILENCIOSO = { log: () => {}, sleep: async () => {} };

/** Runner fake: mapa id -> lista de respostas por tentativa ({code, output}). */
function fakeRunner(respostas) {
  const chamadas = {};
  const runner = async (target) => {
    chamadas[target.id] = (chamadas[target.id] || 0) + 1;
    const fila = respostas[target.id];
    const i = Math.min(chamadas[target.id] - 1, fila.length - 1);
    const r = typeof fila[i] === "function" ? await fila[i]() : fila[i];
    return r;
  };
  runner.chamadas = chamadas;
  return runner;
}

const OK = { code: 0, output: "found 0 vulnerabilities" };
const HIGH = { code: 1, output: "found 2 vulnerabilities (1 moderate, 1 high)" };
const REGISTRY = { code: 1, output: "npm ERR! code EAI_AGAIN registry.npmjs.org" };

test("C2: ambos passam → agregado verde", async () => {
  const runner = fakeRunner({ raiz: [OK], backend: [OK] });
  const { ok, results } = await runAudits([RAIZ, BACKEND], { ...SILENCIOSO, runner });
  assert.equal(ok, true);
  assert.equal(exitCodeFor(results), 0);
  assert.deepEqual(results.map((r) => r.id), ["raiz", "backend"]);
});

test("C2: raiz falha e backend passa → BLOQUEIA (falha nao e mascarada)", async () => {
  const runner = fakeRunner({ raiz: [HIGH, HIGH, HIGH], backend: [OK] });
  const { ok, results } = await runAudits([RAIZ, BACKEND], { ...SILENCIOSO, runner });
  assert.equal(ok, false);
  assert.equal(exitCodeFor(results), 1);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].causa, "vulnerabilidade");
  assert.equal(results[1].ok, true);
});

test("C2: backend falha e raiz passa → BLOQUEIA", async () => {
  const runner = fakeRunner({ raiz: [OK], backend: [HIGH, HIGH, HIGH] });
  const { ok, results } = await runAudits([RAIZ, BACKEND], { ...SILENCIOSO, runner });
  assert.equal(ok, false);
  assert.equal(results[1].ok, false);
  assert.equal(results[0].ok, true);
});

test("C2: ambos falham → BLOQUEIA com duas causas", async () => {
  const runner = fakeRunner({ raiz: [HIGH, HIGH, HIGH], backend: [REGISTRY, REGISTRY, REGISTRY] });
  const { results } = await runAudits([RAIZ, BACKEND], { ...SILENCIOSO, runner });
  assert.equal(exitCodeFor(results), 1);
  assert.equal(results[0].causa, "vulnerabilidade");
  assert.equal(results[1].causa, "registry");
});

test("C2: um audit demora mais → execucao concorrente (ambos resolvem, sem serializar)", async () => {
  const atraso = (ms, res) => () => new Promise((r) => setTimeout(() => r(res), ms));
  const runner = fakeRunner({ raiz: [atraso(40, OK)], backend: [atraso(5, OK)] });
  const t0 = Date.now();
  const { ok } = await runAudits([RAIZ, BACKEND], { ...SILENCIOSO, runner });
  const decorrido = Date.now() - t0;
  assert.equal(ok, true);
  // Concorrente: wall ~= max(40,5), nunca a soma (45+) — folga generosa p/ CI lento.
  assert.ok(decorrido < 40 + 200, `wall=${decorrido}ms — esperado concorrente`);
});

test("C2: retry recupera falha transitoria de registry (mesmo numero de tentativas)", async () => {
  const runner = fakeRunner({ raiz: [REGISTRY, OK], backend: [REGISTRY, REGISTRY, OK] });
  const { ok, results } = await runAudits([RAIZ, BACKEND], { ...SILENCIOSO, runner, retries: 3 });
  assert.equal(ok, true);
  assert.equal(results[0].tentativas, 2);
  assert.equal(results[1].tentativas, 3);
  assert.equal(runner.chamadas.raiz, 2);
  assert.equal(runner.chamadas.backend, 3);
});

test("C2: retry esgotado permanece BLOQUEANTE (indisponibilidade persistente nunca vira sucesso)", async () => {
  const runner = fakeRunner({ raiz: [REGISTRY], backend: [OK] });
  const r = await runAudit(RAIZ, { ...SILENCIOSO, runner, retries: 3, delayMs: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.tentativas, 3);
  assert.equal(r.causa, "registry");
  assert.equal(runner.chamadas.raiz, 3);
});

test("C2: exit code agregado e 1 para qualquer combinacao com falha", () => {
  assert.equal(exitCodeFor([]), 0, "nenhum audit => nada a bloquear");
  assert.equal(exitCodeFor([{ ok: true }, { ok: true }]), 0);
  assert.equal(exitCodeFor([{ ok: false }, { ok: true }]), 1);
  assert.equal(exitCodeFor([{ ok: true }, { ok: false }]), 1);
  assert.equal(exitCodeFor([{ ok: false }, { ok: false }]), 1);
  assert.equal(exitCodeFor([{ ok: false }, undefined]), 1, "resultado ausente tambem bloqueia");
});

test("C2: classificacao separa vulnerabilidade real de falha de registry", () => {
  assert.equal(classifyAuditFailure(HIGH.output), "vulnerabilidade");
  assert.equal(classifyAuditFailure("1 critical severity vulnerability"), "vulnerabilidade");
  assert.equal(classifyAuditFailure(REGISTRY.output), "registry");
  assert.equal(classifyAuditFailure("npm ERR! code ECONNRESET"), "registry");
  assert.equal(classifyAuditFailure(""), "desconhecida");
});
