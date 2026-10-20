#!/usr/bin/env node
"use strict";
// scripts/check-schema-drift.cjs
// OP-6 — DRIFT de schema: compara o conjunto tabela->colunas DECLARADO pelo
// drizzle (backend/src/db/schema.ts, parse ESTATICO do fonte) com o que o banco
// realmente expoe em information_schema.columns (apos as migracoes).
//
// Uso: node scripts/check-schema-drift.cjs   (npm run schema:drift)
//   URL: DB_TEST_URL | DATABASE_URL | linha DB_TEST_URL= de backend/.env
//   Exit 0 = sem drift; Exit 1 = drift (diff acionavel) ou pre-condicao ausente.
//
// HEURISTICA DO PARSE (declarada, nao inferida): para cada `pgTable("nome", {`
// pega-se o PRIMEIRO objeto balanceado apos o nome (o mapa de colunas) e nele
// cada par `ident("valor")` vira coluna. O callback de configuracao (2o argumento,
// com index("idx_...")) fica FORA do objeto de colunas e por isso nao entra.
// Zero dependencias novas (usa o `postgres` do backend via require direto).
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(ROOT, "backend", "src", "db", "schema.ts");
const NL = String.fromCharCode(10);
const DQ = String.fromCharCode(34);

function isIdentChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

/** Fatia o trecho entre chaves balanceadas a partir da chave ABERTA em `start`. */
function sliceBalanced(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

// Builders de coluna do drizzle (whitelist declarada): o parse so aceita
// `builder("nome")` destes — default("user") e onUpdate(...) NAO sao colunas.
const COLUMN_BUILDERS = new Set(["uuid", "text", "varchar", "integer", "jsonb", "boolean", "numeric", "doublePrecision", "bigint", "date", "serial", "timestamp", "customType"]);

/** Colunas declaradas num objeto de colunas: pares `ident("valor")`. */
function extractColumns(body, builders) {
  const cols = [];
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf(DQ, i);
    if (open === -1) break;
    const close = body.indexOf(DQ, open + 1);
    if (close === -1) break;
    const value = body.slice(open + 1, close);
    let k = open - 1;
    while (k >= 0 && (body[k] === " " || body[k] === NL || body[k] === "\t")) k--;
    let callee = "";
    if (body[k] === "(") {
      k--;
      while (k >= 0 && (body[k] === " " || body[k] === NL || body[k] === "\t")) k--;
      const end = k;
      while (k >= 0 && isIdentChar(body[k])) k--;
      callee = body.slice(k + 1, end + 1);
    }
    if (builders.has(callee)) cols.push(value);
    i = close + 1;
  }
  return cols;
}

/** Aliases declarados como `const X = customType(...)` (ex.: vector1536) —
 *  tambem sao builders de coluna, e o parse nao pode ignora-los. */
function customTypeAliases(source) {
  const aliases = new Set();
  const marker = "customType";
  let i = source.indexOf(marker);
  while (i !== -1) {
    const before = source.lastIndexOf("const", i);
    const eq = before === -1 ? -1 : source.indexOf("=", before);
    if (eq !== -1 && eq < i) {
      const name = source.slice(before + 5, eq).trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) aliases.add(name);
    }
    i = source.indexOf(marker, i + marker.length);
  }
  return aliases;
}

/** { tabela: Set(colunas) } a partir do fonte do schema.ts. */
function parseSchemaSource(source) {
  const builders = new Set([...COLUMN_BUILDERS, ...customTypeAliases(source)]);
  const tables = new Map();
  const marker = "pgTable(";
  let i = source.indexOf(marker);
  while (i !== -1) {
    const openQuote = source.indexOf(DQ, i);
    const closeQuote = openQuote === -1 ? -1 : source.indexOf(DQ, openQuote + 1);
    if (closeQuote === -1) break;
    const table = source.slice(openQuote + 1, closeQuote);
    const openBrace = source.indexOf("{", closeQuote);
    const body = openBrace === -1 ? "" : sliceBalanced(source, openBrace);
    const cols = new Set(extractColumns(body, builders));
    cols.delete(table);
    if (cols.size > 0) tables.set(table, cols);
    i = source.indexOf(marker, closeQuote);
  }
  return tables;
}

