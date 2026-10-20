#!/usr/bin/env node
// scripts/gerar-manifest-esqueleto.cjs
// Gerador do AI-PROJECT-MANIFEST v3.0 (ESTADO-PURO POR CONSTRUCAO — evento deliberado
// MANIFEST-V3-ESTADO-PURO-N3 2026-09-08). Caminha a arvore real, gera as sessoes
// DERIVAVEIS, mescla com docs/manifest-fonte.yaml (fonte unica curada) e RENDERA
// docs/AI-PROJECT-MANIFEST.md completo.
// Deterministico: mesma arvore + mesma fonte = mesmo output byte-a-byte (LF normalizado;
// listas ordenadas; hash da arvore no rodape; `gerado:` derivado do ULTIMO COMMIT — sem
// relogio de parede, emenda A1 / PROTOCOLO-CANONICAL §7).
// Uso:
//   node scripts/gerar-manifest-esqueleto.cjs            # renderiza docs/AI-PROJECT-MANIFEST.md
//   node scripts/gerar-manifest-esqueleto.cjs --stdout   # imprime no stdout (sem escrever)
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const yaml = require("js-yaml");
const { execFileSync } = require("child_process");
const { lerExistente, textoIgualMascarado } = require("./lib/conteudo-estavel.cjs");

const ROOT = path.resolve(__dirname, "..");
const FONTE = path.join(ROOT, "docs", "manifest-fonte.yaml");
const OUT = path.join(ROOT, "docs", "AI-PROJECT-MANIFEST.md");

// Valor do `gerado:` no rodapé é o único byte volatil do render (mesma máscara
// do verificar-frescor-manifest: groups 1/3 são separadores, valor = grupo 2).
const RE_GERADO_VOLATIL = /(<!--\s*gerado:\s*)(\S+)(\s*\|)/;

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Timestamp de geração do rodapé do manifesto (emenda A1 — determinismo de timestamp).
 *
 * Defeito corrigido: o rodapé embutia `new Date()` (relógio de parede) — artefato que se
 * dizia determinístico mudava por relógio e violava "mesma árvore → mesmo byte a byte"
 * (PROTOCOLO-CANONICAL §7, emenda v1.1 — regen de derivados no PR da fonte).
 *
 * Correção: `gerado:` deriva do ÚLTIMO COMMIT da árvore (`git log -n 1 --format=%cI`,
 * data do committer em ISO-8601 estrito). Mesma árvore (mesmo HEAD) → mesmo valor, sem
 * relógio. Fallback: `hoje()` quando git está indisponível (execução fora de repo —
 * não quebra o render, apenas degrada para a data corrente).
 */
function geradoEm() {
  try {
    const out = execFileSync("git", ["--no-pager", "log", "-n", "1", "--format=%cI"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(out)) return out;
  } catch {
    /* git indisponível — degrada para data corrente */
  }
  return hoje();
}

/**
 * Normaliza o `last_update` da fonte para a forma CANÔNICA `YYYY-MM-DD`.
 *
 * Defeito corrigido (PATCH-DOCS-CHECK-LAST-UPDATE-20260910): o YAML entregava a
 * data como objeto `Date` (ex.: `last_update: 2026-09-08` sem aspas) e a
 * interpolação direta gravava `Date.toString()` no meta
 * ("Mon Sep 07 2026 21:00:00 GMT-0300 (...)"), formato que o `docs:check` NÃO
 * aceita (`last_update=YYYY-MM-DD`) — era a causa do `docs:check` vermelho
 * crônico na main. Valor não-data passa verbatim (nunca inventa data).
 */
function dataIso(valor) {
  if (valor === undefined || valor === null || valor === "") return hoje();
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? texto : d.toISOString().slice(0, 10);
}

// ── Utilidades ────────────────────────────────────────────────────────────────
function walk(dir, out = [], rel = "") {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    if (e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, path.join(rel, e.name));
    else out.push({ rel: path.join(rel, e.name), name: e.name });
  }
  return out;
}

