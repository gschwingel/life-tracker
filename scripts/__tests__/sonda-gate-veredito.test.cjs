// scripts/__tests__/sonda-gate-veredito.test.cjs
// Veredito ESTRITO do gate de fold (deliberação Igor 2026-09-29) — casos r1/r2
// de REPROVAÇÃO e a1-a4 de AVISO, contra relatórios reais da sonda.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { execFileSync } = require("child_process");

const { decidirVeredito } = require("../sonda-gate-rodar.cjs");

const REPO = path.resolve(__dirname, "..", "..");

const rel = (sum, qa, syn, extra = {}) => ({
  score: 90,
  pass: sum && qa && syn,
  checks: {
    summarization: { pass: sum, retencao: sum ? 0.9 : 0.4 },
    qaProbe: { pass: qa, retencao: qa ? 0.9 : 0.4 },
    syntheticEdits: { pass: syn, accuracy: syn ? 1 : 0.4 },
  },
  ...extra,
});

test("r1 — Q+A abaixo do piso REPROVA mesmo com as outras 2 provas perfeitas (prova decisiva)", () => {
  const v = decidirVeredito(rel(true, false, true));
  assert.strictEqual(v.veredito, "REPROVA");
  assert.match(v.motivo, /r1/);
});

test("r2 — 2+ provas abaixo do piso REPROVA (sinal convergente)", () => {
  const v = decidirVeredito(rel(false, true, false));
  assert.strictEqual(v.veredito, "REPROVA");
  assert.match(v.motivo, /r2/);
  const v2 = decidirVeredito(rel(false, false, false));
  assert.strictEqual(v2.veredito, "REPROVA");
});

test("a3 — só sumarização abaixo do piso = AVISO (variância do medidor provada no MCP-GRAFO #933)", () => {
  // Caso REAL medido: 0.69/0.80/1.0 — o estrito NÃO teria travado o fold #898.
  const v = decidirVeredito(rel(false, true, true));
  assert.strictEqual(v.veredito, "AVISO");
  assert.match(v.motivo, /isolada/);
});

test("a4 — só edição sintética abaixo do piso = AVISO (suspeita, não condenação)", () => {
  const v = decidirVeredito(rel(true, true, false));
  assert.strictEqual(v.veredito, "AVISO");
});

test("PASSA — 3 provas ok", () => {
  assert.strictEqual(decidirVeredito(rel(true, true, true)).veredito, "PASSA");
});

test("a1 — sonda indisponível = AVISO (gate que reprova por infra trava o repo à toa)", () => {
  const v = decidirVeredito({ erro: "OpenRouter HTTP 502" });
  assert.strictEqual(v.veredito, "AVISO");
});

test("a2 — doc sem baseline = AVISO (não há o que medir)", () => {
  const v = decidirVeredito({ skip: true, motivo: "sem baseline — sondagem manual" });
  assert.strictEqual(v.veredito, "AVISO");
});

test("CLI estrito: exit 0 com PASSA/AVISO (mock não reproduz — smoke de estrutura)", () => {
  const out = execFileSync("node", [path.join(REPO, "scripts", "sonda-gate-rodar.cjs"), "--doc", "docs/ANTI-STALL.md", "--skip-probe"], {
    encoding: "utf8", cwd: REPO,
  });
  const json = JSON.parse(out.slice(0, out.lastIndexOf("}") + 1));
  assert.strictEqual(json.skipProbe, true);
});
