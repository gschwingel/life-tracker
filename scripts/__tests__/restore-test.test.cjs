// scripts/__tests__/restore-test.test.cjs
// Restore-test (D3/8.2 — sweep hardening 2026-08-28) — testes node:test das funções
// puras (parseArgs, maskUrl, dbNameFromUrl, serverFromUrl, timestamp, tableNames).
// Nunca dispara pg_dump/pg_restore reais (spawn real fora do escopo de unidade).

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { parseArgs, maskUrl, dbNameFromUrl, serverFromUrl, withDbName, timestamp } = require("../restore-test.cjs");

test("parseArgs — defaults", () => {
  const o = parseArgs([]);
  assert.strictEqual(o.check, false);
  assert.strictEqual(o.sourceUrl, null);
  assert.strictEqual(o.targetUrl, null);
  assert.strictEqual(o.dump, null);
  assert.strictEqual(o.keepDump, false);
  assert.strictEqual(o.createScratch, null);
  assert.strictEqual(o.dropScratch, null);
  assert.strictEqual(o.help, false);
});

test("parseArgs — flags completas", () => {
  const o = parseArgs([
    "--check",
    "--source-url", "postgres://a:b@h:5432/x",
    "--target-url", "postgres://a:b@h:5432/y",
    "--dump", "backups/x.dump",
    "--keep-dump",
    "--create-scratch", "scratch",
    "--drop-scratch", "scratch",
  ]);
  assert.strictEqual(o.check, true);
  assert.strictEqual(o.sourceUrl, "postgres://a:b@h:5432/x");
  assert.strictEqual(o.targetUrl, "postgres://a:b@h:5432/y");
  assert.strictEqual(o.dump, "backups/x.dump");
  assert.strictEqual(o.keepDump, true);
  assert.strictEqual(o.createScratch, "scratch");
  assert.strictEqual(o.dropScratch, "scratch");
});

test("maskUrl — nunca expõe a senha", () => {
  assert.strictEqual(maskUrl("postgres://lila:super-secreta@localhost:5432/lila_c137"), "postgres://lila:****@localhost:5432/lila_c137");
  assert.strictEqual(maskUrl(""), "");
});

test("dbNameFromUrl — extrai o banco do path", () => {
  assert.strictEqual(dbNameFromUrl("postgres://u:p@h:5432/lila_c137"), "lila_c137");
  assert.strictEqual(dbNameFromUrl("postgres://u:p@h:5432/lila_c137?sslmode=require"), "lila_c137");
  assert.strictEqual(dbNameFromUrl(""), "");
});

test("serverFromUrl — host/port/user/pass com default de porta", () => {
  const s = serverFromUrl("postgres://lila:senha@db.example.com:5433/lila");
  assert.strictEqual(s.host, "db.example.com");
  assert.strictEqual(s.port, "5433");
  assert.strictEqual(s.user, "lila");
  assert.strictEqual(s.pass, "senha");
  const s2 = serverFromUrl("postgres://lila:senha@db.example.com/lila");
  assert.strictEqual(s2.port, "5432");
});

test("timestamp — formato YYYYMMDD-HHmmss", () => {
  assert.match(timestamp(), /^\d{8}-\d{6}$/);
});

test("withDbName — troca o banco preservando credenciais e query params", () => {
  assert.strictEqual(
    withDbName("postgresql://lila:senha@h:5432/railway", "lila_restore_test"),
    "postgresql://lila:senha@h:5432/lila_restore_test"
  );
  assert.strictEqual(
    withDbName("postgres://lila:senha@h:5432/railway?sslmode=require", "scratch"),
    "postgres://lila:senha@h:5432/scratch?sslmode=require"
  );
});