// Hash da arvore: sha256 sobre a lista ordenada de caminhos relativos das raizes inventariadas.
function hashArvore(roots) {
  const files = [];
  for (const r of roots) {
    const abs = path.join(ROOT, r);
    if (!fs.existsSync(abs)) continue;
    walk(abs, files);
  }
  const h = crypto.createHash("sha256");
  for (const f of files.sort((a, b) => a.rel.localeCompare(b.rel))) h.update(f.rel.replace(/\\/g, "/") + "\n");
  return { hash: h.digest("hex").slice(0, 16), total: files.length };
}

const extRe = /\.(ts|tsx|cjs|js|mjs|json|css)$/;
function eList(dir) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.endsWith(".test.") && !e.name.endsWith(".spec.") && extRe.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

// Render de um mapa de arquivos com anotacoes da fonte: "  name | ref: X | purpose: Y | exports: Z".
function renderMap(dirPrefix, files, anotacoes) {
  const out = [];
  for (const name of files) {
    const key = dirPrefix + name;
    const a = (anotacoes && anotacoes[key]) || (anotacoes && anotacoes[dirPrefix + name.replace(/\.[^.]+$/, "")]) || null;
    if (!a) {
      out.push("  " + name);
      continue;
    }
    const bits = [];
    if (a.ref) bits.push("ref: " + a.ref);
    if (a.purpose) bits.push("purpose: " + a.purpose);
    if (a.exports) bits.push("exports: " + a.exports);
    if (a.note) bits.push("NOTE: " + a.note);
    out.push("  " + name + (bits.length ? " | " + bits.join(" | ") : ""));
  }
  return out.join("\n");
}

// ── Construtores derivados por secao ──────────────────────────────────────────
const anot = (fonte) => (fonte.anotacoes || {});

function sec3() {
  // DIRECTORY ARCHITECTURE: inventario por diretorio (arquivos de codigo/docs), raizes reais.
  const roots = [
    "src/", "src/components/", "src/components/chat/",
    "src/components/especialistas/",
    "src/components/ui/", "src/components/chat/blocks/",
    "src/hooks/", "src/lib/", "src/lib/markdown/",
    "src/pages/", "backend/src/services/", "backend/src/routes/",
    "backend/src/lib/", "backend/src/plugins/", "backend/src/db/", "backend/src/validation/",
    "scripts/", "scripts/lib/", "test/e2e/", "Method/",
    "tools/oae-runner-local/",
  ];
  const linhas = [];
  for (const dir of roots) {
    const files = eList(dir);
    if (!files.length) continue;
    linhas.push("  " + dir + " | " + files.join(" "));
  }
  const docsFiles = fs
    .readdirSync(path.join(ROOT, "docs"))
    .filter((f) => f.endsWith(".md"))
    .sort();
  linhas.push("  docs/ | " + docsFiles.join(" "));
  const srcDirs = fs
    .readdirSync(path.join(ROOT, "src"))
    .filter((e) => { try { return fs.statSync(path.join(ROOT, "src", e)).isDirectory() && e !== "__tests__"; } catch { return false; } })
    .sort();
  const backendDirs = fs
    .readdirSync(path.join(ROOT, "backend", "src"))
    .filter((e) => { try { return fs.statSync(path.join(ROOT, "backend", "src", e)).isDirectory(); } catch { return false; } })
    .sort();
  linhas.unshift("  src/ | " + srcDirs.join(" "));
  linhas.unshift("  backend/src/ | " + backendDirs.join(" "));
  return linhas.join("\n");
}

