// scripts/__tests__/sintese-ledger.test.cjs
// Self-test do mutador do ledger de sintese pendente (F2 —
// EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922: ledger + verificador + ritual de consumo).
//
// Cobre o contrato declarado no snapshot do evento:
//   registrar idempotente | consumir | ledger ausente (P1-03 ratificado:
//   registrar CRIA o ledger vazio e registra, exit 0; consumir exige ledger,
//   exit 1) | sequencia de id SINTESE-YYYYMMDD-NNN | evidencia (log/snapshot
//   inexistente = exit 1) | uso invalido = exit 2.
// Fixtures em tmp, ledger injetado por SINTESE_JSON — o ledger real nao e' tocado.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "sintese-ledger.cjs"));
const { gerarId, carregar, registrar, consumir, main } = mod;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-sintese-ledger-"));
const LOG = path.join(tmp, "PATCH-X-log.md");
const SNAPSHOT = path.join(tmp, "snapshot-area.md");
fs.writeFileSync(LOG, "# log E3 de fixture\n", "utf8");
fs.writeFileSync(SNAPSHOT, "# snapshot de fixture\n", "utf8");

const AGORA = new Date(2026, 8, 22); // 2026-09-22 (mes local, deterministico)

function caminho(nome) {
  return path.join(tmp, nome);
}

/** Roda main() com o ledger injetado; captura stdout/stderr e devolve o exit code. */
function rodarMain(argv, ledgerPath) {
  const outAntes = console.log;
  const errAntes = console.error;
  const envAntes = process.env.SINTESE_JSON;
  const texto = [];
  console.log = (...a) => texto.push(a.join(" "));
  console.error = (...a) => texto.push(a.join(" "));
  process.env.SINTESE_JSON = ledgerPath;
  try {
    return { codigo: main(argv), texto: texto.join("\n") };
  } finally {
    console.log = outAntes;
    console.error = errAntes;
    if (envAntes === undefined) delete process.env.SINTESE_JSON;
    else process.env.SINTESE_JSON = envAntes;
  }
}

const entrada = (id, patchId, area, status) => ({
  id,
  patchId,
  area,
  logPath: "LILA-DEV/execucao/logs/" + patchId + "-log.md",
  data: "2026-09-22",
  status: status || "pendente",
  consumidaEm: null,
  consumidaPor: null,
});

// ── registrar ───────────────────────────────────────────────────────────────

test("registrar: ledger ausente CRIA o ledger vazio e registra (P1-03 (a), exit 0)", () => {
  const alvo = caminho("novo.json");
  const r = registrar({ patchId: "PATCH-A", area: "chat", log: LOG }, { caminho: alvo, agora: AGORA });
  assert.strictEqual(r.exit, 0);
  assert.ok(fs.existsSync(alvo), "ledger criado no bootstrap");
  const ledger = JSON.parse(fs.readFileSync(alvo, "utf8"));
  assert.strictEqual(ledger.schema, "sintese-pendente/v1");
  assert.strictEqual(ledger.entradas.length, 1);
  assert.deepStrictEqual(ledger.entradas[0], {
    id: "SINTESE-20260922-001",
    patchId: "PATCH-A",
    area: "chat",
    logPath: LOG.replace(/\\/g, "/"),
    data: "2026-09-22",
    status: "pendente",
    consumidaEm: null,
    consumidaPor: null,
  });
});

test("registrar: idempotente por patch-id (exit 0, sem duplicar, avisa)", () => {
  const alvo = caminho("novo.json");
  const r = registrar({ patchId: "PATCH-A", area: "chat", log: LOG }, { caminho: alvo, agora: AGORA });
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(r.id, "SINTESE-20260922-001");
  assert.match(r.mensagem, /ja registrado/);
  assert.match(r.mensagem, /idempotente/);
  assert.strictEqual(JSON.parse(fs.readFileSync(alvo, "utf8")).entradas.length, 1, "nada duplicado");
});

