// scripts/__tests__/verificar-frescor-indice-vetorial.test.cjs
// FR-SEM-06 — Teste unitário do verificador de frescor do índice vetorial (node:test).
// Sem rede, determinístico: mocka o sidecar via env VETORIAL_INDEX_JSON (reaproveitando
// o mesmo padrão de VETORIAL_INDEX_* do buscar-vetorial.cjs) e verifica:
//   - índice ausente → exit 1
//   - sidecar ilegível → exit 1
//   - sidecar sem chunks → exit 1
//   - arquivos fonte com hash consistente → exit 0
//   - arquivo fonte modificado / ausente → exit 1
// Lê SÓ o sidecar (nunca o .bin).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const FIXTURES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vetorial-check-"));

function hashOf(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function makeSidecar(chunks) {
  return JSON.stringify({ version: 1, model: "openai/text-embedding-3-small", dimensions: 1536, chunks });
}

function runVerifier(indexJsonPath) {
  // Carrega o verificador com o caminho do sidecar sobreposto via env
  const original = process.env.VETORIAL_INDEX_JSON;
  process.env.VETORIAL_INDEX_JSON = indexJsonPath;
  try {
    const { verificar } = require("../verificar-frescor-indice-vetorial.cjs");
    return verificar();
  } finally {
    if (original === undefined) {
      delete process.env.VETORIAL_INDEX_JSON;
    } else {
      process.env.VETORIAL_INDEX_JSON = original;
    }
  }
}

test("índice vetorial ausente → exit 1", () => {
  const missing = path.join(FIXTURES_DIR, "inexistente.json");
  assert.equal(runVerifier(missing), 1);
});

test("sidecar ilegível → exit 1", () => {
  const bad = path.join(FIXTURES_DIR, "bad.json");
  fs.writeFileSync(bad, "{{invalid json", "utf8");
  assert.equal(runVerifier(bad), 1);
});

test("sidecar sem chunks → exit 1", () => {
  const empty = path.join(FIXTURES_DIR, "empty.json");
  fs.writeFileSync(empty, makeSidecar([]), "utf8");
  assert.equal(runVerifier(empty), 1);
});

test("todos os fileHashes consistentes → exit 0", () => {
  const srcDir = fs.mkdtempSync(path.join(FIXTURES_DIR, "src-"));
  const fileA = path.join(srcDir, "a.ts");
  const fileB = path.join(srcDir, "b.ts");
  fs.writeFileSync(fileA, "export const a = 1;", "utf8");
  fs.writeFileSync(fileB, "export const b = 2;", "utf8");

  const sidecarPath = path.join(FIXTURES_DIR, "fresh.json");
  fs.writeFileSync(
    sidecarPath,
    makeSidecar([
      { path: fileA, exportName: "a", content: "…", startLine: 1, fileHash: hashOf(fs.readFileSync(fileA)), offset: 0, length: 1536 },
      { path: fileB, exportName: "b", content: "…", startLine: 1, fileHash: hashOf(fs.readFileSync(fileB)), offset: 1536, length: 1536 },
    ]),
    "utf8",
  );

  assert.equal(runVerifier(sidecarPath), 0);
});

test("arquivo fonte modificado após build → exit 1 com lista", () => {
  const srcDir = fs.mkdtempSync(path.join(FIXTURES_DIR, "src2-"));
  const fileA = path.join(srcDir, "a.ts");
  fs.writeFileSync(fileA, "export const a = 1;", "utf8");

  const sidecarPath = path.join(FIXTURES_DIR, "stale.json");
  fs.writeFileSync(
    sidecarPath,
    makeSidecar([
      { path: fileA, exportName: "a", content: "…", startLine: 1, fileHash: hashOf(Buffer.from("conteúdo antigo")), offset: 0, length: 1536 },
    ]),
    "utf8",
  );

  assert.equal(runVerifier(sidecarPath), 1);
});

test("arquivo fonte ausente (removido) → exit 1", () => {
  const srcDir = fs.mkdtempSync(path.join(FIXTURES_DIR, "src3-"));
  const fileA = path.join(srcDir, "a.ts");
  fs.writeFileSync(fileA, "export const a = 1;", "utf8");
  const hashA = hashOf(fs.readFileSync(fileA));
  fs.unlinkSync(fileA); // remove após capturar o hash

  const sidecarPath = path.join(FIXTURES_DIR, "missing-src.json");
  fs.writeFileSync(
    sidecarPath,
    makeSidecar([
      { path: fileA, exportName: "a", content: "…", startLine: 1, fileHash: hashA, offset: 0, length: 1536 },
    ]),
    "utf8",
  );

  assert.equal(runVerifier(sidecarPath), 1);
});