"use strict";
// scripts/__tests__/reconciliar-ledger-grafo.test.cjs
// FR-HOMEOSTASE-N02: teste do reconciliador ledger↔grafo (node:test).
// Fixtures temporárias (RECON_GRAFO/RECON_LEDGER) — não dependem do repo real.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { analisar } = require("../reconciliar-ledger-grafo.cjs");

function fixture(raiz, grafo, ledger) {
  const dir = path.join(raiz, "LILA-DEV/planejamento");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "grafo.json"), JSON.stringify(grafo));
  fs.writeFileSync(path.join(dir, "decisoes-ledger.json"), JSON.stringify(ledger));
  return { grafoPath: path.join(dir, "grafo.json"), ledgerPath: path.join(dir, "decisoes-ledger.json") };
}

function snap(raiz, rel, conteudo) {
  const abs = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, conteudo);
}

const LEDGER_U = (id, node, texto, status = "ativa") => ({
  id, node, grafo: "atual", snapshot: "LILA-DEV/planejamento/snapshots/sprints/" + node + ".md",
  tipo: "decisao", texto, status,
});

test("sincronizado: zero divergências", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
  const texto = "D1 — decisão de teste com texto estável";
  const paths = fixture(raiz,
    { keyframes: [], sprints: [{ id: "SP-X", estado: "🟢", snapshot: "LILA-DEV/planejamento/snapshots/sprints/SP-X.md" }], frames: [] },
    { unidades: [LEDGER_U("SP-X.U1", "SP-X", texto)] });
  snap(raiz, "LILA-DEV/planejamento/snapshots/sprints/SP-X.md", "## Decisões\n- " + texto + "\n");
  const r = analisar({ ...paths, raiz });
  assert.equal(r.total, 0);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("(i) unidade ativa sem nó em nenhum grafo", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
  const paths = fixture(raiz,
    { keyframes: [], sprints: [], frames: [] },
    { unidades: [LEDGER_U("SP-Y.U1", "SP-Y", "texto qualquer")] });
  const r = analisar({ ...paths, raiz });
  assert.deepEqual(r.divergencias.nosAusentes.map((x) => x.unidade), ["SP-Y.U1"]);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("(ii) texto fora do snapshot do nó + (?) snapshot ausente = não-verificado", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
  const paths = fixture(raiz,
    { keyframes: [], sprints: [
      { id: "SP-Z", estado: "🟡", snapshot: "LILA-DEV/planejamento/snapshots/sprints/SP-Z.md" },
      { id: "SP-W", estado: "🟡", snapshot: "LILA-DEV/planejamento/snapshots/sprints/SP-W.md" },
    ], frames: [] },
    { unidades: [LEDGER_U("SP-Z.U1", "SP-Z", "texto que NAO esta no snapshot"), LEDGER_U("SP-W.U1", "SP-W", "texto")] });
  snap(raiz, "LILA-DEV/planejamento/snapshots/sprints/SP-Z.md", "outra coisa totalmente diversa\n");
  // SP-W existe no grafo mas o arquivo snapshot não existe no disco
  const r = analisar({ ...paths, raiz });
  assert.deepEqual(r.divergencias.textoForaSnapshot.map((x) => x.unidade), ["SP-Z.U1"]);
  assert.deepEqual(r.divergencias.snapshotsNaoVerificados.map((x) => x.node), ["SP-W"]);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("(ii/D4) grafia divergente (glifos/caixa) não diverge; paráfrase vira (ii.b); conteúdo ausente vira (ii.a)", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
  // verbatim pós-normalização: unidade com ">=" caixa baixa vs snapshot com "≥" e caixa alta
  const verbatimGlifo = "d1 threshold assimétrico: l1 exige confidence >= 0.85. erro para baixo é a direção perigosa";
  const parafrese = "Threshold assimétrico: L1 exige confidence alto e baixo risco para fallback conservador";
  const drift = "Regra sobre backup postgres que não existe em momento algum no documento";
  const paths = fixture(raiz,
    { keyframes: [], sprints: [{ id: "SP-T", estado: "🟢", snapshot: "LILA-DEV/planejamento/snapshots/sprints/SP-T.md" }], frames: [] },
    { unidades: [
      LEDGER_U("SP-T.U1", "SP-T", verbatimGlifo),
      LEDGER_U("SP-T.U2", "SP-T", parafrese),
      LEDGER_U("SP-T.U3", "SP-T", drift),
    ] });
  snap(raiz, "LILA-DEV/planejamento/snapshots/sprints/SP-T.md",
    "D1 Threshold assimétrico: L1 exige confidence ≥ 0.85. Erro para baixo é a direção perigosa.\n");
  const r = analisar({ ...paths, raiz });
  assert.deepEqual(r.divergencias.textoForaSnapshot.map((x) => x.unidade), ["SP-T.U3"]);
  assert.deepEqual(r.divergencias.parafreseSnapshot.map((x) => x.unidade), ["SP-T.U2"]);
  assert.equal(r.total, 2);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("(iii) nó no histórico com unidades ativas = órfãs", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
  const paths = fixture(raiz,
    { keyframes: [], sprints: [], frames: [], grafo_historico: { keyframes: [], sprints: [{ id: "SP-OLD", estado: "🟢" }], frames: [] } },
    { unidades: [LEDGER_U("SP-OLD.U1", "SP-OLD", "texto")] });
  const r = analisar({ ...paths, raiz });
  assert.equal(r.divergencias.orfasDeNoMorto.length, 1);
  assert.deepEqual(r.divergencias.orfasDeNoMorto[0].unidades, ["SP-OLD.U1"]);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("(iv) duplicata de texto no mesmo nó com IDs distintos", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
  const texto = "D1 — decisão duplicada no mesmo nó para teste";
  const paths = fixture(raiz,
    { keyframes: [], sprints: [{ id: "SP-D", estado: "🟡", snapshot: "LILA-DEV/planejamento/snapshots/sprints/SP-D.md" }], frames: [] },
    { unidades: [LEDGER_U("SP-D.U1", "SP-D", texto), LEDGER_U("SP-D.U7", "SP-D", texto.replace("teste", "teste"))] });
  snap(raiz, "LILA-DEV/planejamento/snapshots/sprints/SP-D.md", "- " + texto + "\n");
  const r = analisar({ ...paths, raiz });
  assert.equal(r.divergencias.duplicatas.length, 1);
  assert.deepEqual(r.divergencias.duplicatas[0].par, ["SP-D.U1", "SP-D.U7"]);
  fs.rmSync(raiz, { recursive: true, force: true });
});
