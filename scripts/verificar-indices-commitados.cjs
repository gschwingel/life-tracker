#!/usr/bin/env node
/**
 * verificar-indices-commitados.cjs — gate de conteúdo dos índices (CI).
 *
 * Para cada índice determinístico vivo (rastreabilidade): compara o
 * arquivo COMMITADO (git show HEAD:<path>) contra o arquivo WORKING TREE
 * (recém-regenerado pelo CI), APÓS remover os campos de timestamp (geradoEm/
 * generatedAt) — que diferem a cada geração por natureza.
 *
 * Conteúdo normalizado idêntico → índices commitados frescos (exit 0).
 * Divergente → os commitados estavam stale (exit 1, lista os afetados).
 *
 * Env: LILA_INDICES_COMMITADOS (lista separada por vírgulas, opcional).
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const INDICES = (process.env.LILA_INDICES_COMMITADOS ||
  "LILA-DEV/indice-rastreabilidade.json")
  .split(",").map((s) => s.trim());

const CAMPOS_TIMESTAMP = ["geradoEm", "generatedAt"];

function semTimestamps(conteudo) {
  const obj = JSON.parse(conteudo);
  for (const campo of CAMPOS_TIMESTAMP) delete obj[campo];
  return JSON.stringify(obj, null, 2);
}

function main() {
  const stale = [];
  for (const rel of INDICES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) { stale.push({ rel, motivo: "ausente no working tree" }); continue; }
    let commitado;
    try {
      commitado = execFileSync("git", ["show", "HEAD:" + rel.replace(/\\/g, "/")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch {
      stale.push({ rel, motivo: "não existe no HEAD (arquivo novo não commitado)" });
      continue;
    }
    const a = semTimestamps(commitado);
    const b = semTimestamps(fs.readFileSync(abs, "utf8"));
    if (a !== b) stale.push({ rel, motivo: "conteúdo diverge do HEAD (além de timestamps)" });
  }

  console.log("=== verificar-indices-commitados (conteúdo normalizado, sem timestamps) ===");
  if (stale.length === 0) {
    console.log("OK — índices commitados conferem com a regeneração.");
    process.exitCode = 0;
  } else {
    for (const s of stale) console.log("STALE  | " + s.rel + " | " + s.motivo);
    console.log("Exit 1 — rode `npm run indices` local e commite os índices regenerados.");
    process.exitCode = 1;
  }
}

main();
