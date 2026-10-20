// scripts/__tests__/validar-ledgers.test.cjs
// Testes do gate de integridade de ledgers append-only (node:test).
// Cobre apenas as funções PURAS (extrairIds, idsPerdidos, avaliarLedger) com
// fixtures em memória — NUNCA o git histórico real (clone raso no CI não tem
// os SHAs antigos; a validação histórica do incidente 9c519449->86627f2a ficou
// como evidência manual da sessão RESTAURACAO-BACKLOG-HB-20260922).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { LEDGERS, extrairIds, idsPerdidos, avaliarLedger, caminhoCanonico, conteudoLedgerEm } =
  require("../validar-ledgers.cjs");

const HB = LEDGERS.find((l) => caminhoCanonico(l).endsWith("hardening/backlog.md"));
const DEBT = LEDGERS.find((l) => caminhoCanonico(l).endsWith("patch-debt.json"));

const FIX_BASE = [
  "# Backlog de Hardening — Lila OS",
  "",
  "## HB-001 — RLS no Postgres",
  "- **Status:** aberto",
  "## HB-002 — Redação de google_id",
  "- **Status:** aberto",
  "## HB-003 — Matriz de bypass",
  "- **Status:** aberto",
].join("\n");

test("extrairIds conta entradas HB-* de um ledger markdown", () => {
  assert.deepEqual(extrairIds(FIX_BASE, HB.idPattern), ["HB-001", "HB-002", "HB-003"]);
});

test("extrairIds ignora menções inline a HB-* (não-header)", () => {
  const texto = "a HB-014 citada em prosa\n- **Resolução:** ver HB-016 no PR #584";
  assert.deepEqual(extrairIds(texto, HB.idPattern), []);
});

test("extrairIds conta dívidas PATCH-* do patch-debt.json", () => {
  const json = '{"debts": [{"id": "PATCH-20260827-001"}, {"id": "PATCH-20260919-001"}]}';
  assert.deepEqual(extrairIds(json, DEBT.idPattern), ["PATCH-20260827-001", "PATCH-20260919-001"]);
});

test("extrairIds com conteúdo ausente (arquivo novo) -> vazio", () => {
  assert.deepEqual(extrairIds(null, HB.idPattern), []);
});

test("idsPerdidos lista o que sumiu sem duplicar", () => {
  assert.deepEqual(idsPerdidos(["HB-001", "HB-002", "HB-003"], ["HB-003"]), ["HB-001", "HB-002"]);
  assert.deepEqual(idsPerdidos(["HB-001", "HB-001"], []), ["HB-001"]);
  assert.deepEqual(idsPerdidos([], ["HB-001"]), []);
});

test("avaliarLedger reprova o shape do incidente 86627f2a (reescrita com perda)", () => {
  // O commit incidente manteve só o header + 1 entrada: +2/-158.
  const headIncidente = ["# Backlog", "", "## HB-016 — Fase posterior", "- **Status:** resolvido"].join("\n");
  const v = avaliarLedger(FIX_BASE, headIncidente, HB);
  assert.equal(v.ok, false);
  assert.equal(v.baseCount, 3);
  assert.equal(v.headCount, 1);
  assert.deepEqual(v.perdidos, ["HB-001", "HB-002", "HB-003"]);
});

test("avaliarLedger aprova mudança de status in-place (resolução legítima)", () => {
  const headResolvido = FIX_BASE.replace("- **Status:** aberto\n## HB-002", "- **Status:** resolvido — 2026-09-22 (PR #555)\n## HB-002");
  const v = avaliarLedger(FIX_BASE, headResolvido, HB);
  assert.equal(v.ok, true);
  assert.equal(v.headCount, 3);
});

test("avaliarLedger aprova adição (restauração/nova entrada)", () => {
  const headComNova = FIX_BASE + "\n## HB-017 — Nova entrada";
  const v = avaliarLedger(FIX_BASE, headComNova, HB);
  assert.equal(v.ok, true);
  assert.equal(v.headCount, 4);
});

test("avaliarLedger aprova arquivo novo (base vazia) e reprova arquivo apagado", () => {
  assert.equal(avaliarLedger(null, FIX_BASE, HB).ok, true);
  const v = avaliarLedger(FIX_BASE, null, HB);
  assert.equal(v.ok, false);
  assert.deepEqual(v.perdidos, ["HB-001", "HB-002", "HB-003"]);
});

test("avaliarLedger reprova entrada de dívida paga removida do patch-debt.json", () => {
  const base = '{"debts": [{"id": "PATCH-20260827-001", "status": "paga"}, {"id": "PATCH-20260919-001", "status": "aberta"}]}';
  const head = '{"debts": [{"id": "PATCH-20260919-001", "status": "aberta"}]}';
  const v = avaliarLedger(base, head, DEBT);
  assert.equal(v.ok, false);
  assert.deepEqual(v.perdidos, ["PATCH-20260827-001"]);
});

test("todo ledger declara a lista de paths vigentes (move-safe) e o canônico é o último", () => {
  for (const ledger of LEDGERS) {
    assert.ok(Array.isArray(ledger.files) && ledger.files.length >= 1, `${ledger.desc}: files vazio`);
    assert.equal(caminhoCanonico(ledger), ledger.files[ledger.files.length - 1]);
  }
  // Precedente PATCH-HIGIENE-ORGANIZACAO-PLANEJAMENTO-20260925: o ledger HB-* viveu
  // em LILA-DEV/hardening/backlog.md e passou a LILA-DEV/planejamento/hardening/backlog.md.
  assert.ok(HB.files.includes("LILA-DEV/hardening/backlog.md"));
  assert.equal(caminhoCanonico(HB), "LILA-DEV/planejamento/hardening/backlog.md");
});

test("conteudoLedgerEm lê o primeiro path existente na rev (move do ledger não vira perda)", () => {
  const ledger = { files: ["velho/path.md", "novo/path.md"], desc: "fixtura", idPattern: /^## (HB-\d+)/gm };
  const revs = {
    "base:velho/path.md": FIX_BASE,
    "head:novo/path.md": FIX_BASE,
  };
  const leitor = (rev, file) => revs[`${rev}:${file}`] ?? null;
  const baseConteudo = conteudoLedgerEm("base", ledger, leitor);
  const headConteudo = conteudoLedgerEm("head", ledger, leitor);
  assert.deepEqual(extrairIds(baseConteudo, ledger.idPattern), ["HB-001", "HB-002", "HB-003"]);
  assert.equal(avaliarLedger(baseConteudo, headConteudo, ledger).ok, true);
  assert.equal(conteudoLedgerEm("base", { ...ledger, files: ["ausente.md"] }, leitor), null);
});
