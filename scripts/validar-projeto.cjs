#!/usr/bin/env node
// scripts/validar-projeto.cjs
// ADAPTACAO-LOCAL-001 (2026-10-20) — GATE_LOCAL do repo life-tracker.
// Substitui, neste repo, os validadores herdados que dependem de infra ausente
// (validar-integridade, verificar-frescor-docs, check-schema-drift, detectar-lane —
// ver LILA-DEV/PROJETO/PROTOCOLO-LOCAL.md §2).
//
// O que valida (fonte normativa: LILA-DEV/PROJETO/*):
//   1. camada de regras presente e coerente (.clinerules + PROJETO/*)
//   2. frescor declarado (atualizado_em ISO) em cada doc de PROJETO
//   3. contrato de schema: toda tabela do SCHEMA documentada em ESTADO-ATUAL.md
//   4. DDL proibido no codigo (ALTER/DROP) — sem migracao improvisada (DEC-006)
//   5. regras local-first em src/**: sem rede, sem localStorage, sem toISOString().slice
//   6. porta unica do IndexedDB (src/db/idb.ts)
//   7. tsconfig.include aponta para caminho existente (DEC-007)
//   8. higiene de repo: .env.local nao rastreado; node_modules rastreado (aviso)
//   9. scripts npm obrigatorios (typecheck, governanca:validar, validate)
//
// Exit code: 0 = sem erros; 1 = pelo menos um erro (avisos nao bloqueiam).
// DETERMINISTICO: sem rede, sem timestamp, sem escrita de arquivo. Saida sempre impressa.
// Uso: node scripts/validar-projeto.cjs [--help]
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Uso: node scripts/validar-projeto.cjs");
  console.log("  gate local do life-tracker (LILA-DEV/PROJETO/PROTOCOLO-LOCAL.md §3.1)");
  process.exit(0);
}

let erros = 0;
let avisos = 0;
const relatorio = [];
const erro = (m) => { erros++; relatorio.push("[ERRO]  " + m); };
const aviso = (m) => { avisos++; relatorio.push("[AVISO] " + m); };
const ok = (m) => relatorio.push("[OK]    " + m);

const ler = (p) => {
  try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return null; }
};
const existe = (p) => fs.existsSync(path.join(ROOT, p));

function listarSrc() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = dir + "/" + e.name;
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  if (existe("src")) walk("src");
  return out;
}

// --- 1. Camada de regras -------------------------------------------------
const DOCS_PROJETO = [
  "LILA-DEV/PROJETO/PROTOCOLO-LOCAL.md",
  "LILA-DEV/PROJETO/ESTADO-ATUAL.md",
  "LILA-DEV/PROJETO/DECISOES.md",
  "LILA-DEV/PROJETO/LOG.md",
  "LILA-DEV/PROJETO/MAPA-PROJETO.md",
  "LILA-DEV/PROJETO/REGRAS-CODIGO.md",
];

