#!/usr/bin/env node
// scripts/validar-ledgers.cjs — gate de integridade dos ledgers append-only.
// Incidente RESTAURACAO-BACKLOG-HB-20260922: o commit 86627f2a (fluxo lila-write,
// reescrita integral de arquivo a partir de contexto parcial) apagou 14 entradas
// do backlog de hardening sem mudança de status — a regra append-only era
// política, não enforcement. Este gate fecha isso: o número de entradas de cada
// ledger protegido NUNCA diminui entre base..head. Resolução/cancelamento muda
// o status in-place (a entrada segue contada); só restauração/adição aumenta a
// contagem. Zero dependências além de git — roda antes do npm ci e FORA do skip
// doc-only (o incidente veio exatamente por PR doc-only de lila-write).
// CLI: --base <rev>  (CI: HEAD^1, materializado por fetch-depth: 2;
//                     default local: merge-base com origin/main, fallback HEAD^1)
//      --head <rev>  (default: HEAD)
// Exit: 0 ok | 1 violação de integridade | 2 erro de ambiente/uso.
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Ledgers protegidos: arquivo escrito à mão, append-only por própria declaração.
// Artefatos GERADOS (decisoes-ledger.json, grafo*.json, índices, manifest) ficam
// FORA de propósito — regeneração integral neles é o fluxo canônico.
//
// `files` é a lista de paths VIGENTES em ordem cronológica (mais novo por último):
// o conteúdo efetivo em cada rev é o do PRIMEIRO path que existir lá. Isso torna o
// gate tolerante a MOVIMENTAÇÃO do ledger (reorganização de diretório não pode
// virar falso-positivo de perda no commit do move — precedente
// PATCH-HIGIENE-ORGANIZACAO-PLANEJAMENTO-20260925, que moveu o ledger HB-* de
// LILA-DEV/hardening/ para LILA-DEV/planejamento/hardening/).
const LEDGERS = [
  {
    files: ["LILA-DEV/hardening/backlog.md", "LILA-DEV/planejamento/hardening/backlog.md"],
    desc: "entradas HB-* do backlog de hardening (fonte única pós-consolidação)",
    idPattern: /^## (HB-\d+)/gm,
  },
  {
    files: [
      "LILA-DEV/planejamento/hardening/backlog-2026-09-15.md",
      "LILA-DEV/planejamento/hardening/executados/backlog-2026-09-15.md",
    ],
    desc: "itens numerados do backlog de hardening 2026-09-15 (fóssil arquivado)",
    idPattern: /^## (\d+)\./gm,
  },
  {
    files: ["LILA-DEV/execucao/patch-debt.json"],
    desc: "dívidas PATCH-* do patch-debt",
    idPattern: /"id": "(PATCH-[^"]+)"/g,
  },
];

/** IDs de entrada num conteúdo (fixtura ou git show). Pura. */
function extrairIds(conteudo, idPattern) {
  if (conteudo == null) return [];
  const re = new RegExp(
    idPattern.source,
    idPattern.flags.includes("g") ? idPattern.flags : idPattern.flags + "g"
  );
  const ids = [];
  let m;
  while ((m = re.exec(String(conteudo))) !== null) ids.push(m[1]);
  return ids;
}

/** IDs presentes na base e ausentes no head, sem duplicar. Pura. */
function idsPerdidos(baseIds, headIds) {
  const presentes = new Set(headIds);
  const reportados = new Set();
  const perdidos = [];
  for (const id of baseIds) {
    if (!presentes.has(id) && !reportados.has(id)) {
      perdidos.push(id);
      reportados.add(id);
    }
  }
  return perdidos;
}

