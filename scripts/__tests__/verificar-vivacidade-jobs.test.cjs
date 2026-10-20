// scripts/__tests__/verificar-vivacidade-jobs.test.cjs
// Self-test do watchdog de vivacidade dos jobs agendados
// (scripts/verificar-vivacidade-jobs.cjs).
//
// Cobre a SPEC do FR-JOBS-VIVACIDADE-WATCHDOG (SP-HARDENING-GATES-ASYNC):
//   - selecao do ultimo run AGENDADO com SUCESSO (ignora push/PR e falhas);
//   - veredicto por alvo: fresco OK, estourado > teto, sem success, sem runs;
//   - teto global (--dias-max) sobrepoe o teto por alvo;
//   - consulta HTTP injetada: sucesso, erro de HTTP e token/repo ausentes;
//   - relatorio textual e shape do --json (alerta nunca silencioso).
// Roda em CI como parte de `npm run test:scripts` (run-test-scripts.cjs descobre
// scripts/__tests__/*.test.cjs flat).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "verificar-vivacidade-jobs.cjs"));
const {
  ALVOS,
  ALVOS_EXECUCAO,
  selecionarUltimoSucesso,
  selecionarUltimoRun,
  idadeHoras,
  avaliarVivacidade,
  formatarRelatorio,
  buscarRuns,
  parseArgs,
  main,
} = mod;

const AGORA = Date.parse("2026-09-17T12:00:00.000Z");

function run(over) {
  return Object.assign(
    { event: "schedule", conclusion: "success", created_at: "2026-09-17T08:00:00Z", status: "completed", html_url: "https://exemplo/run/1" },
    over || {}
  );
}

function alvo(over) {
  return Object.assign({ arquivo: "alvo.yml", nome: "Alvo", tetoHoras: 26 }, over || {});
}

test("ALVOS: cobre os jobs agendados com teto declarado (6h 13h, diarios 26h, semanais 192h)", () => {
  const arquivos = ALVOS.map((a) => a.arquivo);
  for (const esperado of [
    "postgres-backup-diario.yml",
    "indices-vetorial-watchdog.yml",
    "gates-grafo.yml",
    "kf-gate-semantico.yml",
    "e2e-db-probe.yml",
    // FRAME-GATES-ROTINAS-DIARIAS-20261015: watchdogs novos do frame.
    "indices-textual-watchdog.yml",
    "audit-diario.yml",
  ]) {
    assert.ok(arquivos.includes(esperado), "alvo ausente: " + esperado);
  }
  // Workflows condenados e apagados do repo (2d8de871, FRAME-REANC-L4-OPS-20260920;
  // fila-merge.yml FRAME-FIM-FILA-EAGER-20261006 E2; watchdog-acumulacao.yml
  // PATCH-PURGA-INATIVOS-20261006) NAO podem voltar aos alvos: workflow
  // inexistente = falso vermelho eterno (camada 1 e camada 2 de execucao).
  for (const condenado of ["l3-backfill-diario.yml", "indices-vetorial-diario.yml", "fila-merge.yml", "watchdog-acumulacao.yml"]) {
    assert.ok(!arquivos.includes(condenado), "alvo condenado presente: " + condenado);
  }
  const arquivosExecucao = ALVOS_EXECUCAO.map((a) => a.arquivo);
  for (const condenado of ["fila-merge.yml", "watchdog-acumulacao.yml"]) {
    assert.ok(!arquivosExecucao.includes(condenado), "alvo de execucao condenado presente: " + condenado);
  }
  for (const a of ALVOS) {
    assert.ok(a.tetoHoras === 13 || a.tetoHoras === 26 || a.tetoHoras === 192, "teto inesperado em " + a.arquivo);
    assert.ok(a.cron && a.cron.length > 0, "cron declarado obrigatorio: " + a.arquivo);
  }
});

test("selecionarUltimoSucesso: pega o schedule+success mais recente e ignora os demais", () => {
  const runs = [
    run({ event: "push", conclusion: "success", created_at: "2026-09-17T11:00:00Z" }),
    run({ event: "schedule", conclusion: "failure", created_at: "2026-09-17T10:00:00Z" }),
    run({ event: "schedule", conclusion: "success", created_at: "2026-09-17T08:00:00Z" }),
    run({ event: "schedule", conclusion: "success", created_at: "2026-09-16T08:00:00Z" }),
  ];
  const escolhido = selecionarUltimoSucesso(runs);
  assert.ok(escolhido);
  assert.strictEqual(escolhido.created_at, "2026-09-17T08:00:00Z");
});

test("selecionarUltimoSucesso: sem schedule+success -> null (nao vale push verde)", () => {
  assert.strictEqual(selecionarUltimoSucesso(null), null);
  assert.strictEqual(selecionarUltimoSucesso([]), null);
  assert.strictEqual(selecionarUltimoSucesso([run({ event: "workflow_dispatch" })]), null);
  assert.strictEqual(selecionarUltimoSucesso([run({ conclusion: "cancelled" })]), null);
});

test("selecionarUltimoRun / idadeHoras: diagnostico e idade por created_at", () => {
  const runs = [run({ event: "schedule", conclusion: "failure", created_at: "2026-09-17T09:00:00Z" })];
  assert.strictEqual(selecionarUltimoRun(runs).conclusion, "failure");
  assert.strictEqual(idadeHoras(runs[0], AGORA), 3);
  assert.strictEqual(idadeHoras({}, AGORA), null);
  assert.strictEqual(idadeHoras({ created_at: "nao-e-data" }, AGORA), null);
});

