#!/usr/bin/env node
// scripts/verificar-alinhamento-vetorial.cjs
// PATCH-ANTI-CORRUPCAO-INDICE-20260923 — verificador de integridade VETOR↔CHUNK do
// índice vetorial: a superfície que verificar-frescor-indice-vetorial.cjs NÃO cobre
// (fileHash valida fonte↔chunk; este valida que o vetor no offset de cada chunk é
// SEMELHANTE ao texto do chunk). Nasceu do incidente 2026-09-23 — line-merge do
// sidecar + bin de um lado = corrupção silenciosa (E3 §5.8 do
// PATCH-STREAM-RESILIENCIA-20260923; ver RULE 6 do PROTOCOLO-INDICES.md).
//
// Duas camadas:
//   1. ESTRUTURAL (sem rede): offsets i*dim*4, tamanho do bin, dimensions.
//   2. SEMÂNTICA amostral (re-embed via OpenRouter — centavos por execução):
//      cos(vetor armazenado, vetor do texto atual) por amostra; < limiar = ruim.
//
// Uso: node scripts/verificar-alinhamento-vetorial.cjs [--amostra N] [--limiar X] [--so-estrutural]
//   Env: VETORIAL_INDEX_JSON / VETORIAL_INDEX_BIN (sobrepõe caminhos — padrão do
//        ecossistema, igual gerador/buscar-vetorial) | OPENROUTER_API_KEY (camada 2;
//        .env da raiz é lido como fallback).
// Exit: 0 alinhado | 1 desalinhado ou falha estrutural | 2 uso inválido, índice
//       ausente ou semântica exigida sem chave (fail-closed — nunca passa em silêncio).
// Testes: scripts/__tests__/verificar-alinhamento-vetorial.test.cjs (node --test)
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_JSON = path.join(__dirname, "..", "indice-vetorial.json");
const DEFAULT_BIN = path.join(__dirname, "..", "indice-vetorial.bin");

function indexJsonPath() {
  return process.env.VETORIAL_INDEX_JSON || DEFAULT_JSON;
}
function indexBinPath() {
  return process.env.VETORIAL_INDEX_BIN || DEFAULT_BIN;
}

/** Cosseno (paridade com buscar-vetorial.cjs e backend/src/lib/vector.js). */
function cosine(a, b) {
  let d = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/** Índices amostrados uniformemente; sempre inclui o primeiro e o último. */
function selecionarAmostras(total, n) {
  if (total <= 0) return [];
  const qtd = Math.min(Math.max(1, n), total);
  const out = [];
  for (let i = 0; i < qtd; i++) out.push(Math.floor((i * total) / qtd));
  return [...new Set(out)];
}

/**
 * Lê o vetor Float32 do chunk. O `offset` do sidecar é em FLOATS (convenção medida
 * em 2026-09-23: offset/dim === i do chunk, length === dim) — byte offset = offset*4.
 */
function lerVetor(binBuf, offsetFloats, dim) {
  const base = offsetFloats * 4;
  const out = new Array(dim);
  for (let k = 0; k < dim; k++) out[k] = binBuf.readFloatLE(base + k * 4);
  return out;
}

/**
 * Camada 1 — estrutural (sem rede): o bin tem o tamanho exato e cada chunk declara
 * o offset canônico i*dim*4 (descompasso = par desalinhado por construção).
 */
function verificarEstrutural({ chunks, dimensions, binBuf }) {
  const problemas = [];
  const porChunk = dimensions * 4;
  const esperado = chunks.length * porChunk;
  if (binBuf.length !== esperado) {
    problemas.push(`bin com ${String(binBuf.length)} bytes; esperado ${String(esperado)} (${String(chunks.length)} chunks x ${String(dimensions)}d)`);
  }
  for (let i = 0; i < chunks.length; i++) {
    const declarado = chunks[i] && typeof chunks[i].offset === "number" ? chunks[i].offset : null;
    const comprimento = chunks[i] && typeof chunks[i].length === "number" ? chunks[i].length : null;
    // offset/length do sidecar são em FLOATS (medido: offset/dim === i, length === dim).
    const canonico = i * dimensions;
    if (declarado !== canonico || comprimento !== dimensions) {
      problemas.push(`chunk #${String(i)} (${chunks[i] ? chunks[i].path : "?"}) offset/length=${String(declarado)}/${String(comprimento)}; canônico=${String(canonico)}/${String(dimensions)}`);
      if (problemas.length >= 6) break;
    }
  }
  return { ok: problemas.length === 0, problemas };
}

/**
 * Camada 2 — semântica amostral (embedFn injetável para teste): re-embutre o texto
 * das amostras e compare com o vetor armazenado no offset do chunk.
 */
async function verificarAlinhamento({ chunks, dimensions, binBuf, embedFn, n = 24, limiar = 0.9 }) {
  const idxs = selecionarAmostras(chunks.length, n);
  const novos = await embedFn(idxs.map((i) => chunks[i].content.slice(0, 7500)));
  const amostras = idxs.map((idx, j) => ({
    i: idx,
    path: chunks[idx].path,
    s: cosine(lerVetor(binBuf, chunks[idx].offset, dimensions), novos[j]),
  }));
  amostras.sort((a, b) => a.s - b.s);
  const ruins = amostras.filter((a) => a.s < limiar);
  return { ok: ruins.length === 0, amostras, ruins, limiar };
}

/** .env da raiz como fallback (dotenv vive só no backend) — nunca sobrescreve env. */
function carregarEnvLocal() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    for (const linha of txt.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // sem .env — a checagem de chave adiante decide (fail-closed)
  }
}

