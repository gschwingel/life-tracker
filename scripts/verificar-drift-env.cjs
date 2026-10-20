#!/usr/bin/env node
/**
 * scripts/verificar-drift-env.cjs
 * Proposito: verificador de drift do contrato de configuracao (KF-HOMEOSTASE,
 * FR-HOMEOSTASE-N01 — decisao D6 do sprint: report-only, SEM gate de PR; o
 * dano de pior caso de env obrigatoria ausente ja falha alto no boot,
 * FR-SONO-T2-N01.U8; o resido e drift documental).
 *
 * O que faz: enumera chaves de ambiente EFETIVAMENTE usadas em codigo
 * (process.env.KEY, process.env["KEY"], import.meta.env.KEY — Vite frontend)
 * em src/** e backend/src/**, compara com as chaves documentadas nos
 * .env.example (raiz + backend/), e reporta duas classes de divergencia:
 *   - USADA-NAO-DOCUMENTADA: chave lida no codigo, ausente de todo .env.example
 *   - DOCUMENTADA-MORTA: chave presente em .env.example, nunca lida no codigo
 *
 * Fora de escopo (declarado): chaves injetadas por runtime/plataforma sem
 * contrato de app (NODE_ENV, PORT, DEV/PROD virtuais do Vite, GIT_COMMIT_SHA,
 * prefixo RAILWAY_) — ver ISENCOES.
 *
 * Entrada: arquivos reais do repo (env DRIFT_ENV_ROOT sobrepoe a raiz, p/ testes)
 * Saida:   relatorio legivel (stdout) + exit code
 * Flags:
 *   --json      emite JSON estruturado (maquina-legivel) alem do texto
 *   --strict    exit 1 quando houver divergencia (reservado p/ futuro gate;
 *               default e exit 0 mesmo com drift — decisao D6)
 * Erros:   exit 2 = problema de leitura/infraestrutura (nunca drift)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");
const RAIZ = process.env.DRIFT_ENV_ROOT
  ? path.resolve(process.env.DRIFT_ENV_ROOT)
  : path.join(__dirname, "..");

const EXTENSOES = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);
const DIRS_CODIGO = ["src", "backend/src"];
const ARQUIVOS_EXEMPLO = [".env.example", "backend/.env.example"];
// Schema central do backend (config.ts): chaves declaradas em `KEY: z.*` são
// lidas pelo leitor central (envSchema.parse(process.env)) — são superfície de
// USO e de CONTRATO ao mesmo tempo (default inline = documentação de valor).
// Nunca geram drift; leitura DIRETA fora delas continua sendo checada.
const ARQUIVOS_SCHEMA_CENTRAL = ["backend/src/config.ts"];
// docker-compose: POSTGRES_PASSWORD etc. vivem no compose, não em src/ — uso legítimo.
const ARQUIVOS_USO_EXTRA = ["backend/docker-compose.yml"];
// Injetadas por runtime/plataforma — nao sao contrato de aplicacao (v1, curado):
// DEV/PROD: variáveis VIRTUAIS do Vite (import.meta.env.DEV/PROD) — não são
// contrato de app, o Vite as define. GIT_COMMIT_SHA: injeção de plataforma
// (RAILWAY_GIT_COMMIT_SHA é o primeiro candidato da leitura). Decisão Igor
// 2026-10-01, lote painel vital P3.
const ISENCOES = new Set(["NODE_ENV", "PORT", "DEV", "PROD", "GIT_COMMIT_SHA"]);
const PREFIXOS_ISENTOS = ["RAILWAY_"];
// Documentadas-mortas LEGÍTIMAS: consumo dinâmico/fora do scan literal
// (curadoria Igor 2026-10-01, painel vital P3): VITE_* são lidos por acesso
// dinâmico no front (VITE_ARTISTA_MODEL_${i}); GITHUB_MIRROR_PATH é consumido
// pelo start.sh do backend (shell), fora de src/**.
const MORTAS_LEGITIMAS = new Set(["GITHUB_MIRROR_PATH"]);

function coletarArquivos(dir, acumulado) {
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acumulado;
  }
  for (const e of entradas) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) coletarArquivos(abs, acumulado);
    else if (EXTENSOES.has(path.extname(e.name))) acumulado.push(abs);
  }
  return acumulado;
}

function chavesUsadas(conteudo) {
  const usadas = new Set();
  for (const m of conteudo.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) usadas.add(m[1]);
  for (const m of conteudo.matchAll(/process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g)) usadas.add(m[1]);
  for (const m of conteudo.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g)) usadas.add(m[1]);
  return usadas;
}

function chavesDocumentadas(conteudo) {
  const documentadas = new Set();
  for (const linha of conteudo.split(/\r?\n/)) {
    const t = linha.trim();
    if (!t) continue;
    // Documentação COMENTADA conta: o .env.example documenta a massa dos
    // tunables com default no código como "# KEY=default" (padrão do arquivo).
    // Comentar ≠ remover do contrato (decisão Igor 2026-10-01, painel vital P3).
    const corpo = t.startsWith("#") ? t.slice(1).trim() : t;
    const m = corpo.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (m) documentadas.add(m[1]);
  }
  return documentadas;
}

function chavesUsoCompose(conteudo) {
  const chaves = new Set();
  // Só ${VAR} (interpolação do host) conta: atribuição literal no serviço
  // configura o CONTAINER (POSTGRES_DB: lila_db), não é contrato de app.
  for (const m of conteudo.matchAll(/\$\{([A-Z][A-Z0-9_]+)/g)) chaves.add(m[1]);
  return chaves;
}

function chavesSchemaCentral(conteudo) {
  const chaves = new Set();
  for (const m of conteudo.matchAll(/^\s*([A-Z][A-Z0-9_]*):\s*z\b/gm)) chaves.add(m[1]);
  return chaves;
}

function analisar(raiz) {
  const usadas = new Map(); // chave -> primeiro arquivo que usa
  for (const dirRel of DIRS_CODIGO) {
    const dirAbs = path.join(raiz, dirRel);
    if (!fs.existsSync(dirAbs)) continue;
    for (const arquivo of coletarArquivos(dirAbs, [])) {
      // fixtures de teste (pastas __tests__) leem process.env para mocks — não
      // são contrato de aplicação; fora do escopo de uso
      const rel = path.relative(raiz, arquivo);
      if (rel.split(path.sep).includes("__tests__")) continue;
      for (const chave of chavesUsadas(fs.readFileSync(arquivo, "utf8"))) {
        if (!usadas.has(chave)) usadas.set(chave, path.relative(raiz, arquivo).split(path.sep).join("/"));
      }
    }
  }
  const documentadas = new Map(); // chave -> exemplo onde esta documentada
  for (const exRel of ARQUIVOS_EXEMPLO) {
    const exAbs = path.join(raiz, exRel);
    if (!fs.existsSync(exAbs)) continue;
    for (const chave of chavesDocumentadas(fs.readFileSync(exAbs, "utf8"))) {
      if (!documentadas.has(chave)) documentadas.set(chave, exRel);
    }
  }
  // schema central: conta como uso E documentação (contrato inline com default)
  for (const schemaRel of ARQUIVOS_SCHEMA_CENTRAL) {
    const schemaAbs = path.join(raiz, schemaRel);
    if (!fs.existsSync(schemaAbs)) continue;
    for (const chave of chavesSchemaCentral(fs.readFileSync(schemaAbs, "utf8"))) {
      if (!usadas.has(chave)) usadas.set(chave, schemaRel);
      if (!documentadas.has(chave)) documentadas.set(chave, schemaRel);
    }
  }
  for (const usoRel of ARQUIVOS_USO_EXTRA) {
    const usoAbs = path.join(raiz, usoRel);
    if (!fs.existsSync(usoAbs)) continue;
    for (const chave of chavesUsoCompose(fs.readFileSync(usoAbs, "utf8"))) {
      if (!usadas.has(chave)) usadas.set(chave, usoRel);
    }
  }
  const isenta = (k) => ISENCOES.has(k) || PREFIXOS_ISENTOS.some((p) => k.startsWith(p));
  const usadasNaoDocumentadas = [...usadas.keys()].filter((k) => !documentadas.has(k) && !isenta(k)).sort();
  const mortaLegitima = (k) =>
    MORTAS_LEGITIMAS.has(k) || k.startsWith("VITE_ARTISTA_MODEL_") || k.startsWith("VITE_EXPERIMENTAL_");
  const documentadasMortas = [...documentadas.keys()].filter((k) => !usadas.has(k) && !isenta(k) && !mortaLegitima(k)).sort();
  return {
    usadasNaoDocumentadas: usadasNaoDocumentadas.map((k) => ({ chave: k, usadaEm: usadas.get(k) })),
    documentadasMortas: documentadasMortas.map((k) => ({ chave: k, documentadaEm: documentadas.get(k) })),
    totais: { usadas: usadas.size, documentadas: documentadas.size },
  };
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Uso: node scripts/verificar-drift-env.cjs [--json] [--strict]");
    console.log("  --json   saida JSON estruturada alem do texto");
    console.log("  --strict exit 1 em divergencia (default: report-only, exit 0 — D6)");
    return 0;
  }
  let r;
  try {
    r = analisar(RAIZ);
  } catch (e) {
    console.error("ERRO de leitura (infraestrutura, nao drift):", e.message);
    return 2;
  }
  const drift = r.usadasNaoDocumentadas.length + r.documentadasMortas.length;
  console.log(`== Drift de contrato de env (KF-HOMEOSTASE) ==`);
  console.log(`chaves usadas em codigo: ${r.totais.usadas} | documentadas em .env.example: ${r.totais.documentadas}`);
  if (r.usadasNaoDocumentadas.length) {
    console.log(`\nUSADA-NAO-DOCUMENTADA (${r.usadasNaoDocumentadas.length}):`);
    for (const it of r.usadasNaoDocumentadas) console.log(`  🔴 ${it.chave} — usada em ${it.usadaEm}`);
  }
  if (r.documentadasMortas.length) {
    console.log(`\nDOCUMENTADA-MORTA (${r.documentadasMortas.length}):`);
    for (const it of r.documentadasMortas) console.log(`  🟡 ${it.chave} — documentada em ${it.documentadaEm}`);
  }
  if (!drift) console.log("🟢 sem divergência entre código e .env.example");
  else console.log(`\ndrift total: ${drift} chave(s) — report-only (D6); --strict para bloquear`);
  if (JSON_OUT) console.log(JSON.stringify(r, null, 2));
  return drift && STRICT ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { analisar, chavesUsadas, chavesDocumentadas, chavesSchemaCentral };
