"use strict";
/**
 * Testes do nucleo puro de check-schema-drift.cjs (OP-6).
 * Roda via `npm run test:scripts` (padrao scripts/__tests__/*.test.cjs).
 * SEM banco: cobre o parse estatico (fixture pgTable, inclusive em arquivo
 * temporario) e o diff — a comparacao live e' exercitada no CI (lane pesada).
 */
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseSchemaSource, diffSchema } = require("../check-schema-drift.cjs");

const NL = String.fromCharCode(10);
const Q = String.fromCharCode(34);

const FIXTURE = [
  "export const a = pgTable(" + Q + "alpha" + Q + ", {",
  "  id: uuid(" + Q + "id" + Q + ").primaryKey(),",
  "  titulo: text(" + Q + "titulo" + Q + "),",
  "  status: varchar(" + Q + "status" + Q + ", { length: 10 }).default(" + Q + "pending" + Q + "),",
  "}, (table) => [index(" + Q + "idx_alpha" + Q + ").on(table.id)]);",
  "",
  "export const b = pgTable(",
  "  " + Q + "beta" + Q + ",",
  "  { id: uuid(" + Q + "id" + Q + "), dono: uuid(" + Q + "dono" + Q + ") },",
  ");",
].join(NL);

// ── Parse estatico ──────────────────────────────────────────────────────────
const parsed = parseSchemaSource(FIXTURE);
assert.strictEqual(parsed.size, 2, "2 tabelas no fixture");
assert.deepStrictEqual(
  [...(parsed.get("alpha") || new Set())].sort(),
  ["id", "status", "titulo"],
  "default(x) NAO e' coluna e o index() da configuracao fica fora",
);
assert.deepStrictEqual([...(parsed.get("beta") || new Set())].sort(), ["dono", "id"], "pgTable multilinha");

// ── Parse a partir de ARQUIVO (caminho do CLI) ──────────────────────────────
const tmp = path.join(os.tmpdir(), "schema-drift-fixture-" + String(process.pid) + ".ts");
fs.writeFileSync(tmp, FIXTURE);
const fromFile = parseSchemaSource(fs.readFileSync(tmp, "utf8"));
fs.unlinkSync(tmp);
assert.strictEqual(fromFile.size, 2, "parse a partir de arquivo temporario");

// ── Diff: arvore limpa x fixture com drift ─────────────────────────────────
const limpo = diffSchema(parsed, new Map([
  ["alpha", new Set(["id", "status", "titulo"])],
  ["beta", new Set(["id", "dono"])],
]));
assert.deepStrictEqual(limpo, [], "arvore limpa passa (sem drift)");

const drift = diffSchema(parsed, new Map([["alpha", new Set(["id", "status", "titulo", "sobrancelha"])]]));
assert.strictEqual(drift.length, 2, "alpha com coluna extra + beta ausente = 2 achados");
assert.deepStrictEqual(drift.find((d) => d.table === "alpha").extra, ["sobrancelha"], "extra nomeada");
assert.strictEqual(drift.find((d) => d.table === "beta").missingTable, true, "tabela ausente sinalizada");

const faltando = diffSchema(parsed, new Map([["alpha", new Set(["id", "status"])], ["beta", new Set(["id", "dono"])]]));
assert.deepStrictEqual(faltando[0].missing, ["titulo"], "coluna faltando nomeada");

// ── Regressao do heuristico contra o schema.ts REAL ────────────────────────
const realPath = path.join(__dirname, "..", "..", "backend", "src", "db", "schema.ts");
const real = parseSchemaSource(fs.readFileSync(realPath, "utf8"));
assert.ok(real.size >= 40, "schema.ts real parseia >= 40 tabelas (achou " + String(real.size) + ")");
assert.ok([...(real.get("l2_entry") || new Set())].includes("embedding_vec"), "l2_entry.embedding_vec no parse");
assert.ok(![...(real.get("users") || new Set())].includes("user"), "default(user) nao vira coluna");

console.log("[check-schema-drift] ok — parse+diff verificados (tabelas reais: " + String(real.size) + ")");
