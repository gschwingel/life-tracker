#!/usr/bin/env node
/**
 * scripts/sondar-health-prod.cjs
 * P2 — painel vital (decisão Igor 2026-10-01). Reescrito em node por
 * PATCH-HEALTH-SONDA-NODE-20261003.
 *
 * POR QUE ESTE SCRIPT EXISTE
 * O smoke do deploy.yml (5x15s sobre GET /api/v1/health) so prova a infra NO
 * DEPLOY; entre deploys a saude da producao era esperanca. Este script roda em
 * cron (.github/workflows/health-prod-probe.yml, a cada 6h) e denuncia queda:
 * falha => job `alerta` abre issue deduplicada (P1b, notificar-falha-cron.cjs).
 * Nao conserta nada: denuncia.
 *
 * HISTORICO DO DEFEITO (por que reescrita)
 * O 1o run (2026-10-01 22:54Z) morreu em 34s: passo `shell: powershell` em
 * ubuntu-latest (powershell nao existe la; so pwsh) E logica de contagem
 * quebrada ($falhas++ executava mesmo com sonda OK => vermelho sempre).
 * Codigo embutido em YAML sem self-test = classe do defeito; aqui a logica é
 * testavel (fetch e delays injetaveis) e o workflow so chama `node`.
 *
 * CONTRATO
 * - GET {BASE_URL}/api/v1/health; sucesso = HTTP 200.
 * - Ate 2 sondas; cada sonda = ate 3 tentativas com pausa entre elas.
 * - Sonda 1 falhou => pausa maior antes da sonda 2 (absorve blip de rota/rede).
 * - exit 1 SOMENTE com 2 sondas falhadas (producao realmente fora).
 * - exit 2 sem BASE_URL (fail-closed: secret ausente e LOUD, nunca silencioso).
 * - READ-ONLY: nunca conserta, nunca escreve, nunca dispara workflow.
 *
 * USO
 *   RAILWAY_PUBLIC_URL=https://... node scripts/sondar-health-prod.cjs
 *   node scripts/sondar-health-prod.cjs --url https://... [--json]
 *
 * Sem dependencia externa: fetch global (Node 20+) + AbortSignal.timeout.
 */
"use strict";

const DEFAULTS = {
  tentativasPorSonda: 3,
  pausaTentativaMs: 15000,
  sondas: 2,
  pausaEntreSondasMs: 60000,
  timeoutMs: 30000,
};

/**
 * Uma tentativa de GET com teto de tempo. Pura via injecao (fetchImpl).
 * Retorna { ok, status, erro } — nunca lanca.
 */
async function tentarUmaVez(url, fetchImpl, timeoutMs) {
  const doFetch = fetchImpl || globalThis.fetch;
  try {
    const resposta = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    if (resposta && resposta.status === 200) return { ok: true, status: 200, erro: null };
    return { ok: false, status: resposta ? resposta.status : null, erro: "HTTP " + (resposta ? resposta.status : "sem-resposta") };
  } catch (err) {
    return { ok: false, status: null, erro: (err && err.message) ? err.message : String(err) };
  }
}

/**
 * Uma sonda completa: ate `tentativas` GETs com pausa entre eles.
 * Pausa injetavel (pausaFn) para o self-test nao dormir de verdade.
 */
async function executarSonda({ url, fetchImpl, tentativas, pausaTentativaMs, timeoutMs, pausaFn }) {
  const esperar = pausaFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const tentativasFeitas = [];
  for (let i = 1; i <= tentativas; i += 1) {
    const resultado = await tentarUmaVez(url, fetchImpl, timeoutMs);
    tentativasFeitas.push(resultado);
    if (resultado.ok) return { ok: true, tentativasFeitas };
    if (i < tentativas) await esperar(pausaTentativaMs);
  }
  return { ok: false, tentativasFeitas };
}

/**
 * Orquestracao das sondas. Logica separada do IO para o self-test:
 * ok se QUALQUER sonda passar (a 1a sonda ok encerra — producao saudavel);
 * todas falharam => { ok: false }.
 */
async function sondar({ url, fetchImpl, pausaFn, opcoes }) {
  const cfg = Object.assign({}, DEFAULTS, opcoes || {});
  const sondasFeitas = [];
  for (let s = 1; s <= cfg.sondas; s += 1) {
    const sonda = await executarSonda({ url, fetchImpl, tentativas: cfg.tentativasPorSonda, pausaTentativaMs: cfg.pausaTentativaMs, timeoutMs: cfg.timeoutMs, pausaFn });
    sondasFeitas.push(sonda);
    if (sonda.ok) return { ok: true, sondasFeitas };
    if (s < cfg.sondas) await (pausaFn || ((ms) => new Promise((r) => setTimeout(r, ms))))(cfg.pausaEntreSondasMs);
  }
  return { ok: false, sondasFeitas };
}

/** Relatorio ASCII (uma linha por tentativa) + veredicto. Puro. */
function formatarRelatorio(url, resultado) {
  const linhas = [];
  linhas.push("=== sonda health producao :: " + url + " ===");
  for (let s = 0; s < resultado.sondasFeitas.length; s += 1) {
    const sonda = resultado.sondasFeitas[s];
    linhas.push("sonda " + (s + 1) + ": " + (sonda.ok ? "OK" : "FALHOU"));
    for (const t of sonda.tentativasFeitas) {
      linhas.push("  tentativa: " + (t.ok ? "[OK] 200" : "[FALHA] " + (t.erro || ("HTTP " + t.status))));
    }
  }
  linhas.push(resultado.ok ? "producao saudavel (200 em alguma sonda)" : "##[error]producao sem 200 em " + resultado.sondasFeitas.length + " sonda(s) consecutiva(s) -- alerta visivel, nunca silencioso");
  return linhas.join("\n");
}

/** Parser minimo de flags (sem dependencia nova, nao-interativo). */
function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const saida = { url: null, json: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") saida.json = true;
    else if (arg === "--url") {
      saida.url = args[i + 1] || null;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      saida.help = true;
    } else {
      throw new Error("flag desconhecida: " + arg);
    }
  }
  return saida;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write("[health-probe] ERRO: " + (err && err.message ? err.message : String(err)) + "\n");
    return 2;
  }
  if (opts.help) {
    process.stdout.write("uso: node scripts/sondar-health-prod.cjs [--url BASE_URL] [--json]\nenv: RAILWAY_PUBLIC_URL (ou --url)\n");
    return 0;
  }

  const base = (opts.url || process.env.RAILWAY_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) {
    process.stderr.write("[health-probe] ERRO: RAILWAY_PUBLIC_URL vazio — crie o secret de repo (pendencia humana); fail-closed, nunca silencioso\n");
    return 2;
  }

  const resultado = await sondar({ url: base + "/api/v1/health" });

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: resultado.ok, url: base + "/api/v1/health", sondasFeitas: resultado.sondasFeitas }) + "\n");
  } else {
    process.stdout.write(formatarRelatorio(base + "/api/v1/health", resultado) + "\n");
  }
  return resultado.ok ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((err) => {
      process.stderr.write("[health-probe] ERRO inesperado: " + (err && err.message ? err.message : String(err)) + "\n");
      process.exitCode = 1;
    });
}

module.exports = { DEFAULTS, tentarUmaVez, executarSonda, sondar, formatarRelatorio, parseArgs, main };
