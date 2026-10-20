// scripts/__tests__/verificar-sintese.test.cjs
// Self-test do verificador de sintese pendente (F2 —
// EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922). Leitura pura: espelho de
// verificar-divida-patch.cjs com threshold por area (sintese-config.json).
//
// Cobre o contrato declarado no snapshot do evento:
//   threshold default | override por area | abaixo do threshold | ledger ausente
//   | ledger/config ilegivel (exit 2) | consumidas nao contam | --area como filtro.
// Fixtures em tmp, ledger/config injetados por SINTESE_JSON/SINTESE_CONFIG.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "verificar-sintese.cjs"));
const { DEFAULT_THRESHOLD, carregarConfig, thresholdDe, diasAberto, agruparPendentes, avaliar, main } = mod;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-sintese-check-"));
const CONFIG = path.join(tmp, "config.json");
const CONFIG_ILEGIVEL = path.join(tmp, "config-ilegivel.json");
const AUSENTE = path.join(tmp, "nao-existe.json");

/** Config ratificada no evento (P1-04): default 3, chat 5. */
fs.writeFileSync(CONFIG, JSON.stringify({ schema: "sintese-config/v1", default: 3, areas: { chat: 5 } }), "utf8");
fs.writeFileSync(CONFIG_ILEGIVEL, "{{ config quebrada", "utf8");

let seq = 0;
function entrada(area, status, data) {
  seq += 1;
  return {
    id: `SINTESE-20260922-${String(seq).padStart(3, "0")}`,
    patchId: `PATCH-${area.toUpperCase()}-${seq}`,
    area,
    logPath: `LILA-DEV/execucao/logs/PATCH-${seq}-log.md`,
    data: data || "2026-09-22",
    status: status || "pendente",
    consumidaEm: status === "consumida" ? "2026-09-22" : null,
    consumidaPor: status === "consumida" ? "FR-X" : null,
  };
}

function escreverLedger(entradas, nome) {
  const alvo = path.join(tmp, nome);
  fs.writeFileSync(alvo, JSON.stringify({ schema: "sintese-pendente/v1", entradas }, null, 2), "utf8");
  return alvo;
}

/** Roda main() com ledger+config injetados; captura stdout/stderr e devolve o exit code. */
function rodar(argv, ledgerPath, configPath) {
  const outAntes = console.log;
  const errAntes = console.error;
  const envLedger = process.env.SINTESE_JSON;
  const envConfig = process.env.SINTESE_CONFIG;
  const texto = [];
  console.log = (...a) => texto.push(a.join(" "));
  console.error = (...a) => texto.push(a.join(" "));
  process.env.SINTESE_JSON = ledgerPath;
  process.env.SINTESE_CONFIG = configPath === undefined ? CONFIG : configPath;
  try {
    return { codigo: main(argv), texto: texto.join("\n") };
  } finally {
    console.log = outAntes;
    console.error = errAntes;
    if (envLedger === undefined) delete process.env.SINTESE_JSON;
    else process.env.SINTESE_JSON = envLedger;
    if (envConfig === undefined) delete process.env.SINTESE_CONFIG;
    else process.env.SINTESE_CONFIG = envConfig;
  }
}

// ── Unidades puras ──────────────────────────────────────────────────────────

test("thresholdDe: override da area vence o default; area ausente cai no default", () => {
  const config = { default: 3, areas: { chat: 5 } };
  assert.strictEqual(thresholdDe("chat", config), 5, "override ratificado");
  assert.strictEqual(thresholdDe("github", config), 3, "default para area sem override");
  assert.strictEqual(thresholdDe("chat", { default: 2, areas: {} }), 2);
  assert.strictEqual(DEFAULT_THRESHOLD, 3, "default do evento (P1-04)");
});