test("registrar: sequencia NNN por dia (maior existente + 1)", () => {
  const alvo = caminho("novo.json");
  registrar({ patchId: "PATCH-B", area: "github", log: LOG }, { caminho: alvo, agora: AGORA });
  const terceiro = registrar({ patchId: "PATCH-C", area: "github", log: LOG }, { caminho: alvo, agora: AGORA });
  assert.strictEqual(terceiro.id, "SINTESE-20260922-003");
  const entradas = JSON.parse(fs.readFileSync(alvo, "utf8")).entradas;
  assert.deepStrictEqual(
    entradas.map((e) => e.id),
    ["SINTESE-20260922-001", "SINTESE-20260922-002", "SINTESE-20260922-003"],
  );
  assert.deepStrictEqual(
    entradas.map((e) => e.status),
    ["pendente", "pendente", "pendente"],
  );
});

test("registrar: log inexistente = exit 1 (evidencia obrigatoria do registro)", () => {
  const alvo = caminho("sem-log.json");
  const r = registrar(
    { patchId: "PATCH-D", area: "chat", log: path.join(tmp, "nao-existe-log.md") },
    { caminho: alvo, agora: AGORA },
  );
  assert.strictEqual(r.exit, 1);
  assert.match(r.mensagem, /log informado nao existe/);
  assert.ok(!fs.existsSync(alvo), "nada gravado quando a evidencia nao existe");
});

test("registrar: ledger ilegivel = exit 1 (nunca silencioso)", () => {
  const alvo = caminho("ilegivel.json");
  fs.writeFileSync(alvo, "{{ nao e' json", "utf8");
  const r = registrar({ patchId: "PATCH-E", area: "chat", log: LOG }, { caminho: alvo, agora: AGORA });
  assert.strictEqual(r.exit, 1);
  assert.match(r.mensagem, /ilegivel/);
});

// ── consumir ────────────────────────────────────────────────────────────────

test("consumir: marca status/consumidaEm/consumidaPor/consumidaSnapshot (append-only)", () => {
  const alvo = caminho("consumo.json");
  const ledger = {
    schema: "sintese-pendente/v1",
    entradas: [entrada("SINTESE-20260922-001", "PATCH-X", "chat"), entrada("SINTESE-20260922-002", "PATCH-Y", "chat")],
  };
  fs.writeFileSync(alvo, JSON.stringify(ledger, null, 2), "utf8");

  const r = consumir(
    { ids: ["SINTESE-20260922-001"], por: "FR-AREAS-01", snapshot: SNAPSHOT },
    { caminho: alvo, agora: AGORA },
  );
  assert.strictEqual(r.exit, 0);
  const gravado = JSON.parse(fs.readFileSync(alvo, "utf8"));
  assert.strictEqual(gravado.entradas.length, 2, "nunca remove entrada");
  const consumida = gravado.entradas[0];
  assert.strictEqual(consumida.status, "consumida");
  assert.strictEqual(consumida.consumidaEm, "2026-09-22");
  assert.strictEqual(consumida.consumidaPor, "FR-AREAS-01");
  assert.strictEqual(consumida.consumidaSnapshot, SNAPSHOT.replace(/\\/g, "/"));
  assert.strictEqual(gravado.entradas[1].status, "pendente", "id nao marcado segue pendente");
  const naoConsumida = gravado.entradas[1];
  assert.strictEqual(naoConsumida.consumidaEm, null);
  assert.strictEqual(naoConsumida.consumidaPor, null);
});

test("consumir: id ja consumido e' idempotente e nao sobrescreve o consumo original", () => {
  const alvo = caminho("consumo.json");
  const r = consumir(
    { ids: ["SINTESE-20260922-001"], por: "FR-OUTRO", snapshot: SNAPSHOT },
    { caminho: alvo, agora: AGORA },
  );
  assert.strictEqual(r.exit, 0);
  assert.match(r.mensagem, /ja consumida\(s\) antes/);
  const consumida = JSON.parse(fs.readFileSync(alvo, "utf8")).entradas[0];
  assert.strictEqual(consumida.consumidaPor, "FR-AREAS-01", "consumo original preservado");
});

