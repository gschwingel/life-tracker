#!/usr/bin/env node
// scripts/run-audits-parallel.cjs
// Proposito: executar os audits de dependencia da RAIZ e do BACKEND CONCORRENTEMENTE,
// preservando retry, logs identificados por origem e exit code agregado BLOQUEANTE
// (C2 do PATCH-OTIMIZACAO-PR-CI-FAILFAST-20260911).
//
// Motivo: no merge-gate os dois audits eram steps sequenciais (PowerShell) com retry
// 3x30s cada — em falha de registry o tempo dos dois somava. Agora rodam em paralelo
// com o MESMO retry. Invariante preservada: falha de um NUNCA e mascarada pelo
// sucesso do outro, e indisponibilidade persistente do registry NUNCA vira sucesso
// (o audit continua bloqueante; o que muda e o tempo, nao o veredito).
//
// Portabilidade: executor Node puro (sem bash, sem PowerShell) — o merge-gate roda em
// runner self-hosted Windows e o pr-gate em ubuntu. npm e invocado pelo entry JS do
// Node (mesma resolucao de scripts/run-checks-parallel.cjs: no Windows o spawn de
// .cmd lanca EINVAL; no ubuntu o layout do npm e outro).
//
// Uso:
//   node scripts/run-audits-parallel.cjs [--retries=N] [--delay-ms=N] [--json]
// Saida: exit 0 (TODOS os audits verdes) | exit 1 (qualquer audit falhou apos retries)

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RETRIES_PADRAO = 3;
const DELAY_PADRAO_MS = 30000;

/** Layout do npm varia por plataforma (ver comentario em run-checks-parallel.cjs). */
function resolveNpmCli() {
  const dirNode = path.dirname(process.execPath);
  const candidates = [
    path.join(dirNode, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(dirNode, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const NPM_CLI = resolveNpmCli();
const AUDIT_ARGS = ["audit", "--audit-level=high"];

/** Alvos canonicos (os mesmos dois audits que o merge-gate executava em sequencia). */
const AUDIT_TARGETS = [
  { id: "raiz", cwd: ROOT, comando: `npm ${AUDIT_ARGS.join(" ")}` },
  { id: "backend", cwd: path.join(ROOT, "backend"), comando: `npm ${AUDIT_ARGS.join(" ")}` },
];

/**
 * Classifica a causa da falha a partir da saida do npm audit. A classificacao e
 * INFORMATIVA (nunca converte falha em sucesso): vulnerabilidade real high/critical
 * x instabilidade de registry x causa desconhecida.
 */
function classifyAuditFailure(output) {
  const txt = String(output || "");
  if (/found \d+ vulnerabilit/i.test(txt) || /\d+\s+(high|critical)\s+severity/i.test(txt)) {
    return "vulnerabilidade";
  }
  if (/npm ERR!|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENOTFOUND|ENETUNREACH|socket hang up|50[0-9]|429/i.test(txt)) {
    return "registry";
  }
  return "desconhecida";
}

/** Exit code agregado: NUNCA zero diante de qualquer falha (invariante do C2). */
function exitCodeFor(results) {
  return results.every((r) => r && r.ok === true) ? 0 : 1;
}

/**
 * Executa UM audit com retry. Runner injetavel (testes usam runner fake: nunca rede).
 * runner(target, tentativa) -> Promise<{code, output}>
 */
async function runAudit(target, opts = {}) {
  const retries = Number.isInteger(opts.retries) ? opts.retries : RETRIES_PADRAO;
  const delayMs = Number.isInteger(opts.delayMs) ? opts.delayMs : DELAY_PADRAO_MS;
  const runner = opts.runner;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log || ((msg) => process.stdout.write(`${msg}\n`));

  let ultimaSaida = "";
  let ultimaCausa = null;
  for (let tentativa = 1; tentativa <= retries; tentativa++) {
    const res = await runner(target, tentativa);
    if (res && res.code === 0) {
      return { id: target.id, ok: true, tentativas: tentativa, causa: null, saida: res.output || "" };
    }
    ultimaSaida = (res && res.output) || "";
    ultimaCausa = classifyAuditFailure(ultimaSaida);
    if (tentativa < retries) {
      log(`[audit:${target.id}] tentativa ${tentativa}/${retries} falhou (${ultimaCausa}) — retry em ${Math.round(delayMs / 1000)}s`);
      await sleep(delayMs);
    }
  }
  return { id: target.id, ok: false, tentativas: retries, causa: ultimaCausa, saida: ultimaSaida };
}

/** Roda todos os alvos concorrentemente; agrega sem mascarar falhas. */
async function runAudits(targets, opts = {}) {
  const results = await Promise.all(targets.map((t) => runAudit(t, opts)));
  return { ok: exitCodeFor(results) === 0, results };
}

/** Runner default: spawn do npm audit com saida prefixada por origem (sem shell). */
function makeSpawnRunner(log) {
  return (target) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [NPM_CLI, ...AUDIT_ARGS], {
        cwd: target.cwd,
        env: { ...process.env, FORCE_COLOR: "0" },
      });
      let collected = "";
      let buffer = "";
      const flush = (chunk) => {
        collected += chunk;
        buffer += chunk;
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const linha = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          log(`[audit:${target.id}] ${linha}`);
        }
      };
      child.stdout.on("data", (c) => flush(String(c)));
      child.stderr.on("data", (c) => flush(String(c)));
      child.on("error", (err) => resolve({ code: 1, output: `spawn falhou: ${err.message}` }));
      child.on("close", (code) => {
        if (buffer) log(`[audit:${target.id}] ${buffer}`);
        resolve({ code: code === 0 ? 0 : code || 1, output: collected });
      });
    });
}

async function main() {
  const argv = process.argv.slice(2);
  const num = (flag, dflt) => {
    const a = argv.find((x) => x.startsWith(`${flag}=`));
    if (!a) return dflt;
    const v = Number(a.slice(flag.length + 1));
    return Number.isInteger(v) && v >= 0 ? v : dflt;
  };
  const json = argv.includes("--json");
  const opts = {
    retries: num("--retries", RETRIES_PADRAO),
    delayMs: num("--delay-ms", DELAY_PADRAO_MS),
    runner: makeSpawnRunner((m) => process.stdout.write(`${m}\n`)),
  };
  process.stdout.write(
    `[run-audits-parallel] ${AUDIT_TARGETS.length} audits em paralelo (retry ${opts.retries}x${Math.round(opts.delayMs / 1000)}s)\n`,
  );
  const { ok, results } = await runAudits(AUDIT_TARGETS, opts);
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok, results: results.map((r) => ({ ...r, saida: r.saida.slice(-2000) })) }, null, 2)}\n`);
  } else {
    for (const r of results) {
      process.stdout.write(
        `[run-audits-parallel] ${r.ok ? "OK" : "FALHA"} ${r.id} — ${r.ok ? `verde em ${r.tentativas} tentativa(s)` : `bloqueia (${r.tentativas} tentativa(s), causa: ${r.causa})`}\n`,
      );
    }
    process.stdout.write(
      ok
        ? "AUDITS VERDES (raiz + backend)\n"
        : "AUDIT BLOQUEANTE — vulnerabilidade ou registry indisponivel; veredito de fix e humano\n",
    );
  }
  process.exit(exitCodeFor(results));
}

module.exports = { runAudits, runAudit, exitCodeFor, classifyAuditFailure, AUDIT_TARGETS, RETRIES_PADRAO, DELAY_PADRAO_MS };

if (require.main === module) main();
