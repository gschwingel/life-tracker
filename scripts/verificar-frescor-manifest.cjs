#!/usr/bin/env node
// scripts/verificar-frescor-manifest.cjs
// Validador de frescor do AI-PROJECT-MANIFEST v3.0 (N1 do MANIFEST-V3-ESTADO-PURO-N3).
// Re-renderiza o manifesto a partir da arvore real + docs/manifest-fonte.yaml (via
// scripts/gerar-manifest-esqueleto.cjs) e compara com o commitado.
// Divergencia = exit 1 + relatorio JSON (secao, tipo: ghost | omissao | contagem | conteudo).
// Este script e o N1 (deteccao de drift) e alimenta o N2 (gate de PR).
// Uso: node scripts/verificar-frescor-manifest.cjs
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const gerador = require("./gerar-manifest-esqueleto.cjs");

const ROOT = path.resolve(__dirname, "..");
const FONTE = path.join(ROOT, "docs", "manifest-fonte.yaml");
const MANIFEST = path.join(ROOT, "docs", "AI-PROJECT-MANIFEST.md");

// ── Núcleo puro (testável) ────────────────────────────────────────────────────
// Timestamp volátil do rodapé (`<!-- gerado: <ISO> | ... -->`): derivado do último commit
// da árvore (emenda A1 — determinismo de timestamp; PROTOCOLO-CANONICAL §7), muda a cada
// commit e NÃO é conteúdo do manifesto. Este gate compara CONTEÚDO: normaliza só o valor
// do timestamp e preserva o resto da linha (arvore_hash, contagem de arquivos, fonte) como
// conteúdo comparável — drift real de árvore continua sendo detectado.
const RE_GERADO = /(<!--\s*gerado:\s*)(\S+)(\s*\|)/g;

function normalizaVolatil(texto) {
  return texto.replace(RE_GERADO, "$1<volatil>$3");
}

// Quebra um manifesto em secoes { numero, titulo, linhas:Map<linha,count> }.
function buildSections(texto) {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const secoes = [];
  let atual = null;
  for (const l of linhas) {
    const m = l.match(/^#(\d+(?:\.\d+)?)\s+(.*)$/);
    if (m) {
      if (atual) secoes.push(atual);
      atual = { numero: m[1], titulo: m[2], linhas: new Map() };
      continue;
    }
    if (atual) atual.linhas.set(l, (atual.linhas.get(l) || 0) + 1);
  }
  if (atual) secoes.push(atual);
  return secoes;
}

const SECOES_MAPA = new Set(["4", "4.1", "4.2", "5", "6"]);
const nomeArquivo = (linha) => {
  const m = linha.match(/^\s+([A-Za-z0-9_.-]+(?:\.[A-Za-z0-9]+)?)(?:\s+\||$)/);
  return m ? m[1] : null;
};

// Compara duas versoes. Retorna array de achados { secao, tipo, caminho, detalhe }.
function compara(aTexto, bTexto) {
  const a = buildSections(normalizaVolatil(aTexto));
  const b = buildSections(normalizaVolatil(bTexto));
  const achados = [];
  const byNum = (arr) => new Map(arr.map((s) => [s.numero, s]));
  const mA = byNum(a);
  const mB = byNum(b);
  const numeros = new Set([...mA.keys(), ...mB.keys()]);
  for (const num of [...numeros].sort()) {
    const sa = mA.get(num);
    const sb = mB.get(num);
    if (!sa) { achados.push({ secao: num, tipo: "omissao", caminho: "(secao inteira)", detalhe: "secao presente apenas no recém-renderizado" }); continue; }
    if (!sb) { achados.push({ secao: num, tipo: "ghost", caminho: "(secao inteira)", detalhe: "secao presente apenas no commitado" }); continue; }
    const ehMapa = SECOES_MAPA.has(num);
    // Por caminho: reune linhas presentes so em um lado
    const soA = new Map(); // caminho -> [linhas]
    const soB = new Map();
    const todas = new Set([...sa.linhas.keys(), ...sb.linhas.keys()]);
    for (const l of todas) {
      const ca = sa.linhas.get(l) || 0;
      const cb = sb.linhas.get(l) || 0;
      if (ca === cb) continue;
      let key;
      if (ehMapa) key = nomeArquivo(l) || l;
      else if (num === "8") key = l.split("|")[0].trim() || l;
      else key = l;
      if (ca > cb) (soA.get(key) || soA.set(key, []).get(key)).push(l);
      else (soB.get(key) || soB.set(key, []).get(key)).push(l);
    }
    for (const key of new Set([...soA.keys(), ...soB.keys()])) {
      const del = soA.get(key) || [];
      const add = soB.get(key) || [];
      if (del.length && add.length) {
        achados.push({ secao: num, tipo: num === "8" ? "contagem" : "conteudo", caminho: key, detalhe: "linha alterada: " + (add[0] || del[0]).slice(0, 140) });
      } else if (del.length) {
        achados.push({ secao: num, tipo: "ghost", caminho: key, detalhe: "presente no commitado, ausente no render: " + del[0].slice(0, 140) });
      } else {
        achados.push({ secao: num, tipo: "omissao", caminho: key, detalhe: "presente no render, ausente no commitado: " + add[0].slice(0, 140) });
      }
    }
  }
  return achados;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(MANIFEST)) {
    process.stderr.write("AI-PROJECT-MANIFEST.md nao encontrado\n");
    process.exit(1);
  }
  const fonte = yaml.load(fs.readFileSync(FONTE, "utf8"));
  const fresco = gerador.render(fonte);
  const commitado = fs.readFileSync(MANIFEST, "utf8").replace(/\r\n/g, "\n") + (fresco.endsWith("\n") ? "" : "\n");
  const achados = compara(commitado, fresco);
  const ok = achados.length === 0;
  const rel = {
    ok,
    comando: "node scripts/verificar-frescor-manifest.cjs",
    escopo: ["src", "backend/src", "docs/AI-PROJECT-MANIFEST.md", "docs/manifest-fonte.yaml"],
    exitCode: ok ? 0 : 1,
    achados,
  };
  process.stdout.write(JSON.stringify(rel, null, 2) + "\n");
  process.exit(ok ? 0 : 1);
}
if (require.main === module) main();
module.exports = { buildSections, compara, normalizaVolatil };
