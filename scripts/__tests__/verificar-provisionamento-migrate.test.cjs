"use strict";
// Suite: verificar-provisionamento-migrate — nucleo puro (parse de CREATE /
// RENAME / ALTER e conjunto provisionado) + execucao real do script contra
// fixtures temporarias (vermelha e verde) e contra o migrate.ts canonico.
// F6 — KF-22 / pendencia #2 (PR-B).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  extrairCriadas,
  extrairAlteradas,
  provisionadas,
  analisar,
  buildReport,
  DEFAULT_MIGRATE,
} = require("../verificar-provisionamento-migrate.cjs");

const SCRIPT = path.resolve(__dirname, "..", "verificar-provisionamento-migrate.cjs");

function fixture(conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-migrate-"));
  const arquivo = path.join(dir, "migrate-fixture.ts");
  fs.writeFileSync(arquivo, conteudo, "utf8");
  return arquivo;
}

function roda(arquivo) {
  return spawnSync(process.execPath, [SCRIPT, "--migrate", arquivo, "--json"], { encoding: "utf8" });
}

// ── nucleo puro ──────────────────────────────────────────────────────────────
test("extrairCriadas: lista normalizada e ordenada das tabelas criadas", () => {
  const sql = [
    "CREATE TABLE IF NOT EXISTS Users (id uuid);",
    "create table if not exists l1_state (id uuid);",
    "CREATE TABLE outras (id uuid);", // sem IF NOT EXISTS nao conta
  ].join("\n");
  assert.deepEqual(extrairCriadas(sql), ["l1_state", "users"]);
});

test("extrairAlteradas: captura alvo dentro de bloco DO $$ (user_tokens)", () => {
  const sql = [
    "DO $$",
    "BEGIN",
    "  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = 'user_tokens'::regclass) THEN",
    "    ALTER TABLE user_tokens ADD CONSTRAINT uq UNIQUE (user_id, provider);",
    "  END IF;",
    "END $$;",
    "ALTER TABLE model_telemetry ADD COLUMN IF NOT EXISTS provider varchar(64);",
  ].join("\n");
  assert.deepEqual(extrairAlteradas(sql), ["model_telemetry", "user_tokens"]);
});

test("provisionadas: destino de RENAME de tabela criada no arquivo herda o provisionamento", () => {
  const sql = [
    "CREATE TABLE IF NOT EXISTS chat_history (id uuid);",
    "ALTER TABLE chat_history RENAME TO l5_chat_history;",
    "ALTER TABLE l5_chat_history ADD COLUMN IF NOT EXISTS mode varchar(16);",
  ].join("\n");
  const r = analisar(sql);
  assert.deepEqual(r.renomeadas, [{ de: "chat_history", para: "l5_chat_history" }]);
  assert.deepEqual(r.semProvisionamento, []);
});

test("provisionadas: cadeia de RENAME em cascata (a -> b -> c) conta como provisionada", () => {
  const prov = provisionadas({
    criadas: ["a"],
    renomeadas: [
      { de: "a", para: "b" },
      { de: "b", para: "c" },
    ],
  });
  assert.equal(prov.has("c"), true);
});

test("analisar: ALTER em tabela nunca criada e alvo orfao (caso users)", () => {
  const r = analisar("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_repo TEXT;");
  assert.deepEqual(r.alvos, ["users"]);
  assert.deepEqual(r.semProvisionamento, ["users"]);
});

test("analisar: CREATE + ALTER da mesma tabela nao produz alvo orfao", () => {
  const sql = [
    "CREATE TABLE IF NOT EXISTS users (id uuid);",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS github_repo TEXT;",
  ].join("\n");
  assert.deepEqual(analisar(sql).semProvisionamento, []);
});

test("buildReport: shape estavel do gate (ok/exitCode/contagens)", () => {
  const verde = buildReport(analisar("CREATE TABLE IF NOT EXISTS t (id uuid);\nALTER TABLE t ADD COLUMN a int;"), DEFAULT_MIGRATE);
  assert.equal(verde.ok, true);
  assert.equal(verde.exitCode, 0);
  assert.equal(verde.alvosAlterTable, 1);
  assert.equal(verde.criadas, 1);
  assert.equal(verde.arquivo, "backend/src/scripts/migrate.ts");
  const vermelho = buildReport(analisar("ALTER TABLE t ADD COLUMN a int;"), null);
  assert.equal(vermelho.ok, false);
  assert.equal(vermelho.exitCode, 1);
  assert.deepEqual(vermelho.semProvisionamento, ["t"]);
});

// ── E2E (script real x fixtures) ─────────────────────────────────────────────
test("E2E: fixture com alvo orfao sai 1 e aponta o alvo no JSON", () => {
  const arquivo = fixture("ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS a int;");
  const r = roda(arquivo);
  assert.equal(r.status, 1);
  const rel = JSON.parse(r.stdout);
  assert.equal(rel.ok, false);
  assert.deepEqual(rel.semProvisionamento, ["email_logs"]);
});

test("E2E: fixture provisionada sai 0", () => {
  const arquivo = fixture(
    "CREATE TABLE IF NOT EXISTS t (id uuid);\nALTER TABLE t ADD COLUMN IF NOT EXISTS a int;"
  );
  const r = roda(arquivo);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).ok, true);
});

test("E2E: migrate.ts canonico do repo esta 100% provisionado (sem --migrate)", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--json"], { encoding: "utf8" });
  const rel = JSON.parse(r.stdout);
  assert.equal(rel.ok, true, "alvos orfaos: " + JSON.stringify(rel.semProvisionamento));
  assert.equal(r.status, 0);
});

test("E2E: arquivo inexistente sai 1 com mensagem clara", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--migrate", path.join(os.tmpdir(), "nao-existe.ts")], {
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /arquivo de migracoes ausente/);
});
