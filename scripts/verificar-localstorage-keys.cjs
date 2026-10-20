#!/usr/bin/env node
// scripts/verificar-localstorage-keys.cjs
/**
 * Proposito: gate de HIGIENE do inventario de storage do front — compara as
 * chaves lila* usadas em string literals do codigo (src/ + test/) contra o
 * inventario canonico docs/LOCALSTORAGE-KEYS.md.
 *
 * Motivo (PATCH-STORAGE-KEYS-GATE-20260910): o inventario v1.3 carregava
 * entradas FANTASMAS que nunca existiram no runtime (lila_snapshots,
 * lila_sidebar_collapsed, ...) e era reconstruido a mao a cada frame. A partir
 * daqui o documento e verificado por ferramenta, nas duas direcoes:
 *   1) chave usada no codigo e ausente do documento  -> 🔴 nao documentada
 *   2) chave de PRODUCAO documentada e ausente do codigo -> 🔴 fantasma
 *
 * Entrada: docs/LOCALSTORAGE-KEYS.md + diretorios de codigo (default src, test)
 *   env LOCALSTORAGE_KEYS_DOC  -> caminho alternativo do documento (testes)
 *   env LOCALSTORAGE_KEYS_SRC  -> dirs separados por virgula (testes)
 * Saida:   relatorio legivel (default) | JSON (--json) + exit code
 * Exit:    0 = inventario e codigo coerentes | 1 = divergencia (gate vermelho)
 * Flags:
 *   --doc <arquivo>   documento alternativo
 *   --src <a,b>       diretorios de codigo (default: src,test)
 *   --json            saida JSON parseavel
 *   --verbose         lista tambem os tokens/chaves casados
 *   --help            ajuda
 *
 * REGRAS DE CASAMENTO (deterministicas, sem AST):
 *   - `{...}` no documento vira wildcard `*` (ex.: lila-attachments-{executor|governor}
 *     -> lila-attachments-*).
 *   - `lila_x_${chat}` no codigo vira glob `lila_x_*`.
 *   - Constante de prefixo (ex.: const LS_KEY_PREFIX = "lila-attachments" usado como
 *     `${LS_KEY_PREFIX}-${chat}`) casa com o padrao documentado que COMECA com ela.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_DOC = path.join(REPO_ROOT, "docs", "LOCALSTORAGE-KEYS.md");
const DEFAULT_SRC = ["src", "test"];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".vite"]);

/** Token de chave lila: comeca com lila- ou lila_ e segue [A-Za-z0-9_-]. */
const KEY_RE = /lila[-_][A-Za-z0-9_-]*/g;
/** Literal de string: aspas simples, duplas ou template. */
const LITERAL_RE = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

/** Normaliza uma chave/padrao: `{qualquer}` -> `*`, colapsa `**` em `*`. */
function normalize(raw) {
  return String(raw).replace(/\{[^}]*\}/g, "*").replace(/\*+/g, "*");
}

/**
 * Prefixo declarado em constantes (ex.: `const LS_KEY_PREFIX = "lila-attachments"`
 * usado como `${LS_KEY_PREFIX}-${chat}`): sufixo `-`/`_` vira wildcard para casar
 * com o padrao documentado que comeca por ele.
 */
function comPrefixoAberta(token) {
  return /[-_]$/.test(token) ? token + "*" : token;
}

/** Converte glob (so `*`) em RegExp de casamento integral. */
function globToRe(glob) {
  const marked = normalize(glob).replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? "\u0000" : "\\" + c));
  return new RegExp("^" + marked.split("\u0000").join(".*") + "$");
}

/** Um token de codigo casa com um padrao documentado? (deterministico) */
function casa(codeToken, docPattern) {
  const c = normalize(codeToken);
  const d = normalize(docPattern);

  // Padrao documentado COM curinga (`lila_x_{a|b}` -> `lila_x_*`): pode casar o
  // token concreto do codigo OU uma constante de prefixo usada com concatenacao.
  if (d.includes("*")) {
    if (globToRe(d).test(c)) return true;
    if (!c.includes("*") && d.startsWith(c)) return true;
    return false;
  }

  // Padrao concreto: so casa token concreto IDENTICO (token com curinga nao
  // "cobre" uma chave concreta — evita falso-negativo por prefixo acidental).
  return c === d;
}

/**
 * Extrai tokens de chave dos string literals de um conteudo de arquivo.
 * Devolve [{ token, dynamic }] — `dynamic` = havia `${...}` imediatamente apos.
 */
