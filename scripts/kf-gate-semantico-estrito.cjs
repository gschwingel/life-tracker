#!/usr/bin/env node
// scripts/kf-gate-semantico-estrito.cjs — guard estrito do gate semantico (FDV-PLAN v7.1 §5).
// Carrega o hook (verdict versionado + doc_hash) sobre os KFs compilados e sai 1 se algum KF nao
// estiver com 6/6 verde: fail, bloqueado (sem veredito/stale) ou indisponivel REPROVAM.
// READ-ONLY. Uso: node scripts/kf-gate-semantico-estrito.cjs [--kfs <dir>]
"use strict";

const fs = require("fs");
const path = require("path");
const hook = require("./kf-gate-semantico-hook.cjs");

function main() {
  const argv = process.argv.slice(2);
  let dir = path.resolve(__dirname, "..", "LILA-DEV/kfs");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--kfs") dir = argv[++i];
    else throw new Error("argumento desconhecido: " + argv[i]);
  }
  const kfs = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({
    slug: f.replace(/\.md$/, "").toUpperCase(),
    arquivo: f,
    doc: fs.readFileSync(path.join(dir, f), "utf8"),
  }));
  const v = hook.verificar({ kfs });
  process.stdout.write(JSON.stringify({ pass: v.pass, status_geral: v.status_geral, resumo: v.resumo, nota: v.nota }, null, 2) + "\n");
  return v.pass ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, erro: e.message }, null, 2) + "\n");
    process.exit(2);
  }
}

module.exports = { main };
