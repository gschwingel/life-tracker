"use strict";
// Suite: patch-ship — helpers puras (a orquestração em si é subprocess-pesada e
// fica coberta pelo fluxo real; o smoke-frame local é o pré-requisito do ciclo).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { slugDaMensagem, eArtefatoIndice, parseArgs, montarCorpoPr, extrairReferencia, lerDividasAbertas } = require("../patch-ship.cjs");

test("slugDaMensagem gera slug tronco/* limpo", () => {
  const s = slugDaMensagem("feat(modelos): troca Qwen3.8 Max no dropdown (PATCH-X-20260905)");
  assert.ok(s.startsWith("feat-modelos-troca"));
  assert.ok(!s.includes(":"));
  assert.ok(!s.includes("("));
});

test("eArtefatoIndice reconhece artefatos regeneráveis", () => {
  assert.equal(eArtefatoIndice("indice-vetorial.json"), true);
  assert.equal(eArtefatoIndice("LILA-DEV/indice-rastreabilidade.json"), true);
  assert.equal(eArtefatoIndice("docs/AI-PROJECT-MANIFEST-INDEX.md"), true);
  assert.equal(eArtefatoIndice("src/lib/models.ts"), false);
  assert.equal(eArtefatoIndice("CHANGELOG.md"), false);
});

test("parseArgs extrai mensagem e --no-pr", () => {
  const cfg = parseArgs(["feat(x): msg", "--no-pr"]);
  assert.equal(cfg.message, "feat(x): msg");
  assert.equal(cfg.noPr, true);
});

// ── G9 (Lote 1): corpo do PR montado da evidencia do ciclo ──────────────────

test("extrairReferencia le a tag entre colchetes da mensagem", () => {
  assert.equal(extrairReferencia("fix(x): ajuste [FRAME-REANC-L1-GOV-20260919]"), "FRAME-REANC-L1-GOV-20260919");
  assert.equal(extrairReferencia("fix(x): sem tag declarada"), null);
});

test("montarCorpoPr declara mudanca, gates, testes selecionados e divida zero", () => {
  const corpo = montarCorpoPr({
    mensagem: "fix(x): ajuste [PATCH-X-20260920]",
    checagens: [
      { nome: "smoke-frame", ok: true },
      { nome: "test:scripts (node --test)", ok: true, detalhe: "2 arquivo(s)" },
    ],
    testes: { classes: { indices: 1 }, typechecksObrigatorios: ["app"], testesRelacionados: [], fullSuite: false },
    referencia: "PATCH-X-20260920",
    dividas: [],
  });
  assert.match(corpo, /## Mudanca/);
  assert.match(corpo, /smoke-frame: verde/);
  assert.match(corpo, /test:scripts \(node --test\): verde — 2 arquivo\(s\)/);
  assert.match(corpo, /Classes no diff: indices \(1\)/);
  assert.match(corpo, /Typechecks obrigatorios: app/);
  assert.match(corpo, /Suite completa exigida: nao/);
  assert.match(corpo, /Nenhuma divida aberta no ledger/);
});

test("montarCorpoPr lista dividas abertas e plano ausente", () => {
  const corpo = montarCorpoPr({
    mensagem: "feat(y): x",
    dividas: [{ id: "PATCH-1", area: "chat", descricao: "vetorial adiado" }],
  });
  assert.match(corpo, /plano indisponivel/);
  assert.match(corpo, /`PATCH-1` \(chat\): vetorial adiado/);
  assert.match(corpo, /Referencia declarada: nao declarada na mensagem/);
});

test("lerDividasAbertas filtra status aberta e tolera ledger ausente", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "patch-ship-debt-"));
  const p = path.join(tmp, "patch-debt.json");
  fs.writeFileSync(p, JSON.stringify({ version: 1, debts: [
    { id: "A", status: "aberta", area: "chat" },
    { id: "B", status: "paga", area: "chat" },
  ] }));
  assert.deepEqual(lerDividasAbertas(p).map((d) => d.id), ["A"]);
  assert.deepEqual(lerDividasAbertas(path.join(tmp, "nao-existe.json")), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});