function extraiTokens(conteudo) {
  const achados = [];
  for (const lit of conteudo.matchAll(LITERAL_RE)) {
    const body = lit[2];
    const base = lit.index + 1; // posicao do corpo dentro do arquivo
    for (const k of body.matchAll(KEY_RE)) {
      const end = k.index + k[0].length;
      // `${...}` imediatamente apos o token -> sufixo dinamico. O separador
      // (`-`/`_`) e PRESERVADO: o doc registra `lila_x_{a|b}` -> `lila_x_*`.
      const restante = body.slice(end);
      const dynamic = restante.startsWith("${") || /^[-_]?\$\{/.test(restante);
      const tokenRaw = dynamic ? k[0] + "*" : k[0];
      achados.push({ token: normalize(tokenRaw), dynamic, linha: linhaDe(conteudo, base + k.index) });
    }
  }
  return achados;
}

/** Numero da linha (1-based) de um offset no conteudo. */
function linhaDe(conteudo, offset) {
  let linha = 1;
  for (let i = 0; i < offset && i < conteudo.length; i++) if (conteudo[i] === "\n") linha++;
  return linha;
}

/** Varre os diretorios de codigo e devolve [{ arquivo, token, dynamic, linha }]. */
function scanSources(raizes, repoRoot) {
  const out = [];
  const visitar = (dir) => {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // diretorio inexistente (ex.: test/ em clones parciais)
    }
    for (const e of entradas) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) visitar(p);
        continue;
      }
      if (!CODE_EXT.has(path.extname(e.name))) continue;
      const conteudo = fs.readFileSync(p, "utf8");
      for (const t of extraiTokens(conteudo)) {
        out.push({ ...t, arquivo: path.relative(repoRoot, p).split(path.sep).join("/") });
      }
    }
  };
  for (const r of raizes) visitar(path.isAbsolute(r) ? r : path.join(repoRoot, r));
  return out;
}