/** Veredito de um ledger entre dois conteúdos. Pura (testável sem git). */
function avaliarLedger(baseConteudo, headConteudo, ledger) {
  const baseIds = extrairIds(baseConteudo, ledger.idPattern);
  const headIds = extrairIds(headConteudo, ledger.idPattern);
  const perdidos = idsPerdidos(baseIds, headIds);
  return {
    file: caminhoCanonico(ledger),
    desc: ledger.desc,
    baseCount: baseIds.length,
    headCount: headIds.length,
    perdidos,
    ok: perdidos.length === 0,
  };
}

/** Path vigente do ledger (último da lista cronológica). Pura. */
function caminhoCanonico(ledger) {
  return ledger.files[ledger.files.length - 1];
}

function gitOut(args) {
  const r = spawnSync("git", ["--no-pager", ...args], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? String(r.stdout || "").trim() : null;
}

/** Conteúdo de file na rev; null se o arquivo não existir lá. */
function conteudoEm(rev, file) {
  const r = spawnSync("git", ["--no-pager", "show", `${rev}:${file}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? String(r.stdout || "") : null;
}

/** Conteúdo do ledger na rev: primeiro path existente entre os vigentes (move-safe).
 *  `leitor(rev, file)` é injetável para teste puro; default = git show. */
function conteudoLedgerEm(rev, ledger, leitor = conteudoEm) {
  for (const file of ledger.files) {
    const conteudo = leitor(rev, file);
    if (conteudo != null) return conteudo;
  }
  return null;
}

/** Base default local: merge-base com origin/main, fallback HEAD^1, fallback HEAD. */
function basePadrao() {
  return (
    gitOut(["merge-base", "HEAD", "origin/main"]) ||
    gitOut(["rev-parse", "HEAD^1"]) ||
    "HEAD"
  );
}

function parseArgs(argv) {
  const opts = { base: null, head: "HEAD" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") opts.base = argv[++i] ?? null;
    else if (argv[i] === "--head") opts.head = argv[++i] ?? "HEAD";
    else {
      process.stderr.write(`[validar-ledgers] argumento desconhecido: ${argv[i]}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const base = opts.base || basePadrao();
  for (const rev of [base, opts.head]) {
    if (!gitOut(["rev-parse", "--verify", "--quiet", rev])) {
      process.stderr.write(`[validar-ledgers] rev inacessível: ${rev}\n`);
      process.exit(2);
    }
  }

  const violacoes = [];
  for (const ledger of LEDGERS) {
    const baseConteudo = conteudoLedgerEm(base, ledger);
    const headConteudo = conteudoLedgerEm(opts.head, ledger);
    const veredito = avaliarLedger(baseConteudo, headConteudo, ledger);
    process.stdout.write(
      `[validar-ledgers] ${veredito.file}: ${veredito.baseCount} -> ${veredito.headCount} ` +
        `${veredito.ok ? "ok" : "VIOLACAO"}\n`
    );
    if (!veredito.ok) violacoes.push(veredito);
  }

  if (violacoes.length) {
    process.stderr.write(
      "\n[validar-ledgers] FALHA — entradas de ledger append-only sumiram entre " +
        `${base}..${opts.head}:\n`
    );
    for (const v of violacoes) {
      process.stderr.write(
        `  ${v.file} (${v.desc}): ${v.baseCount} -> ${v.headCount}. ` +
          `Perdidas: ${v.perdidos.join(", ")}\n`
      );
    }
    process.stderr.write(
      "\nRegra: entrada NUNCA é apagada — mudar status in-place " +
        "(`aberto` -> `resolvido`/`cancelado`, com data e referência) ou restaurar " +
        "com nota de retificação. Precedente: incidente 86627f2a, restaurado em " +
        "RESTAURACAO-BACKLOG-HB-20260922.\n"
    );
    process.exit(1);
  }
  process.stdout.write("[validar-ledgers] OK — integridade dos ledgers preservada.\n");
}

if (require.main === module) main();

module.exports = {
  LEDGERS,
  extrairIds,
  idsPerdidos,
  avaliarLedger,
  caminhoCanonico,
  conteudoLedgerEm,
};