function parseArgs(argv) {
  const out = { amostra: 24, limiar: 0.9, soEstrutural: false, help: false, erro: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--so-estrutural") out.soEstrutural = true;
    else if (a === "--amostra") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1) out.erro = "--amostra exige inteiro >= 1";
      else out.amostra = v;
    } else if (a === "--limiar") {
      const v = Number(argv[++i]);
      if (!(v > 0 && v < 1)) out.erro = "--limiar exige numero em (0,1)";
      else out.limiar = v;
    } else out.erro = `argumento desconhecido: ${a}`;
  }
  return out;
}

function log(msg) {
  process.stdout.write(msg + "\n");
}

async function main(argv) {
  const args = parseArgs(argv === undefined ? process.argv.slice(2) : argv);
  if (args.help) {
    log("Uso: node scripts/verificar-alinhamento-vetorial.cjs [--amostra N] [--limiar X] [--so-estrutural]");
    log("  Exit: 0 alinhado | 1 desalinhado/falha estrutural | 2 uso invalido/indice ausente/sem chave (fail-closed)");
    return 0;
  }
  if (args.erro) {
    process.stderr.write(`🔴 verificar-alinhamento-vetorial — uso invalido: ${args.erro}\n`);
    return 2;
  }

  const jp = indexJsonPath();
  const bp = indexBinPath();
  if (!fs.existsSync(jp) || !fs.existsSync(bp)) {
    process.stderr.write(`🔴 verificar-alinhamento-vetorial — indice ausente (${jp} / ${bp}) — rode npm run indices (falha fechada)\n`);
    return 2;
  }
  const sidecar = JSON.parse(fs.readFileSync(jp, "utf8"));
  const binBuf = fs.readFileSync(bp);
  // Guarda LFS: pointer não materializado (checkout sem smudge) tem ~133 bytes e
  // não é drift — é estado de leitura (mesma família de erro refutada em
  // LILA-DEV/planejamento/hardening/backlog.md:251). Sai NÃO-VERIFICADO (exit 3).
  if (binBuf.length < 512 && binBuf.subarray(0, 22).toString("utf8") === "version https://git-lfs") {
    process.stderr.write("⚠️  verificar-alinhamento-vetorial — .bin é POINTER LFS não materializado (checkout sem smudge); estrutura NÃO-VERIFICADA (não é drift). Materialize o LFS e rode de novo.\n");
    return 3;
  }
  const chunks = Array.isArray(sidecar.chunks) ? sidecar.chunks : null;
  if (!chunks || !Number.isInteger(sidecar.dimensions)) {
    process.stderr.write("🔴 verificar-alinhamento-vetorial — sidecar fora do schema esperado (chunks[] + dimensions) — falha fechada\n");
    return 2;
  }

  // Camada 1 — estrutural (sempre roda; sem rede).
  const est = verificarEstrutural({ chunks, dimensions: sidecar.dimensions, binBuf });
  if (!est.ok) {
    process.stderr.write("🔴 verificar-alinhamento-vetorial — FALHA ESTRUTURAL (par sidecar↔bin desalinhado por construcao):\n");
    for (const p of est.problemas) process.stderr.write(`  - ${p}\n`);
    return 1;
  }
  log(`⚪ estrutural OK — ${String(chunks.length)} chunks x ${String(sidecar.dimensions)}d, offsets canônicos`);

  if (args.soEstrutural) {
    log("⚪ camada semantica NAO executada (--so-estrutural)");
    return 0;
  }

  // Camada 2 — semantica amostral (exige chave; fail-closed sem ela).
  carregarEnvLocal();
  if (!process.env.OPENROUTER_API_KEY) {
    process.stderr.write("🔴 verificar-alinhamento-vetorial — OPENROUTER_API_KEY ausente: semantica nao pode ser afirmada (use --so-estrutural para a camada 1 sozinha)\n");
    return 2;
  }
  const { embedBatch } = require("./lib/embedding-client.cjs");
  const res = await verificarAlinhamento({
    chunks,
    dimensions: sidecar.dimensions,
    binBuf,
    embedFn: (textos) => embedBatch(textos),
    n: args.amostra,
    limiar: args.limiar,
  });
  const pior = res.amostras[0];
  log(`⚪ semantica amostral — ${String(res.amostras.length)} amostras, pior cos ${pior.s.toFixed(4)} (${pior.path})`);
  if (res.ok) {
    log(`✅ ALINHADO — nenhuma amostra abaixo de ${String(args.limiar)}`);
    return 0;
  }
  process.stderr.write(`🔴 verificar-alinhamento-vetorial — DESALINHADO: ${String(res.ruins.length)}/${String(res.amostras.length)} amostras com cos < ${String(args.limiar)}\n`);
  for (const r of res.ruins) process.stderr.write(`  - cos ${r.s.toFixed(4)} #${String(r.i)} ${r.path}\n`);
  process.stderr.write("Par sidecar↔bin inconsistente (classe do incidente 2026-09-23): rebuild TOTAL (rm indice-vetorial.* && npm run indices) — RULE 6 do PROTOCOLO-INDICES.md\n");
  return 1;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      process.stderr.write(`🔴 verificar-alinhamento-vetorial — erro nao tratado: ${String(e)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { cosine, selecionarAmostras, lerVetor, verificarEstrutural, verificarAlinhamento, parseArgs, main };