/** Parseia o documento: producao (exigida no codigo) + universo (qualquer chave citada) + excecoes. */
function parseDoc(md) {
  const producao = [];
  const universo = new Set();
  const excecoes = [];
  let secao = "";
  for (const linha of md.split(/\r?\n/)) {
    const h = /^#{2,3}\s+(.*)$/.exec(linha);
    if (h) secao = h[1];
    const ehProducao = /Keys de Produ/i.test(secao);
    const ehExcecoes = /Exce..es do gate/i.test(secao);

    // Universo/excecoes partem do texto do span entre backticks JA normalizado
    // ({a|b} -> *, `\|` -> |) para que `lila_x_{a|b}` vire `lila_x_*`.
    // Mencoes ao PREFIXO puro (`lila-`, `lila_` em prosa) NAO entram: virariam
    // curinga global e anulariam a direcao A do gate.
    for (const bt of linha.matchAll(/`([^`]+)`/g)) {
      const texto = normalize(bt[1].replace(/\\\|/g, "|"));
      for (const m of texto.matchAll(KEY_RE)) {
        if (!/^lila[-_].+/.test(m[0])) continue;
        const token = normalize(comPrefixoAberta(m[0]));
        if (ehExcecoes) excecoes.push(token);
        else universo.add(token);
      }
    }

    // Producao: primeira celula (entre backticks) das linhas de tabela da secao.
    if (ehProducao && /^\s*\|/.test(linha)) {
      const celula = /`([^`]+)`/.exec(linha.replace(/\\\|/g, "|"));
      if (celula) producao.push(normalize(celula[1]));
    }
  }
  return { producao, universo: [...universo], excecoes: [...new Set(excecoes)] };
}


/**
 * Compara codigo x documento nas duas direcoes.
 * naoDocumentadas: token usado no codigo sem correspondencia no documento.
 * fantasmas: chave da secao de producao do documento que nao existe no codigo.
 */
function compara(doc, tokens) {
  const excecoes = doc.excecoes || [];
  const naoDocumentadas = [];
  const vistos = new Set();
  for (const t of tokens) {
    if (vistos.has(t.token)) continue;
    vistos.add(t.token);
    if (doc.universo.some((u) => casa(t.token, u))) continue;
    if (excecoes.some((e) => casa(t.token, e))) continue;
    naoDocumentadas.push(t);
  }

  const fantasmas = [];
  for (const p of doc.producao) {
    if (!tokens.some((t) => casa(t.token, p))) fantasmas.push(p);
  }

  // Excecao declarada que nao aparece mais no codigo: aviso, nunca bloqueio.
  const excecoesObsoletas = excecoes.filter((e) => !tokens.some((t) => casa(t.token, e)));

  return {
    naoDocumentadas,
    fantasmas,
    excecoesObsoletas,
    ok: naoDocumentadas.length === 0 && fantasmas.length === 0,
  };
}

/**
 * Tokens de chave da 1a celula backtickada das linhas de tabela de um bloco
 * gerado (`| \`chave\` | ...`). Pura.
 */
function chavesDoBloco(bloco) {
  const out = [];
  for (const linha of String(bloco).split(/\r?\n/)) {
    if (!/^\s*\|/.test(linha)) continue;
    const cel = /`([^`]+)`/.exec(linha.replace(/\\\|/g, "|"));
    if (!cel) continue;
    const t = normalize(cel[1]);
    if (/^lila[-_].+/.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

/**
 * FONTE DE VERDADE DO INVENTARIO (P1.4 — inversao): consome o BLOCO GERADO de
 * `docs/LOCALSTORAGE-KEYS.md` (registry docs-pairs) em vez de ler a tabela
 * curada a mao. Exige `md` (conteudo cru) — chamadas com `doc` de fixture
 * (testes) seguem no modo antigo (`parseDoc`). Fail-open: bloco/registro/modulo
 * ausente cai no parseDoc (a escolha e declarada em `fonteInventario`).
 */
function lerBlocoGerado(absDoc, md) {
  let ger;
  try { ger = require("./gerar-docs-derivados.cjs"); } catch { return null; }
  let reg;
  try { reg = ger.carregarRegistry(); } catch { return null; }
  const relDoc = path.relative(REPO_ROOT, absDoc).split(path.sep).join("/");
  const par = reg.find((p) => p.kind === "block" && p.derived_path === relDoc);
  if (!par) return null;
  const b = ger.blocosDe(par)[0];
  const bloco = ger.extrairBloco(md, b.begin, b.end);
  if (bloco === null) return { par: par.id, chaves: null };
  return { par: par.id, chaves: chavesDoBloco(bloco) };
}

/** Divergencia bloco gerado x codigo (fonte unica: inventarioStorage do gerador). Pura. */
function divergenciaInventario(chavesBloco) {
  if (!chavesBloco) return { fantasma: [], ausente: [] };
  let inv;
  try { inv = require("./gerar-docs-derivados.cjs").inventarioStorage(); } catch { return { fantasma: [], ausente: [] }; }
  return {
    fantasma: chavesBloco.filter((k) => !inv.vivos.includes(k)),
    ausente: inv.vivos.filter((k) => !chavesBloco.includes(k)),
  };
}

/** Monta o relatorio (JSON estavel para CI/testes). */
function buildReport({ doc, tokens, docPath, srcRoots, verbose, md, absDoc }) {
  let docEfetivo = doc;
  let blocoGerado = null;
  let fonteInventario = "doc curado (parseDoc — sem bloco gerado no escopo)";
  let div = { fantasma: [], ausente: [] };
  if (md && absDoc) {
    const b = lerBlocoGerado(absDoc, md);
    if (b) {
      blocoGerado = b.par;
      if (b.chaves) {
        docEfetivo = Object.assign({}, doc, { producao: b.chaves });
        fonteInventario = "bloco gerado (scripts/docs-pairs.registry.json#" + b.par + ")";
        div = divergenciaInventario(b.chaves);
      } else {
        fonteInventario = "doc curado (bloco gerado '" + b.par + "' ausente)";
      }
    }
  }
  const r = compara(docEfetivo, tokens);
  const tokensUnicos = [...new Set(tokens.map((t) => t.token))].sort();
  const ok = r.ok && div.fantasma.length === 0 && div.ausente.length === 0;
  return {
    ok,
    comando: "node scripts/verificar-localstorage-keys.cjs",
    doc: docPath,
    src: srcRoots,
    fonteInventario,
    blocoGerado,
    blocoFantasma: div.fantasma,
    blocoAusente: div.ausente,
    tokensCodigo: tokensUnicos.length,
    chavesProducaoDoc: docEfetivo.producao.length,
    excecoesDoc: (docEfetivo.excecoes || []).length,
    naoDocumentadas: r.naoDocumentadas.map((t) => ({
      token: t.token,
      ocorrencias: tokens
        .filter((o) => o.token === t.token)
        .map((o) => `${o.arquivo}:${o.linha}`)
        .slice(0, 5),
    })),
    fantasmas: r.fantasmas,
    excecoesObsoletas: r.excecoesObsoletas,
    tokens: verbose ? tokensUnicos : undefined,
    exitCode: ok ? 0 : 1,
  };
}

function ajuda() {
  console.log("Uso: node scripts/verificar-localstorage-keys.cjs [--doc <arquivo>] [--src a,b] [--json] [--verbose]");
  console.log("  --doc <arquivo>  documento canonico do inventario (default docs/LOCALSTORAGE-KEYS.md)");
  console.log("  --src <a,b>      diretorios de codigo varridos (default src,test)");
  console.log("  --json           saida JSON parseavel");
  console.log("  --verbose        inclui a lista de tokens do codigo no relatorio JSON");
  console.log("Exit: 0 = codigo e inventario coerentes | 1 = divergencia (chave nao documentada ou fantasma)");
}

function argValor(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    ajuda();
    return 0;
  }
  const JSON_OUT = process.argv.includes("--json");
  const VERBOSE = process.argv.includes("--verbose");

  const docPath = argValor("--doc") || process.env.LOCALSTORAGE_KEYS_DOC || DEFAULT_DOC;
  const srcRoots = (argValor("--src") || process.env.LOCALSTORAGE_KEYS_SRC || DEFAULT_SRC.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!fs.existsSync(docPath)) {
    console.error(`🔴 documento do inventario ausente: ${docPath}`);
    return 1;
  }

  const md = fs.readFileSync(docPath, "utf8");
  const doc = parseDoc(md);
  const tokens = scanSources(srcRoots, REPO_ROOT);
  const rel = buildReport({
    doc,
    tokens,
    docPath: path.relative(REPO_ROOT, docPath).split(path.sep).join("/"),
    srcRoots,
    verbose: VERBOSE,
    md,
    absDoc: docPath,
  });

  if (JSON_OUT) {
    console.log(JSON.stringify(rel, null, 2));
    return rel.exitCode;
  }

  if (rel.ok) {
    console.log(
      `✅ verificar-localstorage-keys — ${rel.tokensCodigo} token(s) de chave no codigo casam com o inventario ` +
        `(${rel.chavesProducaoDoc} chaves de producao, ${rel.excecoesDoc} excecao(oes) declarada(s); fonte: ${rel.fonteInventario}).`
    );
    if (rel.excecoesObsoletas.length > 0) {
      console.log(`⚠️  ${rel.excecoesObsoletas.length} excecao(oes) do inventario sem uso no codigo (aviso, nao bloqueia):`);
      for (const e of rel.excecoesObsoletas) console.log(`   - ${e}`);
    }
    if (VERBOSE) for (const t of rel.tokens) console.log(`   - ${t}`);
    return 0;
  }

  console.error("🔴 verificar-localstorage-keys — inventario e codigo divergem:");
  if (rel.blocoFantasma.length > 0) {
    console.error(`\n  C) ${rel.blocoFantasma.length} chave(s) no BLOCO GERADO que o codigo NAO possui (edicao manual do bloco OU codigo mudou sem regen):`);
    for (const k of rel.blocoFantasma) console.error(`     - ${k}`);
    console.error(`     Corrija com: node scripts/gerar-docs-derivados.cjs --pair ${rel.blocoGerado}`);
  }
  if (rel.blocoAusente.length > 0) {
    console.error(`\n  D) ${rel.blocoAusente.length} chave(s) vivas no codigo AUSENTES do bloco gerado (regen pendente):`);
    for (const k of rel.blocoAusente) console.error(`     - ${k}`);
    console.error(`     Corrija com: node scripts/gerar-docs-derivados.cjs --pair ${rel.blocoGerado}`);
  }
  if (rel.naoDocumentadas.length > 0) {
    console.error(`\n  A) ${rel.naoDocumentadas.length} chave(s) usada(s) no codigo e NAO registrada(s) em ${rel.doc}:`);
    for (const d of rel.naoDocumentadas) console.error(`     - ${d.token}  (${d.ocorrencias.join(", ")})`);
    console.error("     Registre a chave na tabela 'Keys de Producao' do inventario (regra 1 do documento).");
  }
  if (rel.fantasmas.length > 0) {
    console.error(`\n  B) ${rel.fantasmas.length} chave(s) FANTASMA no documento (producao sem uso no codigo):`);
    for (const f of rel.fantasmas) console.error(`     - ${f}`);
    console.error("     Remova a linha do inventario ou reinstale o uso no codigo (evidencia antes de remover).");
  }
  return 1;
}

module.exports = { normalize, globToRe, casa, extraiTokens, linhaDe, scanSources, parseDoc, compara, buildReport, chavesDoBloco, lerBlocoGerado, divergenciaInventario, KEY_RE };

// ORDEM IMPORTA (P1b): exports ANTES do guard de main. O gerador consome este
// modulo (e este modulo consome o gerador) — com o guard primeiro, `require`
// circular devolveria os exports VAZIOS enquanto main() roda.
if (require.main === module) process.exit(main());
