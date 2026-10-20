#!/usr/bin/env node
// scripts/lib/file-hash.cjs — módulo compartilhado de hash de conteúdo por arquivo.
// Extraído de verificar-frescor-indice-vetorial.cjs + gerar-indice-vetorial.cjs
// (SP-INDICES-VETORIAL-01, D4/D5): single-source para os 3 consumidores do fileHash
// (gerador, verificador build-time, busca query-time). A normalização CRLF→LF é
// PARTE DO CONTRATO (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905): checkout com
// core.autocrlf reescreve texto com CRLF e gerava falso stale pós-merge.
// Fallback documentado: se a extração quebrar teste legado, duplicar a função
// com comentário de origem em vez de divergir silenciosamente.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");

// Resolve o caminho fonte do chunk para o disco local. Desde o
// PATCH-OTIMIZACAO-CI-ONDA3-20260906 o sidecar grava path RELATIVO à raiz
// (separador "/"), portável entre OS; paths absolutos legados (máquina de
// geração, ex.: C:\LilaV2\...) seguem suportados pelo ramo isAbsolute.
function resolveSource(key) {
  if (path.isAbsolute(key)) return key;
  return path.join(ROOT, ...String(key).split("/"));
}

function fileHash(filePath) {
  const buf = fs.readFileSync(filePath);
  // Mesma normalização CRLF→LF do gerador (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905):
  // evita falso stale quando o checkout reescreve texto com CRLF (core.autocrlf).
  if (!buf.includes(0)) {
    const texto = buf.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return crypto.createHash("sha256").update(texto, "utf8").digest("hex");
  }
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function repoRoot() {
  return ROOT;
}

module.exports = { fileHash, resolveSource, repoRoot, ROOT };
