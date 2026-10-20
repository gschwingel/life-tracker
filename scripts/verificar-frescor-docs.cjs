#!/usr/bin/env node
// scripts/verificar-frescor-docs.cjs
// FRAME-DOCS-MECANIZACAO-P0-20261002 (P1-F) + FRAME-DOCS-MECANIZACAO-P1a-20261002 (P1a):
// gate de frescor dos docs derivados -- itera TODOS os pares de
//   scripts/docs-pairs.registry.json (multi-par desde a P1a).
//   kind=module : regen em MEMORIA do modulo (scripts/injetar-einv-dev.cjs) comparado
//                 com o ARQUIVO INTEIRO comitado.
//   kind=block  : regen em MEMORIA do corpo do bloco comparado com a faixa delimitada
//                 pelos marcadores GENERATED no derivado comitado.
// Causas possiveis de stale: edicao manual do trecho gerado, ou fonte mudou sem regen.
// Acusacao por CONTEUDO (normaliza CRLF e espaco final -- artefato de checkout;
// precedente verificar-frescor-manifest/module-map).
// Uso: node scripts/verificar-frescor-docs.cjs [--json]
// exit 0 = fresco | exit 1 = stale | exit 2 = erro de execucao
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const inj = require("./injetar-einv-dev.cjs");
const ger = require("./gerar-docs-derivados.cjs");

const ROOT = inj.ROOT;
const norm = (t) => String(t).replace(/\r\n/g, "\n");
const fontes = (par) => (par.sources || []).map((s) => s.path_or_cmd);

/** Leitura tolerante: texto do arquivo ou null quando ausente. Pura. */
function lerTexto(abs) {
  try { return fs.readFileSync(abs, "utf8"); } catch { return null; }
}

/** Comparacao de arquivo inteiro (kind=module): null = fresco. Pura. */
function compararArquivo(rp, esperado) {
  const atual = lerTexto(path.join(ROOT, rp));
  if (atual === null) return { tipo: "ausente" };
  if (norm(atual) !== norm(esperado)) return { tipo: "stale", detalhe: "conteudo difere do regen (edicao manual OU fonte mudou sem regen)" };
  return null;
}

/** Nucleo puro: itera o registry e compara o regen (memoria) com o comitado. */
function comparar() {
  let pares;
  try { pares = ger.carregarRegistry(); } catch (e) { return { ok: false, erro: e.message, achados: [] }; }
  const achados = [];
  const erros = [];
  for (const par of pares) {
    try {
      if (par.kind === "module") {
        const g = inj.gerar();
        for (const d of par.derived_paths) {
          const rp = typeof d === "string" ? d : d.path;
          const chave = typeof d === "string" ? null : d.module_key;
          if (!chave || typeof g[chave] !== "string") {
            achados.push({ par: par.id, derivado: rp, tipo: "registry-invalido", detalhe: "module_key ausente/invalido no registry", fontes: fontes(par), regen: par.regen_cmd });
            continue;
          }
          const r = compararArquivo(rp, g[chave]);
          if (r) achados.push(Object.assign({ par: par.id, derivado: rp, fontes: fontes(par), regen: par.regen_cmd }, r));
        }
        continue;
      }
      const abs = path.join(ROOT, par.derived_path);
      const atual = lerTexto(abs);
      if (atual === null) { achados.push({ par: par.id, derivado: par.derived_path, tipo: "ausente", fontes: fontes(par), regen: par.regen_cmd }); continue; }
      for (const b of ger.blocosDe(par)) {
        const comum = { par: par.id, derivado: par.derived_path, bloco: b.key, fontes: fontes(par), regen: par.regen_cmd };
        const comitado = ger.extrairBloco(atual, b.begin, b.end);
        if (comitado === null) {
          achados.push(Object.assign({}, comum, { tipo: "marcador-ausente", detalhe: "faixa GENERATED ausente (marcador BEGIN/END removido?)" }));
          continue;
        }
        if (ger.normalizarBloco(comitado) !== ger.normalizarBloco(ger.renderBloco(par, b))) {
          achados.push(Object.assign({}, comum, { tipo: "stale", detalhe: "bloco GENERATED difere do regen (edicao manual OU fonte mudou sem regen)" }));
        }
      }
    } catch (e) {
      erros.push(par.id + ": " + e.message);
      achados.push({ par: par.id, derivado: par.derived_path || "", tipo: "erro-execucao", detalhe: e.message, fontes: fontes(par), regen: par.regen_cmd });
    }
  }
  if (erros.length) return { ok: false, erro: erros.join(" | "), pares: pares.length, achados };
  return { ok: achados.length === 0, pares: pares.length, achados };
}

function main() {
  const json = process.argv.includes("--json");
  const r = comparar();
  if (r.erro) { console.error("ERRO: " + r.erro); process.exit(2); }
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
  if (r.ok) { console.log("docs derivados: frescos (" + r.pares + " par(es) registrados == regen)"); process.exit(0); }
  for (const a of r.achados) {
    console.error("STALE [" + a.tipo + "] " + a.derivado + " (par " + a.par + ")" + (a.detalhe ? " — " + a.detalhe : ""));
    console.error("  fontes: " + a.fontes.join(" | "));
    console.error("  regen:  " + a.regen);
  }
  process.exit(1);
}

module.exports = { comparar, compararArquivo };
if (require.main === module) main();
