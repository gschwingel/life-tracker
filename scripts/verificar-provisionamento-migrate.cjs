#!/usr/bin/env node
// scripts/verificar-provisionamento-migrate.cjs
/**
 * Proposito: gate de PROVISIONAMENTO do unico caminho de DDL do repo
 * (`backend/src/scripts/migrate.ts` — `backend/drizzle/` nao e versionado).
 *
 * INVARIANTE (F6 — KF-22 / pendencia #2, PR-B):
 *   todo alvo de `ALTER TABLE` em `migrate.ts` tem de ser provisionado PELO
 *   MESMO arquivo, por `CREATE TABLE IF NOT EXISTS` OU como destino de `RENAME`
 *   de tabela criada ali.
 *
 * Motivo: `model_telemetry` nunca existiu em producao — 5 `ALTER TABLE
 * model_telemetry ...` presumiam a tabela, o boot falhava e o `catch` POR
 * MIGRACAO do `ensureMigrated()` engolia o erro (nenhuma linha de telemetria
 * persistida ate o PR-A). Em ambiente NOVO o `CREATE` faz a tabela nascer; em
 * producao e no-op idempotente (R-MIGRACAO-IMUTAVEL).
 *
 * Entrada: `backend/src/scripts/migrate.ts`
 * Exit:    0 = todo alvo de ALTER TABLE esta provisionado | 1 = alvo orfao
 * Flags:
 *   --migrate <arquivo>  arquivo alternativo (default: o canonico)
 *   --json               saida JSON parseavel (mesmo shape do gate)
 *   --verbose            lista tambem criadas/renomeadas no texto humano
 *   --help               ajuda
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MIGRATE = path.join(REPO_ROOT, "backend", "src", "scripts", "migrate.ts");

/** Nome de tabela simples (o schema canonico usa snake_case sem aspas). */
const TABELA = "([A-Za-z_][A-Za-z0-9_]*)";
const RE_CRIADA = new RegExp("CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s*" + TABELA, "gi");
const RE_RENOMEADA = new RegExp(
  "ALTER\\s+TABLE\\s+" + TABELA + "\\s+RENAME\\s+TO\\s+" + TABELA,
  "gi"
);
const RE_ALTERADA = new RegExp("ALTER\\s+TABLE\\s+" + TABELA, "gi");

/** Normaliza o identificador para comparacao (Postgres dobra case sem aspas). */
function normaliza(nome) {
  return String(nome).trim().toLowerCase();
}

/** Tabelas criadas no arquivo por `CREATE TABLE IF NOT EXISTS`. */
function extrairCriadas(sql) {
  const nomes = new Set();
  for (const m of String(sql).matchAll(RE_CRIADA)) nomes.add(normaliza(m[1]));
  return [...nomes].sort();
}

/** Pares `ALTER TABLE <de> RENAME TO <para>` (o destino herda o provisionamento). */
function extrairRenomeadas(sql) {
  const pares = [];
  for (const m of String(sql).matchAll(RE_RENOMEADA)) {
    pares.push({ de: normaliza(m[1]), para: normaliza(m[2]) });
  }
  return pares;
}

/** Alvos de `ALTER TABLE` (unicos, ordenados) — inclui os de dentro de blocos DO. */
function extrairAlteradas(sql) {
  const nomes = new Set();
  for (const m of String(sql).matchAll(RE_ALTERADA)) nomes.add(normaliza(m[1]));
  return [...nomes].sort();
}

/**
 * Conjunto provisionado = criadas + destinos de RENAME em cascata (o destino de
 * um RENAME cujo ORIGEM foi criado no arquivo tambem conta como provisionado).
 */
function provisionadas({ criadas, renomeadas }) {
  const set = new Set(criadas.map(normaliza));
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const { de, para } of renomeadas) {
      if (set.has(de) && !set.has(para)) {
        set.add(para);
        mudou = true;
      }
    }
  }
  return set;
}

/** Analise pura (sem IO): o que o arquivo cria, renomeia e altera. */
function analisar(sql) {
  const criadas = extrairCriadas(sql);
  const renomeadas = extrairRenomeadas(sql);
  const alvos = extrairAlteradas(sql);
  const prov = provisionadas({ criadas, renomeadas });
  const semProvisionamento = alvos.filter((t) => !prov.has(t));
  return { criadas, renomeadas, alvos, semProvisionamento };
}

/** Relatorio estavel (JSON do gate + base do texto humano). */
function buildReport(analise, arquivo) {
  return {
    ok: analise.semProvisionamento.length === 0,
    comando: "node scripts/verificar-provisionamento-migrate.cjs",
    arquivo: arquivo ? path.relative(REPO_ROOT, arquivo).split(path.sep).join("/") : null,
    criadas: analise.criadas.length,
    renomeadas: analise.renomeadas.length,
    alvosAlterTable: analise.alvos.length,
    semProvisionamento: analise.semProvisionamento,
    exitCode: analise.semProvisionamento.length === 0 ? 0 : 1,
  };
}

function ajuda() {
  console.log("Uso: node scripts/verificar-provisionamento-migrate.cjs [--migrate <arquivo>] [--json] [--verbose]");
  console.log("  --migrate <arquivo>  arquivo de migracoes (default backend/src/scripts/migrate.ts)");
  console.log("  --json               saida JSON parseavel");
  console.log("  --verbose            lista criadas/renomeadas no texto humano");
  console.log("Exit: 0 = todo alvo de ALTER TABLE provisionado | 1 = alvo orfao");
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
  const caminho = argValor("--migrate") || DEFAULT_MIGRATE;

  if (!fs.existsSync(caminho)) {
    console.error("verificar-provisionamento-migrate — arquivo de migracoes ausente: " + caminho);
    return 1;
  }

  const analise = analisar(fs.readFileSync(caminho, "utf8"));
  const rel = buildReport(analise, caminho);

  if (JSON_OUT) {
    console.log(JSON.stringify(rel, null, 2));
    return rel.exitCode;
  }

  if (rel.ok) {
    console.log(
      "verificar-provisionamento-migrate — OK: " +
        rel.alvosAlterTable +
        " alvo(s) de ALTER TABLE, todos provisionados (" +
        rel.criadas +
        " CREATE TABLE IF NOT EXISTS, " +
        rel.renomeadas +
        " RENAME)."
    );
    if (VERBOSE) {
      for (const c of analise.criadas) console.log("   - criada:    " + c);
      for (const r of analise.renomeadas) console.log("   - renomeada: " + r.de + " -> " + r.para);
    }
    return 0;
  }

  console.error(
    "verificar-provisionamento-migrate — " +
      rel.semProvisionamento.length +
      " alvo(s) de ALTER TABLE SEM provisionamento em " +
      rel.arquivo +
      ":"
  );
  for (const t of rel.semProvisionamento) console.error("     - " + t);
  console.error(
    "   Provisione cada alvo com `CREATE TABLE IF NOT EXISTS` no MESMO arquivo " +
      "(espelhando backend/src/db/schema.ts) ou como destino de RENAME de tabela criada ali."
  );
  return 1;
}

if (require.main === module) process.exit(main());

module.exports = {
  normaliza,
  extrairCriadas,
  extrairRenomeadas,
  extrairAlteradas,
  provisionadas,
  analisar,
  buildReport,
  DEFAULT_MIGRATE,
};
