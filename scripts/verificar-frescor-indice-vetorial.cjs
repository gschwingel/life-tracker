#!/usr/bin/env node
/**
 * scripts/verificar-frescor-indice-vetorial.cjs
 * FR-SEM-06 — Verificador de frescor específico do índice vetorial, baseado em
 * fileHash por chunk (não mtime). Lê SÓ o sidecar indice-vetorial.json (NUNCA
 * o .bin — ~7MB Float32Array), computa o hash atual de cada arquivo fonte e
 * compara com o fileHash armazenado.
 *
 * Exit: 0 = fresco (todos os fileHashes batem) | 1 = stale (algum mudou ou índice ausente/inválido)
 *
 * Uso: node scripts/verificar-frescor-indice-vetorial.cjs
 *
 * O FR-SEM-07 integra este verificador específico no pipeline genérico existente
 * (verificar-frescor-indices.cjs + package.json indices:check). Ambos coexistem:
 * o genérico usa mtime×git; este afirma conteúdo por hash.
 */
const fs = require("fs");
const path = require("path");

const { fileHash, resolveSource } = require("./lib/file-hash.cjs");

// Env de teste (mesmo padrão de VETORIAL_INDEX_* do buscar-vetorial.cjs):
// sobrepõe o caminho do sidecar sem tocar o índice real.
const DEFAULT_INDEX_JSON = path.join(__dirname, "..", "indice-vetorial.json");

function indexJsonPath() {
  return process.env.VETORIAL_INDEX_JSON || DEFAULT_INDEX_JSON;
}

function verificar() {
  const INDEX_JSON = indexJsonPath();
  if (!fs.existsSync(INDEX_JSON)) {
    console.log("⚪ indice-vetorial.json ausente — ÍNDICE VETORIAL NÃO VERIFICADO (rode npm run indices)");
    return 1;
  }

  let sidecar;
  try {
    sidecar = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
  } catch (e) {
    console.log(`🔴 indice-vetorial.json ilegível: ${e.message}`);
    return 1;
  }

  if (!Array.isArray(sidecar.chunks) || sidecar.chunks.length === 0) {
    console.log("🔴 indice-vetorial.json sem chunks — índice vazio ou inválido");
    return 1;
  }

  const stale = [];
  const ausentes = [];
  const okSet = new Set();
  const countByFile = new Map();

  for (const c of sidecar.chunks) {
    if (typeof c.path !== "string" || typeof c.fileHash !== "string") continue;
    const key = c.path;
    const resolved = resolveSource(key);
    countByFile.set(key, (countByFile.get(key) ?? 0) + 1);
    if (okSet.has(key)) continue; // já validado fresco
    if (!fs.existsSync(resolved)) {
      if (!ausentes.includes(key)) ausentes.push(key);
      continue;
    }
    try {
      if (fileHash(resolved) === c.fileHash) {
        okSet.add(key);
      } else if (!stale.includes(key)) {
        stale.push(key);
      }
    } catch {
      if (!stale.includes(key)) stale.push(key);
    }
  }

  const totalArquivos = countByFile.size;
  const frescos = okSet.size;
  let exitCode = 0;

  if (ausentes.length > 0) {
    console.log(`🔴 Vetorial — ${ausentes.length} arquivo(s) fonte ausente(s) no disco (removidos?):`);
    for (const f of ausentes.slice(0, 10)) console.log(`  - ${f}`);
    exitCode = 1;
  }

  if (stale.length > 0) {
    console.log(`🟡 Vetorial — ${stale.length} arquivo(s) fonte com conteúdo alterado desde o último build:`);
    for (const f of stale.slice(0, 10)) console.log(`  - ${f}`);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log(`🟢 Vetorial fresco — ${frescos}/${totalArquivos} arquivos fonte com fileHash consistente (${sidecar.chunks.length} chunks)`);
  } else if (frescos > 0) {
    console.log(`⚠️  Vetorial: ${frescos}/${totalArquivos} arquivos frescos — execute: npm run indices:vetorial`);
  }

  return exitCode;
}

if (require.main === module) {
  process.exit(verificar());
}

module.exports = { verificar, fileHash, resolveSource };