// scripts/__tests__/sonda-gate-heartbeat.test.cjs
// a1-closure (veredito humano Igor 2026-10-20): o gate sonda-gate é REQUIRED —
// juiz morto não pode virar AVISO verde. Heartbeat-ping dos 2 juízes ANTES das
// provas; ping morto = exit 1 LOUD. Testes 100% OFFLINE (fetch stub injetado,
// zero rede, zero credencial real).
"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  pingJuiz,
  heartbeatJuizes,
  executar,
  decidirVeredito,
  JUIZ_LLM1,
  JUIZ_LLM2,
} = require("../sonda-gate-rodar.cjs");

const respOk = () => ({
  ok: true,
  status: 200,
  text: async () => "",
  json: async () => ({ choices: [{ message: { content: "pong" } }] }),
});

const respHttp = (status, corpo) => ({
  ok: false,
  status,
  text: async () => corpo,
  json: async () => ({}),
});

/** Captura console.log/error do caminho executar (sem tocar stdout real). */
function capturarLogs(fn) {
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.join(" "));
  console.error = (...a) => logs.push(a.join(" "));
  return Promise.resolve()
    .then(fn)
    .then((r) => ({ resultado: r, logs }))
    .finally(() => {
      console.log = origLog;
      console.error = origErr;
    });
}

test("pingJuiz — vivo=true: UMA chamada mínima ao endpoint OpenRouter (temperature 0, prompt ping, Bearer)", async () => {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init });
    return respOk();
  };
  const r = await pingJuiz("openai/gpt-6-luna", { fetchImpl, apiKey: "sk-teste" });
  assert.deepStrictEqual(r, { vivo: true, erro: null });
  assert.strictEqual(chamadas.length, 1);
  assert.strictEqual(chamadas[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.strictEqual(chamadas[0].init.method, "POST");
  assert.strictEqual(chamadas[0].init.headers.Authorization, "Bearer sk-teste");
  const body = JSON.parse(chamadas[0].init.body);
  assert.strictEqual(body.model, "openai/gpt-6-luna");
  assert.strictEqual(body.temperature, 0);
  assert.deepStrictEqual(body.messages, [{ role: "user", content: "ping" }]);
});

test("pingJuiz — HTTP 500 = vivo=false com erro observável (NÃO lança)", async () => {
  const r = await pingJuiz("deepseek/deepseek-v4.1-flash-1017", {
    fetchImpl: async () => respHttp(500, "upstream boom"),
    apiKey: "sk-teste",
  });
  assert.strictEqual(r.vivo, false);
  assert.match(r.erro, /HTTP 500/);
  assert.match(r.erro, /deepseek\/deepseek-v4\.1-flash-1017/);
});

test("pingJuiz — throw do fetch (rede/credencial) = vivo=false, nunca propaga", async () => {
  const r = await pingJuiz("openai/gpt-6-luna", {
    fetchImpl: async () => { throw new Error("ECONNREFUSED 127.0.0.1"); },
  });
  assert.strictEqual(r.vivo, false);
  assert.match(r.erro, /ECONNREFUSED/);
});

test("pingJuiz — sem credencial = vivo=false declarado, sem chamar fetch", async () => {
  let chamou = false;
  const r = await pingJuiz("openai/gpt-6-luna", {
    fetchImpl: async () => { chamou = true; return respOk(); },
    apiKey: null,
  });
  assert.strictEqual(r.vivo, false);
  assert.match(r.erro, /OPENROUTER_API_KEY ausente/);
  assert.strictEqual(chamou, false);
});

test("pingJuiz — juiz LENTO: AbortController corta em timeoutMs e devolve timeout", async () => {
  const leva = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      reject(e);
    });
  });
  const r = await pingJuiz("openai/gpt-6-luna", { fetchImpl: leva, apiKey: "sk-teste", timeoutMs: 20 });
  assert.strictEqual(r.vivo, false);
  assert.match(r.erro, /timeout 20ms/);
});

test("heartbeatJuizes — 2 juízes em paralelo; 1 morto reprova o heartbeat e nomeia o juiz", async () => {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    return body.model === JUIZ_LLM2 ? respHttp(502, "bad gateway") : respOk();
  };
  const hb = await heartbeatJuizes([JUIZ_LLM1, JUIZ_LLM2], { fetchImpl, apiKey: "sk-teste" });
  assert.strictEqual(hb.vivo, false);
  assert.deepStrictEqual(hb.mortos, [JUIZ_LLM2]);
  assert.strictEqual(hb.modeloMorto, JUIZ_LLM2);
  assert.match(hb.erro, /HTTP 502/);
  assert.deepStrictEqual(hb.resultados.map((r) => r.vivo), [true, false]);
});

test("heartbeatJuizes — 2 vivos = heartbeat ok", async () => {
  const hb = await heartbeatJuizes([JUIZ_LLM1, JUIZ_LLM2], { fetchImpl: async () => respOk(), apiKey: "sk-teste" });
  assert.strictEqual(hb.vivo, true);
  assert.deepStrictEqual(hb.mortos, []);
  assert.strictEqual(hb.erro, null);
});

test("contrato do veredito — a1 por-doc (falha de instrumento no doc) continua AVISO", () => {
  assert.strictEqual(decidirVeredito({ erro: "OpenRouter HTTP 502" }).veredito, "AVISO");
});

test("main() — fetch morto: exit 1 LOUD antes de qualquer prova (gate required não pula em silêncio)", async () => {
  const { resultado, logs } = await capturarLogs(() =>
    executar(
      { doc: "docs/ANTI-STALL.md", baseline: "HEAD:docs/ANTI-STALL.md", baseSha: null, skipProbe: false },
      { fetchImpl: async () => respHttp(500, "juiz fora do ar"), apiKey: "sk-teste", juizes: [JUIZ_LLM1, JUIZ_LLM2] }
    )
  );
  assert.strictEqual(resultado, 1);
  const erro = logs.find((l) => l.startsWith("::error::"));
  assert.ok(erro, "esperado ::error:: no log: " + logs.join(" | "));
  assert.match(erro, /morto \(heartbeat falhou\)/);
  assert.match(erro, /HTTP 500/);
  // nenhuma prova rodou: não há linha de relatório agregado.
  assert.ok(!logs.some((l) => /Sonda-gate estrito:/.test(l)));
});

test("main() — --skip-probe NÃO pinga juiz (modo seco continua exit 0 sem rede)", async () => {
  const { resultado, logs } = await capturarLogs(() =>
    executar(
      { doc: "docs/ANTI-STALL.md", baseline: null, baseSha: null, skipProbe: true },
      { fetchImpl: async () => { throw new Error("fetch não deveria ser chamado em --skip-probe"); }, apiKey: null }
    )
  );
  assert.strictEqual(resultado, 0);
  assert.ok(logs.some((l) => /skip-probe/.test(l)));
  assert.ok(!logs.some((l) => /heartbeat/.test(l)));
});
