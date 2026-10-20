// scripts/__tests__/dev-up.test.cjs
// R28-03 (2026-09-28) — o achado era "scripts/dev-up.cjs sem teste". O teste
// pina o núcleo PURO (o boot da stack não é unit-testável: docker/psql/npm) e o
// guard de execução — a classe de bug do HB-031 (script que executa no require).
const { test } = require("node:test");
const assert = require("node:assert");
const net = require("node:net");
const {
  main,
  listaEnvFaltando,
  avaliarCheckSchema,
  portaLivre,
  CHECKS_MIGRATE,
} = require("../dev-up.cjs");

test("require NÃO executa a stack (guard require.main) e expõe a superfície", () => {
  assert.equal(typeof main, "function");
  assert.equal(typeof listaEnvFaltando, "function");
  assert.equal(typeof avaliarCheckSchema, "function");
  assert.equal(typeof portaLivre, "function");
});

test("listaEnvFaltando: devolve só o que falta, na ordem declarada", () => {
  const pares = [{ arquivo: "a" }, { arquivo: "b" }, { arquivo: "c" }];
  assert.deepEqual(listaEnvFaltando(pares, (p) => p !== "b"), [{ arquivo: "b" }]);
  assert.deepEqual(listaEnvFaltando(pares, () => true), []);
  assert.equal(listaEnvFaltando(pares, () => false).length, 3);
});

test("CHECKS_MIGRATE: sanidade pinada (vector + sessions) e SEM public.accounts", () => {
  assert.deepEqual(
    CHECKS_MIGRATE.map((c) => c.nome),
    ["extensão vector", "tabela public.sessions"],
  );
  assert.ok(
    CHECKS_MIGRATE.every(
      (c) => typeof c.sql === "string" && typeof c.valorEsperado === "string" && typeof c.causa === "string",
    ),
  );
  // Decisão datada (F-B): `public.accounts` nunca existiu no schema do repo —
  // reintroduzir o check travaria o boot num objeto inexistente.
  assert.equal(CHECKS_MIGRATE.some((c) => c.sql.includes("accounts")), false);
  assert.equal(CHECKS_MIGRATE.some((c) => c.nome.includes("vector") && c.valorEsperado === "1"), true);
});

test("avaliarCheckSchema: ok quando casa; mensagem loud canônica quando não", () => {
  const check = {
    nome: "tabela public.sessions",
    sql: "SELECT to_regclass('public.sessions') IS NOT NULL",
    valorEsperado: "t",
    causa: "push não aplicou",
  };
  const ok = avaliarCheckSchema(check, "t");
  assert.equal(ok.ok, true);
  assert.match(ok.mensagem, /schema ok — tabela public\.sessions/);

  const falha = avaliarCheckSchema(check, "f");
  assert.equal(falha.ok, false);
  assert.match(falha.mensagem, /schema incompleto — tabela public\.sessions AUSENTE/);
  assert.match(falha.mensagem, /esperado "t", observado "f"/);
  assert.match(falha.mensagem, /Causa provável: push não aplicou/);
  assert.match(falha.mensagem, /falha loud, sem falso "no ar"/);
});

test("portaLivre: false com porta ocupada; true quando liberada", async () => {
  const srv = net.createServer();
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const porta = srv.address().port;
  assert.equal(await portaLivre(porta, "127.0.0.1"), false);
  await new Promise((resolve) => srv.close(resolve));
  assert.equal(await portaLivre(porta, "127.0.0.1"), true);
});
