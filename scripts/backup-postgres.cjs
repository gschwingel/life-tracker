// scripts/backup-postgres.cjs
// PATCH-REMOVE-ADMIN-BACKUP (2026-08-28) — D3/8.2: backup lógico do Postgres
// programável a partir do repo (Railway sem plano com backup gerenciado).
//
// Uso:
//   DATABASE_URL=postgres://... node scripts/backup-postgres.cjs   # dump custom
//   node scripts/backup-postgres.cjs --check                        # valida pré-requisitos
//   node scripts/backup-postgres.cjs --dir backups --keep 7 --url postgres://...
//
// Flags:
//   --check   valida apenas (DATABASE_URL presente + pg_dump disponível) — exit 0/1
//   --dir     diretório de saída (default: backups/)
//   --keep    número de dumps a reter (default: 7) — rotação por nome (timestamp)
//   --url     override da DATABASE_URL
//   --format  custom|plain (default: custom) — custom já é comprimido
//
// Exit 0 = sucesso; 1 = falha (pré-requisito ausente ou pg_dump erro).

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const opts = { check: false, dir: "backups", keep: 7, format: "custom", url: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") opts.check = true;
    else if (arg === "--dir") opts.dir = argv[++i];
    else if (arg === "--keep") opts.keep = Number(argv[++i]);
    else if (arg === "--format") opts.format = argv[++i];
    else if (arg === "--url") opts.url = argv[++i];
  }
  return opts;
}

function findPgDump() {
  const candidates = [process.env.PG_DUMP_PATH, "pg_dump", "pg_dump.exe"].filter(Boolean);
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (r.status === 0) return bin;
  }
  return null;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/**
 * Rotação: mantém os `keep` dumps mais recentes (ordem lexicográfica = timestamp)
 * e remove os demais. Retorna os nomes removidos.
 */
function rotateDumps(dir, keep) {
  const dumps = fs
    .readdirSync(dir)
    .filter((f) => /^backup-\d{8}-\d{6}\.(dump|sql)$/.test(f))
    .sort()
    .reverse();
  const removed = [];
  for (const stale of dumps.slice(keep)) {
    fs.unlinkSync(path.join(dir, stale));
    removed.push(stale);
  }
  return removed;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const dbUrl = opts.url ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[backup-postgres] DATABASE_URL ausente. Defina DATABASE_URL ou passe --url.");
    process.exit(1);
  }

  const pgDump = findPgDump();
  if (!pgDump) {
    console.error(
      "[backup-postgres] pg_dump nao encontrado no PATH. Instale o client PostgreSQL " +
        "(ex: apt-get install postgresql-client / choco install postgresql) ou defina PG_DUMP_PATH."
    );
    process.exit(1);
  }

  if (opts.check) {
    console.log(
      `[backup-postgres] OK — pg_dump=${pgDump}; DATABASE_URL definido; dir=${opts.dir}; keep=${opts.keep}; format=${opts.format}`
    );
    process.exit(0);
  }

  fs.mkdirSync(opts.dir, { recursive: true });

  const ext = opts.format === "plain" ? "sql" : "dump";
  const fileName = `backup-${timestamp()}.${ext}`;
  const filePath = path.join(opts.dir, fileName);

  const args = ["--no-owner", "--no-privileges", `--format=${opts.format}`, `--file=${filePath}`, dbUrl];
  console.log(`[backup-postgres] dump ${opts.format} → ${filePath}`);
  const res = spawnSync(pgDump, args, { encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] });

  if (res.status !== 0) {
    console.error(`[backup-postgres] pg_dump falhou (exit ${String(res.status)}) — dump nao retido.`);
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  if (stat.size <= 0) {
    console.error("[backup-postgres] dump vazio — removendo e falhando.");
    fs.unlinkSync(filePath);
    process.exit(1);
  }

  // Rotação: mantém os `keep` mais recentes (ordem lexicográfica = timestamp).
  const removed = rotateDumps(opts.dir, opts.keep);
  for (const stale of removed) {
    console.log(`[backup-postgres] rotacao: removido ${stale}`);
  }

  const keptCount = fs
    .readdirSync(opts.dir)
    .filter((f) => /^backup-\d{8}-\d{6}\.(dump|sql)$/.test(f)).length;

  console.log(
    `[backup-postgres] OK — ${fileName} (${(stat.size / 1024).toFixed(1)} KB); retidos ${keptCount}`
  );
  process.exit(0);
}

module.exports = { parseArgs, findPgDump, timestamp, rotateDumps, main };

if (require.main === module) {
  main();
}