const clinerules = ler(".clinerules");
if (clinerules == null) {
  erro(".clinerules ausente na raiz (o Cline so carrega regras com o ponto no nome)");
} else {
  ok(".clinerules presente (" + clinerules.split("\n").length + " linhas)");
  const exigidos = [
    ["cabecalho DISPATCHER", /^DISPATCHER\b/m],
    ["bloco E-INV-DEV:BEGIN", /<!-- E-INV-DEV:GERADO:BEGIN/],
    ["bloco E-INV-DEV:END", /<!-- E-INV-DEV:GERADO:END -->/],
    ["bloco P1-DEV", /^P1-DEV \(/m],
    ["marcador de fim END_DISPATCHER_", /END_DISPATCHER_/],
  ];
  for (const [nome, re] of exigidos) {
    if (re.test(clinerules)) ok(".clinerules: " + nome);
    else erro(".clinerules sem " + nome);
  }
}

for (const d of DOCS_PROJETO) {
  if (existe(d)) ok("camada de projeto: " + d);
  else erro("camada de projeto incompleta: falta " + d);
}

// --- 2. Frescor declarado (atualizado_em ISO) ----------------------------
for (const d of DOCS_PROJETO) {
  const t = ler(d);
  if (t == null) continue;
  if (d.endsWith("LOG.md")) continue; // log e append-only por linha datada
  const m = t.match(/^atualizado_em:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  if (!m) erro(d + " sem atualizado_em: YYYY-MM-DD");
  else ok(d + " atualizado_em " + m[1]);
}


// --- 3. Contrato de schema (tabelas declaradas x documentadas) -----------
const databaseTs = ler("src/db/database.ts");
const estadoAtual = ler("LILA-DEV/PROJETO/ESTADO-ATUAL.md") || "";
let tabelas = [];
if (databaseTs == null) {
  erro("src/db/database.ts ausente (fonte unica do DDL)");
} else {
  tabelas = [...databaseTs.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map((m) => m[1]);
  if (tabelas.length === 0) erro("nenhuma tabela encontrada no SCHEMA de src/db/database.ts");
  else ok("SCHEMA declara " + tabelas.length + " tabela(s): " + tabelas.join(", "));
  for (const t of tabelas) {
    if (estadoAtual.includes("`" + t + "`")) ok("tabela documentada em ESTADO-ATUAL: " + t);
    else erro("tabela " + t + " do SCHEMA nao esta documentada em ESTADO-ATUAL.md §2");
  }
  // --- 4. DDL proibido no codigo (DEC-006) -------------------------------
  if (/\b(ALTER\s+TABLE|DROP\s+TABLE|DROP\s+COLUMN)\b/i.test(databaseTs)) {
    erro("DDL destrutivo/evolutivo em database.ts (ALTER/DROP) — exige migracao idempotente + DEC (DEC-006)");
  } else {
    ok("sem ALTER/DROP TABLE no codigo");
  }
  if (/CREATE TABLE(?!\s+IF NOT EXISTS)/.test(databaseTs)) {
    aviso("CREATE TABLE sem IF NOT EXISTS em database.ts (nao e idempotente no boot)");
  }
}

// --- 5. Regras local-first em src/** -------------------------------------
const arquivos = listarSrc();
if (arquivos.length === 0) erro("nenhum arquivo .ts/.tsx em src/");
if (!arquivos.includes("src/db/idb.ts")) erro("src/db/idb.ts ausente (porta unica do IndexedDB)");

const REDE = /\b(fetch|axios|XMLHttpRequest|WebSocket|EventSource)\b/;
const STORAGE = /\b(localStorage|sessionStorage)\b/;
const DATA_UTC = /toISOString\(\)\s*\.slice/;
const DEBUG = /console\.(log|debug)\s*\(/;
const ANY = /:\s*any\b/;

const achados = { REDE: [], STORAGE: [], DATA_UTC: [], DEBUG: [], ANY: [], IDB: [] };
for (const f of arquivos) {
  const t = ler(f) || "";
  if (REDE.test(t)) achados.REDE.push(f);
  if (STORAGE.test(t)) achados.STORAGE.push(f);
  if (DATA_UTC.test(t)) achados.DATA_UTC.push(f);
  if (DEBUG.test(t)) achados.DEBUG.push(f);
  if (ANY.test(t)) achados.ANY.push(f);
  if (/\bindexedDB\b/.test(t) && f !== "src/db/idb.ts") achados.IDB.push(f);
}

if (achados.REDE.length) erro("chamada de rede em app local-first: " + achados.REDE.join(", "));
else ok("src/: sem chamada de rede (local-first)");

if (achados.STORAGE.length) erro("localStorage/sessionStorage em src/ (persistencia e so IndexedDB): " + achados.STORAGE.join(", "));
else ok("src/: sem localStorage/sessionStorage");

if (achados.DATA_UTC.length) erro("toISOString().slice em src/ (data em UTC — use toLocaleDateString('en-CA')): " + achados.DATA_UTC.join(", "));
else ok("src/: sem toISOString().slice (data local preservada)");

if (achados.IDB.length) erro("indexedDB fora de src/db/idb.ts: " + achados.IDB.join(", "));
else ok("src/: IndexedDB acessado apenas via src/db/idb.ts");

if (achados.DEBUG.length) aviso("console.log/debug em src/: " + achados.DEBUG.join(", "));
else ok("src/: sem console.log/debug");

if (achados.ANY.length) aviso("tipo `any` explicito em src/: " + achados.ANY.join(", "));
else ok("src/: sem `any` explicito");

// --- 7. tsconfig.include x filesystem (DEC-007) --------------------------
const tsconfig = ler("tsconfig.json");
if (tsconfig == null) {
  erro("tsconfig.json ausente");
} else {
  let cfg = null;
  try {
    cfg = JSON.parse(tsconfig.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""));
  } catch { cfg = null; }
  if (!cfg) erro("tsconfig.json invalido (JSON nao parseavel)");
  else {
    const inc = Array.isArray(cfg.include) ? cfg.include : [];
    if (inc.length === 0) erro("tsconfig.include vazio");
    for (const p of inc) {
      if (existe(p)) ok("tsconfig.include resolvido: " + p);
      else erro("tsconfig.include cita caminho inexistente: " + p + " (DEC-007)");
    }
    if (cfg.compilerOptions && cfg.compilerOptions.strict === true) ok("tsconfig strict: true");
    else erro("tsconfig sem strict: true");
  }
}

// --- 8. Higiene de repositorio -------------------------------------------
const git = (args) => {
  try {
    return execSync("git " + args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch { return null; }
};
if (git("rev-parse --is-inside-work-tree") == null) {
  aviso("git indisponivel — checagens de rastreamento puladas");
} else {
  if (git("ls-files --error-unmatch .env.local") != null) {
    erro(".env.local rastreado no git (segredo no repositorio)");
  } else {
    ok(".env.local nao rastreado");
  }
  const nm = git("ls-files -- node_modules");
  const nmCount = nm ? nm.split("\n").filter(Boolean).length : 0;
  if (nmCount > 0) {
    aviso("node_modules rastreado (" + nmCount + " arquivos) — correcao: git rm -r --cached node_modules (DEC-008)");
  } else {
    ok("node_modules nao rastreado");
  }
}

// --- 9. Scripts npm obrigatorios -----------------------------------------
const pkgTxt = ler("package.json");
if (pkgTxt == null) {
  erro("package.json ausente");
} else {
  let pkg = null;
  try { pkg = JSON.parse(pkgTxt); } catch { pkg = null; }
  if (!pkg) erro("package.json invalido");
  else {
    for (const s of ["typecheck", "governanca:validar", "validate", "build"]) {
      if (pkg.scripts && pkg.scripts[s]) ok("npm script presente: " + s);
      else erro("npm script ausente: " + s);
    }
  }
}

// --- Relatorio ------------------------------------------------------------
console.log("GATE_LOCAL — life-tracker");
console.log("");
for (const l of relatorio) console.log(l);
console.log("");
console.log("erros: " + erros + " | avisos: " + avisos);
if (erros > 0) {
  console.log("RESULTADO: REPROVADO");
  process.exit(1);
}
console.log("RESULTADO: APROVADO");
process.exit(0);
