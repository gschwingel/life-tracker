#!/usr/bin/env node
// scripts/gerar-module-map.cjs
// WO-2026-09-30-TOOLCONFUSION — ITEM B3: MAPA DE MÓDULOS gerado (nunca mantido à mão).
//
// PROBLEMA MEDIDO (sessão de produção 2026-09-30): o operador afirmou que
// `backend/src/lib/memory-tools.ts` existia — o arquivo NÃO existe (as tools de
// memória vivem em `backend/src/services/memory-tools.ts`). O caminho foi
// reconstruído por convenção de nome: plausibilidade confundida com conhecimento.
// Nada no contexto do modelo dava um mapa aterrado da árvore.
//
// ESTE SCRIPT GERA ESSE MAPA. Determinístico e idempotente: a mesma árvore produz
// byte a byte o mesmo artefato; rodar duas vezes não muda nada.
//
// CONTRATO
// - Cobertura declarada: TODOS os arquivos sob `backend/src/**` (a árvore do
//   backend — a superfície onde o erro de path aconteceu).
// - Agrupamento por diretório; `tools:` marca os arquivos de REGISTRO DE TOOLS,
//   derivados MECANICAMENTE do conteúdo (nunca lista hardcoded):
//     `export const <NOME>_TOOLS` (definições expostas ao modelo) ou
//     `export const TOOL_RISK` (registry canônico de risco, D1).
// - SIZING GUARD (cap 150 linhas, default DECLARADO): no cabo do cap o mapa NÃO
//   lista paths individuais — emite CONTAGEM POR DIRETÓRIO + marcador explícito
//   `TRUNCATED` com o total (truncamento silencioso é proibido).
// - Sem timestamp: o artefato carrega contagem + hash da árvore, então o conteúdo
//   é função pura da árvore (freshness comparável byte a byte pelo verificador —
//   mesmo princípio do manifesto v3.0).
//
// Uso:
//   node scripts/gerar-module-map.cjs              # escreve o artefato
//   node scripts/gerar-module-map.cjs --dry-run    # só imprime (não escreve)
//   node scripts/gerar-module-map.cjs --out <path> # destino alternativo (testes)
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const ALVO = "backend/src";
const OUT_DEFAULT = path.join(ROOT, "backend", "src", "lib", "module-map.generated.ts");
const CAP_LINHAS = 150;

/** Regex mecânica de registro de tools (derivada do conteúdo, jamais de lista). */
const RE_REGISTRO_TOOLS = /export const (?:[A-Z0-9_]*_TOOLS|TOOL_RISK)\b/;

