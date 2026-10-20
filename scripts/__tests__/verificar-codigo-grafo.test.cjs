
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "..", "verificar-codigo-grafo.cjs");

function fixture(frames) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verificar-codigo-"));
  const grafo = { keyframes: [], sprints: [], frames };
  fs.writeFileSync(path.join(tmp, "grafo.json"), JSON.stringify(grafo, null, 2));
  return { tmp, grafoPath: path.join(tmp, "grafo.json"), candidatosPath: path.join(tmp, "candidatos.json") };
}

function rodar(f, args) {
  return spawnSync(process.execPath, [SCRIPT].concat(args || []), {
    encoding: "utf8",
    cwd: path.resolve(__dirname, "..", ".."),
    env: { ...process.env, LILA_GRAFO_PATH: f.grafoPath, LILA_GRAFO_CANDIDATOS: f.candidatosPath }
  });
}

test("verificar-codigo-grafo (T5/A8): frame 🟢 sem codigo → WARNING; frame 🟢 com caminho inexistente → ERRO + candidato dry-run; exit 1", () => {
  const f = fixture([
    { id: "FR-SEM-COD", estado: "🟢" },
    { id: "FR-MORTO", estado: "🟢", codigo: ["backend/src/services/tool-planner.ts"] },
    { id: "FR-VIVO", estado: "🟢", codigo: ["scripts/lila-grafo-mcp.cjs#updateNode", "scripts/lila-grafo-mcp.cjs#acharNo"] },
    { id: "FR-PENDENTE", estado: "🟡", codigo: ["backend/src/services/tool-planner.ts"] }
  ]);
  const r = rodar(f);
  assert.equal(r.status, 1, "exit 1 — frame 🟢 sobre código morto");
  assert.match(r.stdout, /FR-MORTO \| codigo-morto \| backend\/src\/services\/tool-planner\.ts — frame verde sobre código morto/);
  assert.match(r.stdout, /WARNING \| FR-SEM-COD \| sem-declaracao-codigo/);
  // símbolo existente no arquivo real: sem achado para FR-VIVO
  assert.doesNotMatch(r.stdout, /FR-VIVO/);
  // gradiente: dono não-🟢 com código morto → WARNING, não ERRO
  assert.match(r.stdout, /WARNING \| FR-PENDENTE \| codigo-morto .*código morto \(nó ainda não executado\/finalizado\)/);
  // semente: candidato em dry-run, veredito null, apenas para o nó com ERRO
  assert.match(r.stdout, /PARANDO: veredito é humano/);
  const cand = JSON.parse(fs.readFileSync(f.candidatosPath, "utf8"));
  assert.equal(cand.checker.origem, "verificar-codigo-grafo");
  assert.equal(cand.checker.candidatos.length, 1);
  assert.equal(cand.checker.candidatos[0].node, "FR-MORTO");
  assert.equal(cand.checker.candidatos[0].veredito, null);
  assert.equal(cand.checker.candidatos[0].alvo, null);
});

test("verificar-codigo-grafo (T5/A8): sem ERROs → exit 0 e sem escrita de candidatos", () => {
  const f = fixture([{ id: "FR-OK", estado: "🟢", codigo: ["scripts/lila-grafo-mcp.cjs#updateNode"] }]);
  const r = rodar(f);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Exit 0/);
  assert.equal(fs.existsSync(f.candidatosPath), false, "não grava candidatos sem ERRO de código morto");
});

test("verificar-codigo-grafo (T5/A8): frame deprecated (veredito aplicado) é resolvido — fora do escopo", () => {
  const f = fixture([{ id: "FR-DEPRECIADO", estado: "🟢", codigo: ["backend/src/services/tool-planner.ts"], deprecated: { em: "2026-08-31", motivo: "contradicao", substituido_por: null, evidencia: "veredito humano" } }]);
  const r = rodar(f);
  assert.equal(r.status, 0, "exit 0 — veredito aplicado resolve o achado");
  assert.doesNotMatch(r.stdout, /FR-DEPRECIADO/);
});

test("verificar-codigo-grafo (T5/A8): símbolo declarado ausente no arquivo → ERRO (dono 🟢)", () => {
  const f = fixture([{ id: "FR-SIMBOLO", estado: "🟢", codigo: ["scripts/lila-grafo-mcp.cjs#funcaoQueNaoExiste"] }]);
  const r = rodar(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FR-SIMBOLO \| simbolo-ausente \| scripts\/lila-grafo-mcp\.cjs#funcaoQueNaoExiste/);
});
