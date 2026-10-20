// scripts/restore-test.cjs
// Restore-test do backup Postgres — D3/8.2 (sweep hardening 2026-08-28, achado 8.2).
//
// Pipeline SEGURO de teste de restore:
//   1. Cria dump CUSTOM do banco de ORIGEM (estado atual) -> ponto de reversão.
//   2. (opcional) cria banco SCRATCH no servidor de destino (--create-scratch <nome>).
//   3. pg_restore --clean --if-exists --no-owner --no-privileges no banco de DESTINO.
//   4. Valida integridade: compara contagem de tabelas + linhas source x target.
//   5. Exit 0 = restore OK (dados integros); exit 1 = falha (pre-requisito, dump,
//      restore ou divergencia de validacao).
//
// SEGURANCA: o restore acontece SEMPRE no banco de DESTINO (nunca no de origem).
// O dump gerado e o ponto de reversao do estado atual — retenha com --keep-dump.
//
// Uso:
//   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node scripts/restore-test.cjs
//   node scripts/restore-test.cjs --source-url <url> --target-url <url> [--create-scratch nome]
//   node scripts/restore-test.cjs --check        # pre-requisitos (pg_dump/pg_restore/psql)
//
// Flags:
//   --source-url <url>    banco de ORIGEM do dump (ou env SOURCE_DATABASE_URL)
//   --target-url <url>    banco de DESTINO do restore (ou env TARGET_DATABASE_URL)
//   --dump <path>         arquivo do dump (default: backups/restore-test-<ts>.dump)
//   --keep-dump           NAO remove o dump no final (retencao do ponto de reversao)
//   --create-scratch <n>  cria o banco <n> no servidor do target antes do restore
//   --drop-scratch <n>    remove o banco <n> no final (limpeza)
//   --check               valida apenas os pre-requisitos (exit 0/1)
//
// Exit codes: 0 = sucesso; 1 = falha. Nenhuma senha e impressa (URLs mascaradas).

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const opts = {
    check: false,
    sourceUrl: null,
    targetUrl: null,
    dump: null,
    keepDump: false,
    createScratch: null,
    dropScratch: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") opts.check = true;
    else if (arg === "--keep-dump") opts.keepDump = true;
    else if (arg === "--source-url") opts.sourceUrl = argv[++i] ?? null;
    else if (arg === "--target-url") opts.targetUrl = argv[++i] ?? null;
    else if (arg === "--dump") opts.dump = argv[++i] ?? null;
    else if (arg === "--create-scratch") opts.createScratch = argv[++i] ?? null;
    else if (arg === "--drop-scratch") opts.dropScratch = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

/** Remove credenciais de uma URL de conexao para logs (nunca imprime senha). */
function maskUrl(url) {
  if (!url) return "";
  return url.replace(/\/\/([^@]+)@/, (_, creds) => {
    const parts = creds.split(":");
    const user = parts[0] ?? "";
    return `//${user}:****@`;
  });
}

/** Banco de uma URL (ultimo segmento do path). */
function dbNameFromUrl(url) {
  try {
    return new URL(url).pathname.replace(/^\//, "").split("/")[0] ?? "";
  } catch {
    return "";
  }
}

/** Servidor (host/port/user/pass) de uma URL — usado para criar scratch. */
function serverFromUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port || "5432", user: u.username, pass: u.password };
  } catch {
    return { host: "", port: "5432", user: "", pass: "" };
  }
}

/** Retorna a mesma URL apontando para outro banco (preserva credenciais/params). */
function withDbName(url, db) {
  try {
    const u = new URL(url);
    u.pathname = `/${db}`;
    return u.toString();
  } catch {
    return url;
  }
}

function findBin(bin) {
  const candidates = [process.env[`${bin.toUpperCase()}_PATH`], bin, `${bin}.exe`].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (r.status === 0) return c;
  }
  return null;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function runStep(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  return r.status === 0 ? { ok: true, out, err } : { ok: false, out, err };
}