function sec4lib(fonte) {
  // src/lib: arquivos .ts (exclui *.test.ts co-localizados e __tests__) + subdir markdown/
  const files = eList("src/lib").filter((n) => !n.endsWith(".test.ts"));
  const linhas = [renderMap("src/lib/", files, anot(fonte))];
  const md = fs.readdirSync(path.join(ROOT, "src/lib/markdown")).filter((f) => f.endsWith(".ts")).sort();
  if (md.length) linhas.push("  markdown/ | " + md.join(" "));
  return linhas.filter((l) => l.length).join("\n");
}
function sec41(fonte) {
  return renderMap("backend/src/services/", eList("backend/src/services"), anot(fonte));
}
function sec42(fonte) {
  return renderMap("backend/src/routes/", eList("backend/src/routes"), anot(fonte));
}
function sec5(fonte) {
  return renderMap("src/hooks/", eList("src/hooks"), anot(fonte));
}
function sec6(fonte) {
  const grupos = [
    ["src/components/", "root"],
    ["src/components/chat/", "chat"],
    ["src/components/chat/blocks/", "chat/blocks"],
    ["src/components/especialistas/", "especialistas"],
    ["src/components/ui/", "ui"],
  ];
  const out = [];
  for (const [dir, label] of grupos) {
    const files = eList(dir);
    if (!files.length) continue;
    const body = renderMap(dir, files, anot(fonte));
    out.push("  " + label + ":");
    out.push("  " + body.split("\n").map((l) => l.trim()).join("\n  "));
  }
  return out.join("\n");
}
function sec7() {
  return renderMap("src/pages/", eList("src/pages"), {});
}
function sec8() {
  // TEST MAP: contagens de testes por diretorio (derivadas).
  const contadores = [
    ["src/__tests__/components/", "tsx"], ["src/__tests__/especialistas/", "tsx"],
    ["src/__tests__/hooks/", "tsx"], ["src/__tests__/pages/", "tsx"],
    ["src/__tests__/lib/", "ts"], ["src/lib/__tests__/", "ts"],
  ];
  const rows = [];
  const conta = (dir, ext) => {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) return 0;
    return fs.readdirSync(base).filter((f) => f.endsWith("." + ext) && /\.(test|spec)\./.test(f)).length;
  };
  for (const [dir, ext] of contadores) {
    const n = conta(dir, ext);
    if (n > 0) rows.push("  " + dir + " | " + n);
  }
  const libRoot = eList("src/lib").filter((f) => f.endsWith(".test.ts"));
  if (libRoot.length) rows.push("  src/lib/*.test.ts | " + libRoot.length + " (" + libRoot.map((f) => f.replace(".test.ts", "")).join(" ") + ")");
  const e2e = eList("test/e2e").filter((f) => f.endsWith(".spec.ts"));
  if (e2e.length) rows.push("  test/e2e/ | " + e2e.length + " specs (" + e2e.map((f) => f.replace(".spec.ts", "")).join(" ") + ")");
  const backRoot = (() => {
    const b = path.join(ROOT, "backend/src/__tests__");
    if (!fs.existsSync(b)) return 0;
    return fs.readdirSync(b).filter((f) => f.endsWith(".test.ts")).length;
  })();
  if (backRoot) rows.push("  backend/src/__tests__/ (raiz) | " + backRoot);
  return rows.join("\n");
}
function sec10(fonte) {
  // PERSISTENCE (HIBRIDA): chaves localStorage/IndexedDB derivadas por scan de uso em src/.
  const chaves = new Map();
  const scanDir = (dir) => {
    const files = walk(path.join(ROOT, dir), [], dir);
    for (const f of files) {
      if (!/\.(ts|tsx)$/.test(f.name) || /\.(test|spec)\./.test(f.name)) continue;
      const txt = fs.readFileSync(path.join(ROOT, f.rel), "utf8");
      for (const m of txt.matchAll(/["'`](lila_[a-z0-9_{}]+[a-z0-9_]*|lila-[\w-]+)["'`]/g)) {
        const k = m[1];
        if (!chaves.has(k)) chaves.set(k, f.rel);
      }
    }
  };
  scanDir("src");
  const linhas = [];
  const prefixo = (fonte.secoes.find((s) => s.numero === "10").corpo_prefixo || "").trim();
  for (const l of prefixo.split("\n")) linhas.push("  " + l);
  linhas.push("  chaves (derivadas por scan de src/):");
  for (const [k, rel] of [...chaves.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    linhas.push("  " + k + " | " + rel.replace(/\\/g, "/"));
  }
  return linhas.join("\n");
}


// ── Engine de render ──────────────────────────────────────────────────────────
const DERIVADORES = {
  "3": sec3,
  "4": sec4lib,
  "4.1": sec41,
  "4.2": sec42,
  "5": sec5,
  "6": sec6,
  "7": sec7,
  "8": sec8,
  "10": sec10,
};

function corpoSecao(sec, fonte) {
  if (sec.classificacao === "DERIVAVEL") {
    const fn = DERIVADORES[sec.numero];
    if (!fn) return "  (gerador: derivador ausente para secao " + sec.numero + ")";
    const corpo = fn(fonte);
    const pre = sec.nota_header ? ["  NOTE: " + sec.nota_header].join("\n") : "";
    return [pre, corpo].filter(Boolean).join("\n");
  }
  if (sec.classificacao === "HIBRIDA") {
    return sec10(fonte);
  }
  // CURADA: corpo literal da fonte.
  const corpo = (sec.corpo || "").replace(/\n$/, "");
  return corpo ? corpo.split("\n").map((l) => "  " + l).join("\n") : "  (secao curada pendente)";
}

function render(fonte) {
  const treeHash = hashArvore(["src", "backend/src", "docs", "scripts", "Method", "test"]);
  const header = [
    // AI-IAIA-GRAMMAR §2 (D-DIR-08): meta line é a LINHA 1 — título vem depois.
    "meta: format=AI-AI | audience=AI | human_readable=false | density=max | prose=0 | version=" + (fonte.meta.versao_manifesto || "3.0") +
      " | last_update=" + dataIso(fonte.meta.last_update) +
      " | status=APPROVED | path=docs/AI-PROJECT-MANIFEST.md | generated=true | fonte=docs/manifest-fonte.yaml",
    "# AI-PROJECT-MANIFEST — Lila C137",
    "authority:",
    "  A1 | precedence | AI-PROJECT-MANIFEST.md > docs/ on conflict",
    "  A2 | header_req | docs/ files MUST include Version, Last update, Status, Authority referencing A1",
    "  A3 | traceability | info without source code/snapshot/authority doc = no-lastro, remove or mark verify",
    "  A4 | generated | este arquivo e ARTEFATO GERADO por scripts/gerar-manifest-esqueleto.cjs | editar docs/manifest-fonte.yaml ou a arvore, nunca o .md a mao",
    "",
  ];
  const body = [];
  for (const sec of fonte.secoes) {
    body.push("#" + sec.numero + " " + sec.titulo.toUpperCase());
    body.push("");
    body.push(corpoSecao(sec, fonte));
    body.push("");
  }
  const footer = [
    "<!-- gerado: " + geradoEm() + " | arvore_hash: " + treeHash.hash + " | arquivos: " + treeHash.total + " | fonte: docs/manifest-fonte.yaml -->",
  ];
  if (fonte.meta && fonte.meta.checks) footer.push("<!-- " + fonte.meta.checks + " -->");
  return header.concat(body, footer).join("\n").replace(/\r\n/g, "\n") + "\n";
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function main() {
  const fonte = yaml.load(fs.readFileSync(FONTE, "utf8"));
  const md = render(fonte);
  if (process.argv.includes("--stdout")) {
    process.stdout.write(md);
    return;
  }
  // SKIP-WRITE (fim do churn de timestamp, drenagem 2026-10-06): idêntico módulo
  // o valor do `gerado:` (volátil — derivado do último commit, emenda A1) → não
  // reescreve; regen dupla em árvore imutável = diff zero. arvore_hash/arquivos
  // ficam FORA da máscara: mudança real de árvore (lista de paths) segue
  // reescrevendo. Política: scripts/lib/conteudo-estavel.cjs; o verificador de
  // frescor já mascara o mesmo campo (verificar-frescor-manifest RE_GERADO).
  const existente = lerExistente(OUT);
  if (textoIgualMascarado(md, existente, RE_GERADO_VOLATIL)) {
    const preservado = (String(existente).match(RE_GERADO_VOLATIL) || [])[2] || "?";
    console.log("manifest: skip (conteúdo idêntico; gerado: preservado " + preservado + ")");
    return;
  }
  fs.writeFileSync(OUT, md, "utf8");
  console.log("manifest v3.0 renderizado: docs/AI-PROJECT-MANIFEST.md (" + md.split("\n").length + " linhas)");
}
if (require.main === module) main();
module.exports = { render, corpoSecao, DERIVADORES, sec3, sec4lib, sec41, sec42, sec5, sec6, sec7, sec8, sec10, renderMap, hashArvore, eList, walk, dataIso, geradoEm };

