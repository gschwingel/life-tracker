#!/usr/bin/env node
// scripts/run-test-scripts.cjs
// Propósito: rodar as suítes node:test de scripts/__tests__ com CAMINHOS EXPLÍCITOS.
// Referência: CI fix 2026-08-24 (frontend job — test:scripts falhava no Node 20).
// Entrada: nenhuma (descobre *.test.cjs em scripts/__tests__).
// Saída: exit 0 (todas verdes) | exit 1 (falha ou nenhum teste encontrado).
//
// POR QUE CAMINHOS EXPLÍCITOS:
// - Node 20 (CI test.yml): `node --test "scripts/__tests__/*.test.cjs"` NÃO expande
//   glob ("Could not find"); apenas diretório recursa.
// - Node 22+ (dev local): diretório vira módulo ("Cannot find module"); só glob funciona.
// - Caminhos explícitos funcionam em TODAS as versões e plataformas (sem gambiarra).

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (process.argv.length > 2) {
  console.error("Uso: node scripts/run-test-scripts.cjs (sem argumentos — descobre os testes)");
  process.exit(1);
}

const TEST_DIR = path.join(__dirname, "__tests__");
const files = fs
  .readdirSync(TEST_DIR)
  .filter((f) => f.endsWith(".test.cjs"))
  .sort()
  .map((f) => path.join(TEST_DIR, f));

if (files.length === 0) {
  console.error(`Nenhum arquivo *.test.cjs encontrado em ${TEST_DIR} — test:scripts vazio`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