/** Executa psql -tAc e retorna {ok, out, err}. */
function psqlOne(url, query) {
  const r = spawnSync("psql", ["-tAc", query, url], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PGCONNECT_TIMEOUT: "10" },
  });
  return r.status === 0
    ? { ok: true, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() }
    : { ok: false, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/** Lista tabelas publicas de um banco. */
function tableNames(url) {
  const r = psqlOne(url, "select tablename from pg_tables where schemaname='public' order by 1");
  if (!r.ok) return { ok: false, error: r.err || r.out || "psql falhou", tables: [] };
  return { ok: true, tables: r.out.split("\n").map((s) => s.trim()).filter(Boolean), error: "" };
}

/** Conta linhas de cada tabela publica (via count(*) parametrizado por nome). */
function rowCounts(url, tables) {
  const counts = {};
  for (const t of tables) {
    const r = psqlOne(url, `select count(*)::text from "${t.replace(/"/g, '""')}"`);
    counts[t] = r.ok ? (r.out || "0") : "ERRO";
  }
  return counts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      "Uso: node scripts/restore-test.cjs --source-url <url> --target-url <url> [--create-scratch nome] [--keep-dump] [--drop-scratch nome]\n" +
        "  --check            valida pre-requisitos (pg_dump/pg_restore/psql) - exit 0/1\n" +
        "  --source-url <url> banco de ORIGEM do dump (ou env SOURCE_DATABASE_URL)\n" +
        "  --target-url <url> banco de DESTINO do restore (ou env TARGET_DATABASE_URL)\n" +
        "  --dump <path>      arquivo do dump (default: backups/restore-test-<ts>.dump)\n" +
        "  --keep-dump        nao remove o dump no final (ponto de reversao)\n" +
        "  --create-scratch n cria banco n no servidor do target\n" +
        "  --drop-scratch n   remove banco n no final"
    );
    process.exit(0);
  }

  const pgDump = findBin("pg_dump");
  const pgRestore = findBin("pg_restore");
  const psqlBin = findBin("psql");
  if (!pgDump || !pgRestore || !psqlBin) {
    console.error("[restore-test] pre-requisito ausente: pg_dump/pg_restore/psql precisam estar no PATH");
    process.exit(1);
  }

  const sourceUrl = opts.sourceUrl ?? process.env.SOURCE_DATABASE_URL;
  const targetUrl = opts.targetUrl ?? process.env.TARGET_DATABASE_URL;

  if (opts.check) {
    console.log(`[restore-test] OK - pg_dump=${pgDump}; pg_restore=${pgRestore}; psql=${psqlBin}`);
    if (sourceUrl) console.log(`[restore-test] source: ${maskUrl(sourceUrl)} (db=${dbNameFromUrl(sourceUrl)})`);
    if (targetUrl) console.log(`[restore-test] target: ${maskUrl(targetUrl)} (db=${dbNameFromUrl(targetUrl)})`);
    process.exit(0);
  }

  if (!sourceUrl || !targetUrl) {
    console.error(
      "[restore-test] source e target sao obrigatorios (--source-url/--target-url ou env SOURCE_DATABASE_URL/TARGET_DATABASE_URL)"
    );
    process.exit(1);
  }
  // Destino REAL: quando --create-scratch é usado, o banco de destino é o scratch
  // (a URL target serve apenas como referência de servidor — NUNCA recebe o restore).
  const destUrl = opts.createScratch ? withDbName(targetUrl, opts.createScratch) : targetUrl;
  if (dbNameFromUrl(sourceUrl) === dbNameFromUrl(destUrl)) {
    console.error("[restore-test] source e destino real sao o MESMO banco - abortando (restore nunca no banco de origem)");
    process.exit(1);
  }

  const dumpPath = opts.dump ?? path.join("backups", `restore-test-${timestamp()}.dump`);
  fs.mkdirSync(path.dirname(dumpPath), { recursive: true });

  console.log(`[restore-test] 1/5 dump do estado atual (ponto de reversao) -> ${dumpPath}`);
  const dumpStep = runStep(pgDump, ["--format=custom", "--no-owner", "--no-privileges", `--file=${dumpPath}`, sourceUrl]);
  if (!dumpStep.ok) {
    console.error(`[restore-test] pg_dump falhou: ${dumpStep.err || dumpStep.out}`);
    process.exit(1);
  }
  const stat = fs.statSync(dumpPath);
  if (stat.size <= 0) {
    console.error("[restore-test] dump vazio - removendo e falhando.");
    fs.unlinkSync(dumpPath);
    process.exit(1);
  }
  console.log(`[restore-test] dump OK (${(stat.size / 1024).toFixed(1)} KB)`);

  let scratchCreated = false;
  if (opts.createScratch) {
    const srv = serverFromUrl(targetUrl);
    const adminUrl = `postgres://${srv.user}:${srv.pass}@${srv.host}:${srv.port}/postgres`;
    console.log(`[restore-test] 2/5 criando scratch "${opts.createScratch}" no servidor do target`);
    runStep("psql", ["-tAc", `drop database if exists "${opts.createScratch.replace(/"/g, '""')}"`, adminUrl]);
    const cr = runStep("psql", ["-tAc", `create database "${opts.createScratch.replace(/"/g, '""')}"`, adminUrl]);
    if (!cr.ok) {
      console.error(`[restore-test] nao foi possivel criar o scratch: ${cr.err || cr.out}`);
      process.exit(1);
    }
    scratchCreated = true;
    console.log("[restore-test] scratch criado");
  }

  console.log(`[restore-test] 3/5 pg_restore -> ${maskUrl(destUrl)}`);
  const restStep = runStep(pgRestore, ["--clean", "--if-exists", "--no-owner", "--no-privileges", `--dbname=${destUrl}`, dumpPath]);
  if (!restStep.ok) {
    console.error(`[restore-test] pg_restore falhou: ${restStep.err || restStep.out}`);
    process.exit(1);
  }
  console.log("[restore-test] restore OK");


  console.log("[restore-test] 4/5 validando integridade (tabelas + linhas source x target)");
  const srcTables = tableNames(sourceUrl);
  const tgtTables = tableNames(destUrl);
  if (!srcTables.ok || !tgtTables.ok) {
    console.error(`[restore-test] nao foi possivel listar tabelas (source: ${srcTables.error} | target: ${tgtTables.error})`);
    process.exit(1);
  }
  const srcSet = new Set(srcTables.tables);
  const tgtSet = new Set(tgtTables.tables);
  const missingInTarget = srcTables.tables.filter((t) => !tgtSet.has(t));
  const extraInTarget = tgtTables.tables.filter((t) => !srcSet.has(t));
  const srcRows = rowCounts(sourceUrl, srcTables.tables);
  const tgtRows = rowCounts(destUrl, srcTables.tables);
  const divergencias = [];
  for (const t of srcTables.tables) {
    if (tgtRows[t] !== srcRows[t]) divergencias.push(`${t} (source=${srcRows[t]}, target=${tgtRows[t]})`);
  }

  let ok = true;
  if (missingInTarget.length > 0) {
    ok = false;
    console.error(`[restore-test] X tabelas ausentes no target: ${missingInTarget.join(", ")}`);
  }
  if (extraInTarget.length > 0) {
    console.warn(`[restore-test] ! tabelas extras no target (pre-existentes): ${extraInTarget.join(", ")}`);
  }
  if (divergencias.length > 0) {
    ok = false;
    console.error(`[restore-test] X divergencias de linhas: ${divergencias.join(" | ")}`);
  }
  console.log(`[restore-test] source: ${srcTables.tables.length} tabelas | target: ${tgtTables.tables.length} tabelas`);
  console.log(ok ? "[restore-test] OK integridade" : "[restore-test] X integridade com divergencias");

  console.log("[restore-test] 5/5 limpeza");
  if (scratchCreated && opts.dropScratch) {
    const srv = serverFromUrl(targetUrl);
    const adminUrl = `postgres://${srv.user}:${srv.pass}@${srv.host}:${srv.port}/postgres`;
    runStep("psql", ["-tAc", `drop database if exists "${opts.dropScratch.replace(/"/g, '""')}"`, adminUrl]);
    console.log("[restore-test] scratch removido");
  }
  if (!opts.keepDump) {
    fs.unlinkSync(dumpPath);
    console.log("[restore-test] dump temporario removido (use --keep-dump para reter o ponto de reversao)");
  } else {
    console.log(`[restore-test] dump retido (ponto de reversao): ${dumpPath}`);
  }

  process.exit(ok ? 0 : 1);
}

module.exports = { parseArgs, maskUrl, dbNameFromUrl, serverFromUrl, withDbName, findBin, timestamp, tableNames, rowCounts, runStep, main };

if (require.main === module) {
  main();
}

