#!/usr/bin/env node
// scripts/injetar-einv-dev.cjs
// FRAME-DOCS-MECANIZACAO-P0-20261002 — injetor fonte->derivados (P0.1).
// FONTE UNICA (normativa, nunca editavel por este script):
//   src/prompts/Canonical/FDV-E.md §4 [normative schema]
// DERIVADOS (mirrors; NAO editar a mao):
//   - .clinerules (bloco E-INV-DEV)
//   - LILA-DEV/README-DEV-AI.md (§5 — lista E-INV; a tabela DEV-INV permanece curada)
// VERBATIM (P1-A=(b)): o bloco gerado e o corpo da §4 byte a byte — zero parafrase,
//   zero recorte (recorte = softening = E-INV-07, rejeitado).
// DETERMINISTICO: sem timestamp => paridade byte a byte (gate verificar-frescor-docs.cjs).
// Uso: node scripts/injetar-einv-dev.cjs [--dry-run|--check]
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FONTE = path.join(ROOT, "src", "prompts", "Canonical", "FDV-E.md");
const CLINERULES = path.join(ROOT, ".clinerules");
const README = path.join(ROOT, "LILA-DEV", "README-DEV-AI.md");

const BEGIN = "<!-- E-INV-DEV:GERADO:BEGIN (fonte: src/prompts/Canonical/FDV-E.md §4 [normative schema] — NAO EDITAR A MAO) -->";
const END = "<!-- E-INV-DEV:GERADO:END -->";
const HEADER_CLINERULES = "E-INV-DEV (derived mirror — FONTE UNICA: src/prompts/Canonical/FDV-E.md §4 [normative schema]; NAO EDITAR A MAO; FDV-DEV/EXEC/PATCH apontam para a fonte):";

const RE_SEC4 = /^## 4\. EPISTEMOLOGICAL INVARIANTS \(E-INV\)/;
const RE_H2 = /^## /;
const RE_EINV_ROW = /^\| E-INV-/;

const norm = (t) => String(t).replace(/\r\n/g, "\n");
const linhas = (t) => norm(t).split("\n");

/** Corpo verbatim da §4 (E-INV-01..18), sem heading, sem '---' final. Pura. */
function extrairCorpoFonte(texto) {
  const L = linhas(texto);
  const i = L.findIndex((l) => RE_SEC4.test(l));
  if (i < 0) throw new Error("§4 (E-INV) nao encontrada na fonte");
  let j = i + 1;
  while (j < L.length && !RE_H2.test(L[j])) j++;
  let corpo = L.slice(i + 1, j);
  while (corpo.length && corpo[corpo.length - 1].trim() === "") corpo.pop();
  if (corpo.length && corpo[corpo.length - 1].trim() === "---") corpo.pop();
  while (corpo.length && corpo[corpo.length - 1].trim() === "") corpo.pop();
  while (corpo.length && corpo[0].trim() === "") corpo.shift();
  const n = corpo.filter((l) => /^\*\*E-INV-\d\d/.test(l)).length;
  if (n !== 18) throw new Error("§4 nao contem 18 E-INV (achei " + n + ")");
  return corpo.join("\n");
}

const bloco = (corpo) => [BEGIN, corpo, END].join("\n");

/** `.clinerules`: substitui o bloco E-INV-DEV inteiro pelo mirror gerado. Pura. */
function renderClineRules(texto, corpo) {
  if (texto == null) throw new Error(".clinerules ausente");
  const L = linhas(texto);
  const i = L.findIndex((l) => /^E-INV-DEV \(/.test(l));
  if (i < 0) throw new Error("bloco E-INV-DEV nao encontrado em .clinerules");
  let j = i + 1;
  while (j < L.length && !/^P1-DEV \(/.test(L[j])) j++;
  if (j >= L.length) throw new Error("fim do bloco E-INV-DEV (P1-DEV) nao encontrado");
  const novo = [HEADER_CLINERULES, bloco(corpo), ""];
  return L.slice(0, i).concat(novo, L.slice(j)).join("\n");
}

/** README §5: lista E-INV gerada; linhas da tabela DEV-INV preservadas. Pura. */
function renderReadme(texto, corpo) {
  if (texto == null) throw new Error("README-DEV-AI ausente");
  const L = linhas(texto);
  const i = L.findIndex((l) => /^## 5\. INVARIANTES TRANSVERSAIS/.test(l));
  if (i < 0) throw new Error("§5 (INVARIANTES TRANSVERSAIS) nao encontrada em README-DEV-AI");
  let j = i + 1;
  while (j < L.length && !RE_H2.test(L[j])) j++;
  // idempotencia: remove qualquer bloco gerado previo (BEGIN..END) antes de reinjetar
  const semBloco = [];
  let dentro = false;
  for (const l of L.slice(i + 1, j)) {
    if (l === BEGIN) { dentro = true; continue; }
    if (l === END) { dentro = false; continue; }
    if (!dentro) semBloco.push(l);
  }
  const miolo = semBloco.filter((l) => !RE_EINV_ROW.test(l));
  while (miolo.length && miolo[miolo.length - 1].trim() === "") miolo.pop();
  while (miolo.length && miolo[0].trim() === "") miolo.shift();
  return L.slice(0, i + 1).concat(["", bloco(corpo), ""], miolo, [""], L.slice(j)).join("\n");
}

function gerar() {
  const corpo = extrairCorpoFonte(fs.readFileSync(FONTE, "utf8"));
  return { corpo, clinerules: renderClineRules(fs.readFileSync(CLINERULES, "utf8"), corpo), readme: renderReadme(fs.readFileSync(README, "utf8"), corpo) };
}

function main() {
  const modo = process.argv[2] || "";
  let g;
  try { g = gerar(); } catch (e) { console.error("ERRO: " + e.message); process.exit(2); }
  const alvos = [[CLINERULES, g.clinerules], [README, g.readme]];
  if (modo === "--dry-run") {
    console.log("=== BLOCO GERADO (verbatim §4, " + g.corpo.split("\n").length + " linhas) ===");
    console.log(g.corpo);
    for (const [p, c] of alvos) {
      const atual = norm(fs.readFileSync(p, "utf8"));
      console.log("[" + (atual === c ? "fresco" : "MUDARIA") + "] " + path.relative(ROOT, p));
    }
    return;
  }
  let stale = 0;
  for (const [p, c] of alvos) {
    const atual = norm(fs.readFileSync(p, "utf8"));
    if (atual === c) continue;
    stale++;
    if (modo === "--check") console.error("STALE: " + path.relative(ROOT, p));
    else { fs.writeFileSync(p, c); console.log("escrito: " + path.relative(ROOT, p)); }
  }
  if (modo === "--check") { console.log(stale === 0 ? "fresco" : stale + " derivado(s) stale"); process.exit(stale === 0 ? 0 : 1); }
}

module.exports = { extrairCorpoFonte, renderClineRules, renderReadme, gerar, BEGIN, END, FONTE, CLINERULES, README, ROOT };
if (require.main === module) main();
