"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runGrafoGates } = require("../pre-push.cjs");

function fixtureGrafo(frames) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-gate-"));
  fs.writeFileSync(path.join(tmp, "grafo.json"), JSON.stringify({ keyframes: [], sprints: [], frames }, null, 2));
  fs.writeFileSync(path.join(tmp, "grafo-historico.json"), JSON.stringify({ keyframes: [], sprints: [], frames: [] }, null, 2));
  fs.writeFileSync(path.join(tmp, "candidatos.json"), JSON.stringify({ schema: "review-v1", checker: { candidatos: [] } }, null, 2));
  const logDir = path.join(tmp, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  for (const fr of frames) {
    fs.writeFileSync(path.join(logDir, fr.id + "-log.md"), "log fixture");
  }
  return {
    grafoPath: path.join(tmp, "grafo.json"),
    historicoPath: path.join(tmp, "grafo-historico.json"),
    candidatosPath: path.join(tmp, "candidatos.json"),
    envBase: { LILA_GRAFO_PATH: path.join(tmp, "grafo.json"), LILA_GRAFO_HISTORICO: path.join(tmp, "grafo-historico.json"), LILA_GRAFO_CANDIDATOS: path.join(tmp, "candidatos.json") }
  };
}

test("pre-push (T6): ERRO no ativo (fixture) → gate BLOQUEIA com os 3 gates na lista", () => {
  const f = fixtureGrafo([
    { id: "FR-MORTO", estado: "🟢", area_tatica: "ferramentas", codigo: ["backend/src/services/tool-planner.ts"] },
    { id: "SP-BAD", estado: "🟢", area_tatica: "ferramentas", pai: "KF-INEXISTENTE" }
  ]);
  const falhas = runGrafoGates(f.envBase);
  // pai inexistente (ERRO no T2/T3) + codigo-morto (ERRO no T5, sem candidato registrado)
  assert.deepEqual(falhas, [
    "grafo: referências do universo consolidado (T2)",
    "grafo: lint de schema de campos (T3)",
    "grafo: código→grafo (T5)"
  ]);
});

test("pre-push (T6): WARNINGs apenas (fósseis + pendente-materializacao + candidato registrado) → gate PASSA", () => {
  const f = fixtureGrafo([
    { id: "FR-OK", estado: "🟢", area_tatica: "ferramentas", codigo: ["scripts/lila-grafo-mcp.cjs#updateNode"] },
    { id: "SP-CURSO", estado: "🟡", area_tatica: "ferramentas", frames_negocio: ["FR-FUTURO-N01"] }
  ]);
  const falhas = runGrafoGates(f.envBase);
  assert.deepEqual(falhas, [], "WARNINGs não bloqueiam o push");
});

test("verificar-codigo-grafo: ERRO degrada para WARNING quando candidato já registrado (aguardando veredito)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-downgrade-"));
  fs.writeFileSync(path.join(tmp, "grafo.json"), JSON.stringify({
    keyframes: [], sprints: [],
    frames: [{ id: "FR-MORTO", estado: "🟢", codigo: ["backend/src/services/tool-planner.ts"] }]
  }, null, 2));
  fs.writeFileSync(path.join(tmp, "grafo-historico.json"), JSON.stringify({ keyframes: [], sprints: [], frames: [] }, null, 2));
  fs.writeFileSync(path.join(tmp, "candidatos.json"), JSON.stringify({
    schema: "review-v1",
    checker: { candidatos: [{ node: "FR-MORTO", tipo: "remocao", alvo: null, veredito: null }] }
  }, null, 2));
  const { spawnSync } = require("node:child_process");
  const r = spawnSync(process.execPath, [path.resolve(__dirname, "..", "verificar-codigo-grafo.cjs")], {
    encoding: "utf8",
    env: { ...process.env, LILA_GRAFO_PATH: path.join(tmp, "grafo.json"), LILA_GRAFO_CANDIDATOS: path.join(tmp, "candidatos.json") }
  });
  assert.equal(r.status, 0, "WARNING não bloqueia");
  assert.match(r.stdout, /WARNING \| FR-MORTO \| codigo-morto .*AGUARDANDO VEREDITO HUMANO/);
});