test("consumir: id inexistente = exit 1 e ledger intocado", () => {
  const alvo = caminho("consumo.json");
  const antes = fs.readFileSync(alvo, "utf8");
  const r = consumir(
    { ids: ["SINTESE-20260922-999"], por: "FR-X", snapshot: SNAPSHOT },
    { caminho: alvo, agora: AGORA },
  );
  assert.strictEqual(r.exit, 1);
  assert.match(r.mensagem, /id\(s\) inexistente\(s\)/);
  assert.strictEqual(fs.readFileSync(alvo, "utf8"), antes, "ledger nao muda");
});

test("consumir: snapshot inexistente = exit 1 (evidencia obrigatoria do consumo)", () => {
  const alvo = caminho("consumo.json");
  const r = consumir(
    { ids: ["SINTESE-20260922-002"], por: "FR-X", snapshot: path.join(tmp, "sem-snapshot.md") },
    { caminho: alvo, agora: AGORA },
  );
  assert.strictEqual(r.exit, 1);
  assert.match(r.mensagem, /snapshot informado nao existe/);
});

test("consumir: ledger ausente = exit 1 (fail-closed — nao cria ledger vazio)", () => {
  const alvo = caminho("nunca-existiu.json");
  const r = consumir({ ids: ["SINTESE-20260922-001"], por: "FR-X", snapshot: SNAPSHOT }, { caminho: alvo, agora: AGORA });
  assert.strictEqual(r.exit, 1);
  assert.match(r.mensagem, /ledger ausente/);
  assert.ok(!fs.existsSync(alvo), "consumir nao inventa ledger");
});

// ── CLI (main) + unidades ───────────────────────────────────────────────────

test("main registrar: sucesso sai 0 com o id no stdout; args faltando saem 2", () => {
  const alvo = caminho("cli-registrar.json");
  const ok = rodarMain(["registrar", "--patch-id", "PATCH-M", "--area", "github", "--log", LOG], alvo);
  assert.strictEqual(ok.codigo, 0);
  assert.match(ok.texto, /SINTESE-\d{8}-\d{3}/);
  assert.strictEqual(rodarMain(["registrar", "--patch-id", "PATCH-N", "--area", "github"], alvo).codigo, 2);
  assert.strictEqual(rodarMain(["registrar", "--patch-id", "PATCH-N", "--area", "github", "--log", LOG], alvo).codigo, 0);
  assert.strictEqual(rodarMain([], alvo).codigo, 2);
  assert.strictEqual(rodarMain(["subcomando-errado"], alvo).codigo, 2);
});

test("main consumir: args faltando saem 2; consumo valido sai 0", () => {
  const alvo = caminho("cli-consumir.json");
  fs.writeFileSync(
    alvo,
    JSON.stringify({ schema: "sintese-pendente/v1", entradas: [entrada("SINTESE-20260922-001", "PATCH-M", "github")] }),
    "utf8",
  );
  assert.strictEqual(rodarMain(["consumir", "--ids", "SINTESE-20260922-001", "--por", "FR-X"], alvo).codigo, 2);
  assert.strictEqual(rodarMain(["consumir", "--por", "FR-X", "--snapshot", SNAPSHOT], alvo).codigo, 2);
  const ok = rodarMain(
    ["consumir", "--ids", "SINTESE-20260922-001", "--por", "FR-X", "--snapshot", SNAPSHOT],
    alvo,
  );
  assert.strictEqual(ok.codigo, 0);
  assert.match(ok.texto, /consumida\(s\): SINTESE-20260922-001/);
  assert.strictEqual(rodarMain(["--help"], alvo).codigo, 0);
});

test("gerarId: maior existente do dia + 1, isolado por data", () => {
  const entradas = [entrada("SINTESE-20260921-004", "P1", "chat"), entrada("SINTESE-20260922-002", "P2", "chat")];
  assert.strictEqual(gerarId(entradas, "2026-09-22"), "SINTESE-20260922-003");
  assert.strictEqual(gerarId(entradas, "2026-09-21"), "SINTESE-20260921-005");
  assert.strictEqual(gerarId([], "2026-09-22"), "SINTESE-20260922-001");
  assert.strictEqual(gerarId([{ id: "SINTESE-20260922-abc" }], "2026-09-22"), "SINTESE-20260922-001");
});