test("agruparPendentes: so status 'pendente' entra; area sem valor vira '(sem area)'", () => {
  const porArea = agruparPendentes([
    entrada("github", "pendente"),
    entrada("github", "consumida"),
    { id: "S-1", status: "pendente" },
  ]);
  assert.strictEqual(porArea.get("github").length, 1, "consumida nao conta");
  assert.strictEqual(porArea.get("(sem area)").length, 1);
});

test("avaliar: bloqueio quando pendentes >= threshold; filtro por area isola o veredito", () => {
  const config = { default: 3, areas: { chat: 5 } };
  const entradas = [entrada("github"), entrada("github"), entrada("github"), entrada("chat"), entrada("chat")];
  const todas = avaliar(entradas, config, null);
  assert.deepStrictEqual(
    todas.bloqueios.map((l) => l.area),
    ["github"],
    "github 3 >= 3 bloqueia; chat 2 < 5 nao",
  );
  assert.strictEqual(avaliar(entradas, config, "chat").bloqueios.length, 0);
  assert.strictEqual(avaliar(entradas, config, "chat").linhas[0].pendentes.length, 2);
});

test("diasAberto: data invalida nao vira idade falsa", () => {
  assert.strictEqual(diasAberto("2026-09-22") !== null, true);
  assert.strictEqual(diasAberto("22/09/2026"), null);
  assert.strictEqual(diasAberto(null), null);
});

test("carregarConfig: ausente usa default com aviso; ilegivel e' classe de falha propria", () => {
  const antigo = process.env.SINTESE_CONFIG;
  process.env.SINTESE_CONFIG = AUSENTE;
  try {
    const cfg = carregarConfig();
    assert.strictEqual(cfg.ok, true);
    assert.strictEqual(cfg.config.default, DEFAULT_THRESHOLD);
    assert.match(cfg.aviso, /config ausente/);
  } finally {
    if (antigo === undefined) delete process.env.SINTESE_CONFIG;
    else process.env.SINTESE_CONFIG = antigo;
  }
  const ilegivel = (() => {
    process.env.SINTESE_CONFIG = CONFIG_ILEGIVEL;
    try {
      return carregarConfig();
    } finally {
      if (antigo === undefined) delete process.env.SINTESE_CONFIG;
      else process.env.SINTESE_CONFIG = antigo;
    }
  })();
  assert.strictEqual(ilegivel.ok, false);
  assert.match(ilegivel.motivo, /ilegivel/);
});

// ── Exit codes do CLI ───────────────────────────────────────────────────────

test("ledger ausente -> exit 0 ('sem sintese pendente — ledger ausente')", () => {
  const r = rodar([], AUSENTE);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /ledger ausente/);
});

test("ledger ilegivel -> exit 2 (falha fechada)", () => {
  const alvo = path.join(tmp, "ilegivel.json");
  fs.writeFileSync(alvo, "{{ quebrado", "utf8");
  const r = rodar([], alvo);
  assert.strictEqual(r.codigo, 2);
  assert.match(r.texto, /ledger ilegivel/);
});

test("ledger sem campo 'entradas' -> exit 2 (schema violado, nunca passa em silencio)", () => {
  const alvo = path.join(tmp, "sem-entradas.json");
  fs.writeFileSync(alvo, JSON.stringify({ schema: "sintese-pendente/v1" }), "utf8");
  const r = rodar([], alvo);
  assert.strictEqual(r.codigo, 2);
  assert.match(r.texto, /sem campo 'entradas'/);
});

test("abaixo do threshold default -> exit 0 com a contagem", () => {
  const alvo = escreverLedger([entrada("github"), entrada("github")], "abaixo.json");
  const r = rodar([], alvo);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /area github: 2 pendente\(s\) \| threshold 3/);
});