test("avaliarVivacidade: alvo fresco dentro do teto -> ok", () => {
  const veredictos = avaliarVivacidade({
    alvos: [alvo()],
    runsPorArquivo: { "alvo.yml": [run({ created_at: "2026-09-17T08:00:00Z" })] },
    agoraMs: AGORA,
  });
  assert.strictEqual(veredictos.length, 1);
  assert.strictEqual(veredictos[0].ok, true);
  assert.match(veredictos[0].motivo, /ultimo sucesso ha 4h/);
});

test("avaliarVivacidade: ultimo sucesso alem do teto -> ESTOURADO (exit 1 na CLI)", () => {
  const veredictos = avaliarVivacidade({
    alvos: [alvo({ tetoHoras: 26 })],
    runsPorArquivo: { "alvo.yml": [run({ created_at: "2026-09-15T08:00:00Z" })] },
    agoraMs: AGORA,
  });
  assert.strictEqual(veredictos[0].ok, false);
  assert.match(veredictos[0].motivo, /ultimo sucesso ha 52h \(teto 26h\)/);
});

test("avaliarVivacidade: sem runs e sem success agendado -> ESTOURADO com motivo distinto", () => {
  const semRuns = avaliarVivacidade({ alvos: [alvo()], runsPorArquivo: { "alvo.yml": [] }, agoraMs: AGORA });
  assert.strictEqual(semRuns[0].ok, false);
  assert.match(semRuns[0].motivo, /sem run agendado/);

  const soFalha = avaliarVivacidade({
    alvos: [alvo()],
    runsPorArquivo: { "alvo.yml": [run({ conclusion: "failure" })] },
    agoraMs: AGORA,
  });
  assert.strictEqual(soFalha[0].ok, false);
  assert.match(soFalha[0].motivo, /nenhum run agendado com SUCESSO/);
});

test("avaliarVivacidade: teto global (--dias-max) sobrepoe o teto por alvo", () => {
  // Run com 4h de idade: DENTRO do teto por alvo (26h) e FORA de um teto global de 2h.
  const runs = { "alvo.yml": [run({ created_at: "2026-09-17T08:00:00Z" })] };
  const porAlvo = avaliarVivacidade({ alvos: [alvo()], runsPorArquivo: runs, agoraMs: AGORA });
  assert.strictEqual(porAlvo[0].ok, true);
  const global = avaliarVivacidade({ alvos: [alvo()], runsPorArquivo: runs, agoraMs: AGORA, tetoGlobalHoras: 2 });
  assert.strictEqual(global[0].ok, false);
  assert.strictEqual(global[0].tetoHoras, 2);
});

test("formatarRelatorio: nomeia alvo estourado e nunca esconde (ASCII)", () => {
  const veredictos = avaliarVivacidade({
    alvos: [alvo({ nome: "Backup Postgres diario" })],
    runsPorArquivo: { "alvo.yml": [run({ created_at: "2026-09-10T08:00:00Z" })] },
    agoraMs: AGORA,
  });
  const texto = formatarRelatorio(veredictos, AGORA);
  assert.match(texto, /\[FALHA\] alvo\.yml/);
  assert.match(texto, /Backup Postgres diario/);
  assert.match(texto, /ESTOURADO\(S\)/);
  assert.ok(
    [...texto].every((ch) => (ch.codePointAt(0) ?? 0) < 128),
    "relatorio deve ser ASCII"
  );
});

test("parseArgs: flags canonicas e falha explicita em entrada invalida", () => {
  assert.deepStrictEqual(parseArgs([]), { json: false, diasMax: null, repo: null });
  assert.strictEqual(parseArgs(["--json"]).json, true);
  assert.strictEqual(parseArgs(["--dias-max", "2"]).diasMax, 2);
  assert.strictEqual(parseArgs(["--repo", "a/b"]).repo, "a/b");
  assert.throws(() => parseArgs(["--dias-max", "zero"]), /numero > 0/);
  assert.throws(() => parseArgs(["--foo"]), /flag desconhecida/);
});

test("buscarRuns: consulta a API com token e devolve workflow_runs (fetch injetado)", async () => {
  const chamadas = [];
  const fetchFake = async (url, init) => {
    chamadas.push({ url: url, auth: init && init.headers && init.headers.Authorization });
    return { ok: true, status: 200, json: async () => ({ workflow_runs: [run()] }) };
  };
  const runs = await buscarRuns({ repo: "owner/repo", token: "tk", arquivo: "alvo.yml", fetchImpl: fetchFake });
  assert.strictEqual(runs.length, 1);
  // O filtro de evento VAI NA API: workflows que tambem rodam em push/PR
  // inundam a historia sem ele (gates-grafo/kf-gate-semantico).
  assert.match(chamadas[0].url, /\/runs\?event=schedule&per_page=/);
  assert.strictEqual(chamadas[0].auth, "Bearer tk");
});

test("buscarRuns: HTTP != 200 -> erro explicito (nunca silencio)", async () => {
  const fetchFake = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(
    () => buscarRuns({ repo: "owner/repo", token: "tk", arquivo: "sumiu.yml", fetchImpl: fetchFake }),
    /HTTP 404/
  );
});

test("main: sem token e sem repo falham com exit 2 (fail-closed, sem consulta)", async () => {
  const tokenAntes = process.env.GITHUB_TOKEN;
  const ghAntes = process.env.GH_TOKEN;
  const repoAntes = process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  const semToken = await main([]);
  assert.strictEqual(semToken, 2);
  process.env.GITHUB_TOKEN = "tk";
  delete process.env.GITHUB_REPOSITORY;
  const semRepo = await main([]);
  assert.strictEqual(semRepo, 2);
  if (tokenAntes !== undefined) process.env.GITHUB_TOKEN = tokenAntes;
  if (ghAntes !== undefined) process.env.GH_TOKEN = ghAntes;
  if (repoAntes !== undefined) process.env.GITHUB_REPOSITORY = repoAntes;
});