/** URL do banco: env (DB_TEST_URL/DATABASE_URL) ou backend/.env (DB_TEST_URL=). */
function resolveDatabaseUrl() {
  const fromEnv = String(process.env.DB_TEST_URL || process.env.DATABASE_URL || "");
  if (fromEnv.length > 0) return fromEnv;
  const envPath = path.join(ROOT, "backend", ".env");
  if (!fs.existsSync(envPath)) return "";
  const prefix = "DB_TEST_URL=";
  for (const line of fs.readFileSync(envPath, "utf8").split(NL)) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return "";
}

/** Carrega o driver do backend sem depender de node_modules da raiz. */
function loadPostgres() {
  const candidates = [path.join(ROOT, "backend", "node_modules", "postgres"), "postgres"];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // tenta o proximo candidato
    }
  }
  return null;
}

/** { tabela: Set(colunas) } lido do banco real (information_schema, public). */
async function readLiveTables(url) {
  const postgres = loadPostgres();
  if (postgres === null) throw new Error("dependencia 'postgres' nao encontrada (rode npm ci em backend/)");
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 15 });
  try {
    const rows = await sql.unsafe(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
    );
    const tables = new Map();
    for (const row of rows) {
      const table = String(row.table_name);
      const cols = tables.get(table) || new Set();
      cols.add(String(row.column_name));
      tables.set(table, cols);
    }
    return tables;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Diff tabela->colunas: missing (schema.ts x banco) + extra (banco x schema.ts). */
function diffSchema(expected, live) {
  const diffs = [];
  for (const [table, cols] of expected) {
    const liveCols = live.get(table);
    if (liveCols === undefined) {
      diffs.push({ table, missingTable: true, missing: [...cols], extra: [] });
      continue;
    }
    const missing = [...cols].filter((c) => !liveCols.has(c));
    const extra = [...liveCols].filter((c) => !cols.has(c));
    if (missing.length > 0 || extra.length > 0) diffs.push({ table, missingTable: false, missing, extra });
  }
  return diffs;
}

/** CLI: compara e SAI 1 em drift (diff acionavel no stderr). */
async function main() {
  const url = resolveDatabaseUrl();
  if (url.length === 0) {
    console.error("[schema-drift] DB_TEST_URL/DATABASE_URL ausente (env ou backend/.env) — nada a comparar.");
    process.exit(1);
  }
  const expected = parseSchemaSource(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const live = await readLiveTables(url);
  const diffs = diffSchema(expected, live);
  // Tabela AUSENTE nao e' drift de COLUNA: varias tabelas do schema.ts sao
  // provisionadas FORA do migrate.ts (drizzle-kit push no boot — ex.: sessions,
  // idempotency_keys, error_logs). Elas viram AVISO; o exit 1 fica reservado
  // ao drift REAL de coluna (missing/extra) numa tabela existente.
  const colDrift = diffs.filter((d) => !d.missingTable);
  const tabelasAusentes = diffs.filter((d) => d.missingTable).map((d) => d.table);
  console.log("[schema-drift] tabelas no schema.ts: " + String(expected.size) + " | no banco: " + String(live.size));
  if (tabelasAusentes.length > 0) {
    console.warn("[schema-drift] AVISO — tabela(s) do schema.ts ausentes no banco (provisionamento FORA do migrate.ts, ex.: drizzle-kit push): " + tabelasAusentes.join(
));
  }
  if (colDrift.length === 0) {
    console.log("[schema-drift] OK — nenhum drift de COLUNA entre backend/src/db/schema.ts e information_schema.columns.");
    return;
  }
  console.error("[schema-drift] DRIFT DE COLUNA em " + String(colDrift.length) + " tabela(s):");
  for (const d of colDrift) {
    const parts = [];
    if (d.missingTable) parts.push("TABELA AUSENTE no banco");
    if (d.missing.length > 0) parts.push("colunas faltando (migracao pendente): " + d.missing.join(", "));
    if (d.extra.length > 0) parts.push("colunas extras (schema.ts desatualizado): " + d.extra.join(", "));
    console.error("  - " + d.table + ": " + parts.join(" | "));
  }
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    const msg = err && err.message ? err.message : String(err);
    console.error("[schema-drift] falha: " + msg);
    process.exit(1);
  });
}

module.exports = {
  parseSchemaSource,
  extractColumns,
  diffSchema,
  resolveDatabaseUrl,
  readLiveTables,
  SCHEMA_PATH,
};