/** Lista recursivamente os arquivos sob `dir` (paths absolutos). */
function listarArquivos(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listarArquivos(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

/** Diretório do path relativo ("" para a raiz de backend/src), separador "/". */
function dirDe(rel) {
  const d = path.posix.dirname(rel);
  return d === "." ? "" : d;
}

/** Agrupa os paths por diretório, com contagem e flags de registro de tools. */
function agrupar(entradas) {
  const mapa = new Map();
  for (const e of entradas) {
    const dir = dirDe(e.rel);
    const atual = mapa.get(dir) ?? { dir, total: 0, tools: [] };
    atual.total += 1;
    if (e.tools) atual.tools.push(path.posix.basename(e.rel));
    mapa.set(dir, atual);
  }
  return [...mapa.values()].sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/**
 * NÚCLEO PURO: monta as linhas do mapa a partir da árvore medida.
 *
 * Modo PER-PATH (cabe no cap): cabeçalho do diretório + uma linha por arquivo.
 * Modo CONTAGEM (estoura o cap): uma linha por diretório + marcador TRUNCATED
 * explícito com o total medido.
 */
function montarMapa(entradas, cap = CAP_LINHAS) {
  const grupos = agrupar(entradas);
  const totalPaths = entradas.length;

  const perPath = [];
  for (const g of grupos) {
    perPath.push(g.dir === "" ? `${ALVO}/` : `${ALVO}/${g.dir}/`);
    const doDir = entradas.filter((x) => dirDe(x.rel) === g.dir).sort((a, b) => (a.rel < b.rel ? -1 : 1));
    for (const e of doDir) {
      perPath.push(`  ${path.posix.basename(e.rel)}${e.tools ? " [tools]" : ""}`);
    }
  }

  if (perPath.length <= cap) {
    return { modo: "per-path", linhas: perPath, truncado: false, totalPaths, totalDirs: grupos.length };
  }

  const linhas = grupos.map((g) => {
    const rotulo = g.dir === "" ? `${ALVO}/` : `${ALVO}/${g.dir}/`;
    const tools = g.tools.length > 0 ? ` | tools: ${[...g.tools].sort().join(" ")}` : "";
    return `${rotulo} — ${String(g.total)} arquivos${tools}`;
  });
  linhas.push(
    `TRUNCATED — ${String(totalPaths)} paths em ${String(grupos.length)} diretorios: nenhum path individual listado (cap ${String(cap)} linhas). Use github_list_directory("${ALVO}/<dir>") para o conteudo de um diretorio.`,
  );
  return { modo: "contagem", linhas, truncado: true, totalPaths, totalDirs: grupos.length };
}

/** Hash curto da árvore (paths + flags), determinístico. */
function hashArvore(entradas) {
  const canonico = entradas
    .map((e) => `${e.rel}${e.tools ? "\tT" : ""}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonico, "utf8").digest("hex").slice(0, 12);
}

/** Renderiza o módulo TS gerado (escapando crase e ${ defensivamente). */
function renderArtefato(mapa, arvoreHash) {
  const corpo = mapa.linhas.join("\n").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  const cabecalho = [
    "// GERADO — NAO EDITAR A MAO.",
    "// Fonte: scripts/gerar-module-map.cjs (WO-2026-09-30-TOOLCONFUSION, item B3).",
    `// Arvore: ${String(mapa.totalPaths)} arquivos em ${String(mapa.totalDirs)} diretorios de ${ALVO}/** | hash ${arvoreHash}`,
    `// Modo: ${mapa.modo}${mapa.truncado ? " (cap de linhas estourado — TRUNCATED explicito)" : ""}`,
    "// Injetado no system prompt por backend/src/lib/buildSystemPrompt.ts.",
    "",
    "export const MODULE_MAP_TEXT = `",
  ].join("\n");
  return `${cabecalho}\n${corpo}\n\`;\n`;
}

/** Mede a árvore real e devolve as entradas do núcleo puro.
 *
 * EXCLUSAO DECLARADA: o proprio artefato gerado nao entra na contagem. Sem isso o
 * mapa dependeria de si mesmo (1a geracao: N arquivos; 2a: N+1) e deixaria de ser
 * idempotente. Caminho derivado de OUT_DEFAULT (nunca hardcoded).
 */
function medirArvore(rootDir = path.join(ROOT, ALVO)) {
  const selfRel = path.relative(path.join(ROOT, ALVO), OUT_DEFAULT).split(path.sep).join("/");
  return listarArquivos(rootDir)
    .map((p) => {
      const rel = path.relative(rootDir, p).split(path.sep).join("/");
      if (rel === selfRel) return null;
      let tools;
      try {
        tools = RE_REGISTRO_TOOLS.test(fs.readFileSync(p, "utf8"));
      } catch {
        tools = false;
      }
      return { rel, tools };
    })
    .filter((e) => e !== null)
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/** Gera (ou só imprime) o artefato. Retorna o texto gerado. */
function gerar({ outPath = OUT_DEFAULT, dryRun = false, rootDir } = {}) {
  const entradas = medirArvore(rootDir);
  const mapa = montarMapa(entradas);
  const texto = renderArtefato(mapa, hashArvore(entradas));
  if (!dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, texto);
  }
  console.log(
    `[gerar-module-map] ${mapa.modo}: ${String(mapa.totalPaths)} arquivos / ${String(mapa.totalDirs)} diretorios / ${String(mapa.linhas.length)} linhas → ${dryRun ? "(dry-run)" : outPath}`,
  );
  return texto;
}

module.exports = {
  ALVO,
  CAP_LINHAS,
  OUT_DEFAULT,
  RE_REGISTRO_TOOLS,
  listarArquivos,
  agrupar,
  montarMapa,
  hashArvore,
  renderArtefato,
  medirArvore,
  gerar,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  gerar({
    dryRun: argv.includes("--dry-run"),
    outPath: outIdx === -1 ? OUT_DEFAULT : path.resolve(argv[outIdx + 1]),
  });
}