test("carregar: ledger ausente e' classe propria; ilegivel e' outra", () => {
  const ausente = carregar(caminho("nunca-existiu-2.json"));
  assert.strictEqual(ausente.ok, false);
  assert.strictEqual(ausente.motivo, "ledger ausente");
  const ilegivel = carregar(caminho("ilegivel.json"));
  assert.strictEqual(ilegivel.ok, false);
  assert.match(ilegivel.motivo, /ilegivel/);
  assert.strictEqual(carregar(caminho("consumo.json")).ok, true);
});

test("consumir: ID DUPLICADO no ledger consume TODAS as entradas com o id (caso SINTESE-20261008-001)", () => {
  // Regressao real (2026-10-16): duas sessoes concorrentes no mesmo dia geraram
  // o MESMO id para patches diferentes; a 1a ocorrencia ja consumida fazia o
  // `find` curto-circuitar o id e a duplicata ficava "pendente" para sempre
  // (reportada como idempotente). O contrato agora e': o id consumido marca
  // toda entrada com aquele id.
  const alvo = caminho("duplicado.json");
  const ledger = {
    schema: "sintese-pendente/v1",
    entradas: [
      {
        id: "SINTESE-20261008-001",
        patchId: "PATCH-A",
        area: "ferramentas",
        logPath: "l",
        data: "2026-10-08",
        status: "consumida",
        consumidaEm: "2026-10-08",
        consumidaPor: "FR-ANTIGO",
        consumidaSnapshot: "s",
      },
      {
        id: "SINTESE-20261008-001",
        patchId: "PATCH-B",
        area: "ferramentas",
        logPath: "l",
        data: "2026-10-08",
        status: "pendente",
        consumidaEm: null,
        consumidaPor: null,
      },
    ],
  };
  fs.writeFileSync(alvo, JSON.stringify(ledger, null, 2), "utf8");
  const r = consumir(
    { ids: ["SINTESE-20261008-001"], por: "FR-SINTESE-FERRAMENTAS-20261016", snapshot: SNAPSHOT },
    { caminho: alvo, agora: AGORA, snapshotExiste: () => true },
  );
  assert.strictEqual(r.exit, 0);
  const lido = JSON.parse(fs.readFileSync(alvo, "utf8"));
  assert.strictEqual(lido.entradas.filter((e) => e.status === "pendente").length, 0, "nenhuma duplicata presa");
  assert.strictEqual(lido.entradas[0].consumidaPor, "FR-ANTIGO", "consumo original preservado (append-only)");
  assert.strictEqual(lido.entradas[1].consumidaPor, "FR-SINTESE-FERRAMENTAS-20261016");
});

test("consumir: id totalmente ja consumido continua idempotente (nao sobrescreve)", () => {
  const alvo = caminho("idempotente-2.json");
  const ledger = {
    schema: "sintese-pendente/v1",
    entradas: [
      {
        id: "SINTESE-20260922-009",
        patchId: "P9",
        area: "chat",
        logPath: "l",
        data: "2026-09-22",
        status: "consumida",
        consumidaEm: "2026-09-22",
        consumidaPor: "FR-ORIGINAL",
        consumidaSnapshot: "s",
      },
    ],
  };
  fs.writeFileSync(alvo, JSON.stringify(ledger, null, 2), "utf8");
  const r = consumir(
    { ids: ["SINTESE-20260922-009"], por: "FR-NOVO", snapshot: SNAPSHOT },
    { caminho: alvo, agora: AGORA, snapshotExiste: () => true },
  );
  assert.strictEqual(r.exit, 0);
  assert.match(r.mensagem, /ja consumida/);
  const lido = JSON.parse(fs.readFileSync(alvo, "utf8"));
  assert.strictEqual(lido.entradas[0].consumidaPor, "FR-ORIGINAL");
});

