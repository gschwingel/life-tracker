// scripts/__tests__/golden-retrieval-alvos.test.cjs
// FR-HARDENING-GATES-FIXTURE (P09, 2026-09-21): gate de existência de alvos da
// fixture dourada. Fonte: FRAME-REMN-CALENDAR-LEITURA-20260920-log.md L154
// ("Candidato a gate futuro: test:scripts validar que todo alvo da fixture existe
// na árvore") — teria interceptado o P1 da fixture do DRIVE (query órfã) ANTES do CI.
//
// Regra (decisão do snapshot): test:scripts FALHA (exit 1) se qualquer `expected`
// de qualquer query da fixture — INCLUÍDAS as `knownLimitation` — apontar para
// arquivo ausente na árvore (fixture fossilizada = gate mentindo). A mensagem
// nomeia a query e o path do alvo ausente.
//
// DEV-INV-05: LÊ a fixture e NUNCA a escreve — retirar/retarget de query exige
// veredito humano (precedentes ONDA-A / PATCH-VETORIAL-FIXTURE). Verificável por
// `git status` limpo após rodar.
//
// Contrato de descoberta: *.test.cjs em scripts/__tests__ (run-test-scripts.cjs) —
// roda em todo `npm run test:scripts` (local + merge-gate + gate integral).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const FIXTURE = path.join(__dirname, "golden-retrieval.fixture.json");

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

test("golden fixture: todo alvo (expected, incl. knownLimitation) existe na árvore", () => {
  assert.ok(Array.isArray(fixture.queries) && fixture.queries.length > 0, "fixture sem queries");
  const ausentes = [];
  for (const q of fixture.queries) {
    for (const alvo of q.expected || []) {
      if (!fs.existsSync(path.join(ROOT, alvo))) {
        ausentes.push(`"${q.query}" -> ${alvo}`);
      }
    }
  }
  assert.deepEqual(
    ausentes,
    [],
    "alvo(s) ausente(s) na árvore — fixture fossilizada; retirar/retarget exige " +
      `veredito humano (DEV-INV-05):\n  ${ausentes.join("\n  ")}`,
  );
});
