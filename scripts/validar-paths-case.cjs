#!/usr/bin/env node
// scripts/validar-paths-case.cjs
// Propósito: bloquear COLISÃO DE CASE em caminhos rastreados pelo git —
// no Windows o FS é case-insensitive (o índice aceita duas variantes do mesmo
// diretório), mas em checkout Linux/CI os caminhos viram DIRETÓRIOS DIFERENTES,
// partindo o repo. Referência: 2026-09-03 — sessão paralela gravou prompts em
// LILA-DEV/Planejamento/Prompts/ (maiúsculas) enquanto a convenção do repo é
// LILA-DEV/planejamento/prompts/ (lowercase).
// Regras (ORGANIZAÇÃO-LILA-DEV 2026-09-06):
//   1. Cada caminho de diretório (lowercased) deve mapear para UMA única
//      grafia no índice. Nomes de ARQUIVO podem ter maiúsculas (convenção aceita).
//   2. Todo DIRETÓRIO sob LILA-DEV/ deve ser lowercase (self-describing + CI
//      case-sensitive). Exceção: nenhuma após a normalização de 2026-09-06.
//   3. Nenhum caminho sob LILA-DEV/ pode conter caractere NÃO-ASCII (em-dash,
//      acentos, emoji quebram parse/glob/URL) — EXCETO os arquivos de retenção
//      sob LILA-DEV/historico/ e LILA-DEV/execucao/logs-arquivo/ (nomes
//      históricos preservados, grandfather explícito).
// Saída: exit 0 (ok) | exit 1 (violações listadas).

const { execFileSync } = require("node:child_process");

let out;
try {
  out = execFileSync("git", ["-c", "core.quotepath=false", "ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  console.error("git ls-files falhou — rode na raiz de um repositório git:", err.message);
  process.exit(1);
}

const files = out.split("\n").filter(Boolean);
const dirsByLower = new Map();
const ARCHIVE_PREFIXES = ["LILA-DEV/historico/", "LILA-DEV/execucao/logs-arquivo/"];
const isArchived = (p) => ARCHIVE_PREFIXES.some((a) => p.startsWith(a));
const violations = [];

for (const file of files) {
  const parts = file.split("/");
  parts.pop(); // descarta o nome do arquivo — só diretórios interessam
  let acc = "";
  for (const seg of parts) {
    acc = acc ? `${acc}/${seg}` : seg;
    const lower = acc.toLowerCase();
    if (!dirsByLower.has(lower)) dirsByLower.set(lower, new Set());
    dirsByLower.get(lower).add(acc);
  }

  if (file.startsWith("LILA-DEV/")) {
    if (isArchived(file)) continue; // grandfather de nomes históricos em retenção
    const hasNonAscii = [...file].some((c) => c.codePointAt(0) > 0x7f);
    if (hasNonAscii) {
      violations.push(`NÃO-ASCII em caminho ativo de LILA-DEV: ${file}`);
    }
  }
}

// Regra 1 — colisão de case em diretórios (repo inteiro).
const collisions = [];
for (const [, variants] of dirsByLower) {
  if (variants.size > 1) {
    collisions.push([...variants].sort().join("  ⇄  "));
  }
}

// Regra 2 — diretórios de LILA-DEV/ devem ser lowercase.
const lilaDirs = new Set();
for (const [lower, variants] of dirsByLower) {
  if (!lower.startsWith("LILA-DEV/")) continue;
  for (const v of variants) {
    if (v !== v.toLowerCase()) {
      lilaDirs.add(`${v}  (grafia canônica: ${v.toLowerCase()})`);
    }
  }
}

if (collisions.length > 0) {
  console.error(`\n✖ ${collisions.length} colisão(ões) de case em diretórios rastreados:`);
  for (const c of collisions) console.error(`  - ${c}`);
  console.error("\nCorrija com: git mv (normalizando para a grafia canônica lowercase de LILA-DEV).");
  process.exit(1);
}

if (lilaDirs.size > 0) {
  console.error(`\n✖ ${lilaDirs.size} diretório(s) de LILA-DEV com maiúsculas (padrão: lowercase):`);
  for (const d of [...lilaDirs].sort()) console.error(`  - ${d}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`\n✖ ${violations.length} caminho(s) com caractere NÃO-ASCII sob LILA-DEV (fora de historico/ e logs-arquivo/):`);
  for (const v of violations.sort()) console.error(`  - ${v}`);
  console.error("\nCorrija com: renomeação para ASCII (slug) — ver ORGANIZAÇÃO-LILA-DEV 2026-09-06.");
  process.exit(1);
}

console.log(`✅ Caminhos ok — ${files.length} arquivos, ${dirsByLower.size} diretórios (case único, LILA-DEV lowercase + ASCII).`);
