// scripts/__tests__/backup-postgres.test.cjs
// PATCH-REMOVE-ADMIN-BACKUP (2026-08-28) — testes node:test do script de backup.
// Cobre as funções puras (parseArgs, timestamp, rotateDumps); nunca dispara
// pg_dump (spawn real fora do escopo de unidade).

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseArgs, timestamp, rotateDumps } = require("../backup-postgres.cjs");

test("parseArgs — defaults", () => {
  const o = parseArgs([]);
  assert.strictEqual(o.check, false);
  assert.strictEqual(o.dir, "backups");
  assert.strictEqual(o.keep, 7);
  assert.strictEqual(o.format, "custom");
  assert.strictEqual(o.url, null);
});

test("parseArgs — flags", () => {
  const o = parseArgs(["--check", "--dir", "x", "--keep", "3", "--format", "plain", "--url", "u"]);
  assert.strictEqual(o.check, true);
  assert.strictEqual(o.dir, "x");
  assert.strictEqual(o.keep, 3);
  assert.strictEqual(o.format, "plain");
  assert.strictEqual(o.url, "u");
});

test("timestamp — formato YYYYMMDD-HHmmss", () => {
  assert.match(timestamp(), /^\d{8}-\d{6}$/);
});

test("rotateDumps — mantém os keep mais recentes e remove o resto", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
  try {
    fs.writeFileSync(path.join(dir, "backup-20260828-010000.dump"), "a");
    fs.writeFileSync(path.join(dir, "backup-20260827-010000.dump"), "b");
    fs.writeFileSync(path.join(dir, "backup-20260826-010000.dump"), "c");
    fs.writeFileSync(path.join(dir, "not-a-backup.txt"), "x");

    const removed = rotateDumps(dir, 2);

    assert.deepStrictEqual(removed, ["backup-20260826-010000.dump"]);
    assert.ok(fs.existsSync(path.join(dir, "backup-20260828-010000.dump")));
    assert.ok(fs.existsSync(path.join(dir, "backup-20260827-010000.dump")));
    assert.ok(!fs.existsSync(path.join(dir, "backup-20260826-010000.dump")));
    assert.ok(fs.existsSync(path.join(dir, "not-a-backup.txt"))); // não-dump intocado
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rotateDumps — keep maior que total não remove nada", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
  try {
    fs.writeFileSync(path.join(dir, "backup-20260828-010000.dump"), "a");
    const removed = rotateDumps(dir, 7);
    assert.deepStrictEqual(removed, []);
    assert.ok(fs.existsSync(path.join(dir, "backup-20260828-010000.dump")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