test("threshold default atingido (3) -> exit 1 com ids, idades e o caminho do consumo", () => {
  const alvo = escreverLedger([entrada("github"), entrada("github"), entrada("github")], "no-limite.json");
  const r = rodar(["--verbose"], alvo);
  assert.strictEqual(r.codigo, 1);
  assert.match(r.texto, /area github: 3 pendente\(s\) \| threshold 3/);
  assert.match(r.texto, /\[SINTESE-\d{8}-\d{3}\]/);
  assert.match(r.texto, / \d+d \| LILA-DEV\/execucao\/logs\//);
  assert.match(r.texto, /sintese pendente no threshold: github \(3 >= 3\)/);
  assert.match(r.texto, /NAO e' pulavel com divida/);
  assert.match(r.texto, /npm run sintese:pay/);
});

test("override por area (chat 5): 4 pendentes passa, 5 bloqueia", () => {
  const quatro = escreverLedger(
    [entrada("chat"), entrada("chat"), entrada("chat"), entrada("chat")],
    "chat-4.json",
  );
  const r4 = rodar(["--area", "chat"], quatro);
  assert.strictEqual(r4.codigo, 0);
  assert.match(r4.texto, /area chat: 4 pendente\(s\) \| threshold 5/);

  const cinco = escreverLedger(
    [entrada("chat"), entrada("chat"), entrada("chat"), entrada("chat"), entrada("chat")],
    "chat-5.json",
  );
  const r5 = rodar(["--area", "chat"], cinco);
  assert.strictEqual(r5.codigo, 1);
  assert.match(r5.texto, /chat \(5 >= 5\)/);
});

test("consumidas nao contam: 5 registros de chat com 1 consumida -> exit 0", () => {
  const alvo = escreverLedger(
    [
      entrada("chat"),
      entrada("chat"),
      entrada("chat"),
      entrada("chat"),
      entrada("chat", "consumida"),
    ],
    "chat-com-consumida.json",
  );
  const r = rodar(["--area", "chat"], alvo);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /area chat: 4 pendente\(s\) \| threshold 5/);
});

test("sem --area avalia TODAS as areas; --area isola o veredito", () => {
  const alvo = escreverLedger(
    [entrada("github"), entrada("github"), entrada("github"), entrada("chat"), entrada("chat")],
    "multi-area.json",
  );
  const todas = rodar([], alvo);
  assert.strictEqual(todas.codigo, 1, "github no threshold bloqueia o veredito global");
  assert.match(todas.texto, /area github: 3 pendente\(s\)/);
  assert.match(todas.texto, /area chat: 2 pendente\(s\)/);

  const soChat = rodar(["--area", "chat"], alvo);
  assert.strictEqual(soChat.codigo, 0, "a area consultada esta abaixo do proprio threshold");
  assert.ok(!soChat.texto.includes("area github"), "nao avalia area alheia sob --area");
});

test("area sem entrada pendente -> exit 0 com contagem zero", () => {
  const alvo = escreverLedger([entrada("github")], "so-github.json");
  const r = rodar(["--area", "ferramentas"], alvo);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /area ferramentas: 0 pendente\(s\) \| threshold 3/);
});

test("config ausente -> default 3 com aviso, sem virar falha", () => {
  const alvo = escreverLedger([entrada("github"), entrada("github")], "sem-config.json");
  const r = rodar([], alvo, AUSENTE);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /config ausente/);
  assert.match(r.texto, /threshold 3/);
});

test("config ilegivel -> exit 2 (threshold indeterminado, nunca passa em silencio)", () => {
  const alvo = escreverLedger([entrada("github")], "config-ruim.json");
  const r = rodar([], alvo, CONFIG_ILEGIVEL);
  assert.strictEqual(r.codigo, 2);
  assert.match(r.texto, /config ilegivel/);
  assert.match(r.texto, /Falha FECHADA/);
});

test("uso invalido: --area sem valor -> exit 2; --help -> exit 0", () => {
  const alvo = escreverLedger([entrada("github")], "uso.json");
  assert.strictEqual(rodar(["--area"], alvo).codigo, 2);
  assert.match(rodar(["--area"], alvo).texto, /--area recebido sem valor/);
  assert.strictEqual(rodar(["--help"], alvo).codigo, 0);
});
