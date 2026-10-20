// scripts/__tests__/chunking.test.cjs
// FR-SEM-01: Teste unitário do chunking engine (node:test).
// Cobre: AST parsing (exports TS) + markdown header split.
// Runner: node --test scripts/__tests__/ (FR-SEM-06 registra em package.json).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { chunkFile, chunkMarkdown } = require("../lib/chunking.cjs");

/** Cria um arquivo temporário com o conteúdo dado e retorna o caminho. */
function tempFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chunking-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("chunkFile extrai exports function/class/interface/type/enum com campos completos", () => {
  const filePath = tempFile(
    "sample.ts",
    [
      "// comentário de topo",
      "",
      "export interface Config {",
      "  maxAttempts?: number;",
      "}",
      "",
      "function helperInterno() { return 1; }", // NÃO exportado — não gera chunk
      "",
      "export class RetryExhaustedError extends Error {",
      "  constructor(message: string) { super(message); }",
      "}",
      "",
      "export async function executeWithRetry(operation: () => Promise<unknown>) {",
      "  return operation();",
      "}",
      "",
      "export const CONSTANTE = 42;",
      "",
      "export type Tipo = string | number;",
      "",
      "export enum Modo { A, B }",
      "",
    ].join("\n"),
  );

  const chunks = chunkFile(filePath);
  const names = chunks.map((c) => c.exportName).sort();

  assert.equal(chunks.length, 6, "deve extrair 6 exports (interface, class, function, const, type, enum)");
  assert.deepEqual(names, [
    "CONSTANTE",
    "Config",
    "Modo",
    "RetryExhaustedError",
    "Tipo",
    "executeWithRetry",
  ]);

  // Campos obrigatórios do contrato Chunk={path, exportName, content, startLine}
  for (const chunk of chunks) {
    assert.ok(chunk.path, "path presente");
    assert.ok(chunk.exportName, "exportName presente");
    assert.ok(chunk.content.length > 0, "content não vazio");
    assert.equal(typeof chunk.startLine, "number", "startLine numérico");
  }

  // startLine aponta para o início do texto do nó (node.pos inclui JSDoc/trivia precedente)
  const executeChunk = chunks.find((c) => c.exportName === "executeWithRetry");
  assert.ok(executeChunk.content.includes("export async function executeWithRetry"));
  assert.equal(executeChunk.startLine, 11, "startLine do executeWithRetry = linha 11 (node.pos inclui JSDoc/trivia)");

  // helper interno NÃO virou chunk individual (TETO V1 P8)
  const interno = chunks.find((c) => c.exportName.includes("helperInterno"));
  assert.equal(interno, undefined, "helper não exportado não gera chunk");
});

test("chunkFile extrai default export como chunk 'default'", () => {
  const filePath = tempFile(
    "default-export.ts",
    [
      "export default function main() {",
      "  return 'ok';",
      "}",
      "",
    ].join("\n"),
  );

  const chunks = chunkFile(filePath);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].exportName, "main");
  assert.ok(chunks[0].content.includes("export default function main"));
});

test("chunkFile trata barrel file (re-exports) sem crash (TETO V1 P8)", () => {
  const filePath = tempFile(
    "barrel.ts",
    [
      "export * from './a';",
      "export { b } from './b';",
      "",
    ].join("\n"),
  );

  const chunks = chunkFile(filePath);
  assert.ok(Array.isArray(chunks), "barrel não crasha — retorna array");
  assert.ok(chunks.length >= 1, "barrel gera ao menos 1 chunk (ruído aceitável)");
  for (const chunk of chunks) {
    assert.ok(chunk.content.includes("export"), "chunk de re-export contém 'export'");
  }
});

test("chunkMarkdown split por ## e ### com exportName = título", () => {
  const filePath = tempFile(
    "doc.md",
    [
      "# Título Principal",
      "",
      "Intro que fica fora de seção (sem header) — não gera chunk próprio.",
      "",
      "## Seção Um",
      "",
      "Conteúdo da seção um.",
      "",
      "### Subseção A",
      "",
      "Conteúdo da subseção A.",
      "",
      "## Seção Dois",
      "",
      "Conteúdo da seção dois.",
      "",
    ].join("\n"),
  );

  const chunks = chunkMarkdown(filePath);
  const names = chunks.map((c) => c.exportName).sort();

  assert.deepEqual(names, [
    "Seção Dois",
    "Seção Um",
    "Subseção A",
  ]);

  // startLine do chunk da primeira seção
  const secaoUm = chunks.find((c) => c.exportName === "Seção Um");
  assert.equal(secaoUm.startLine, 5, "startLine do header ## Seção Um");
  assert.ok(secaoUm.content.includes("## Seção Um"));
  assert.ok(secaoUm.content.includes("Conteúdo da seção um."));
});

test("chunkMarkdown fallback: arquivo sem ##/### vira um único chunk com título #", () => {
  const filePath = tempFile(
    "sem-secoes.md",
    [
      "# Docs Único",
      "",
      "Texto livre sem seções internas.",
      "",
    ].join("\n"),
  );

  const chunks = chunkMarkdown(filePath);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].exportName, "Docs Único");
  assert.ok(chunks[0].content.includes("Texto livre sem seções internas."));
});