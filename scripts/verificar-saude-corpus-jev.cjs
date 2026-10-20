#!/usr/bin/env node
/**
 * scripts/verificar-saude-corpus-jev.cjs
 * PATCH-JEV-CORPUS-GUARD-20261004 (sob work_id FRAME-JEV-BICEFALO-20260924) — guarda de
 * SAÚDE do corpus do decisor JEV, acoplada à passada SEMANAL (scripts/prune-semanal.cjs).
 *
 * POR QUE ESTE SCRIPT EXISTE
 * Em 2026-10-04 o corpus do JEV ficou SEM SINAL em 867/869 turnos Auto (envelope do
 * provider mudou; `jev_confidence`/`jev_probabilities` 100% NULL) e NADA alarmou — a
 * descoberta só veio ~10 dias depois, na calibração. Esta guarda transforma essa
 * "assinatura do silêncio" em banner AUDÍVEL na cadência semanal.
 *
 * NATUREZA (mesmo contrato de verificar-flips-pendentes.cjs)
 *  - READ-ONLY: apenas SELECT. Nunca escreve.
 *  - NÃO-BLOQUEANTE: exit 0 SEMPRE no modo padrão, mesmo com achados. É alerta,
 *    não gate de merge. Promoção a required check segue NÃO decidida.
 *  - --loud (decisão Igor 2026-10-08, sessão ZCode — aviso LOUD não-bloqueante):
 *    modo do watchdog agendado (.github/workflows/jev-corpus-watchdog.yml) —
 *    exit 1 em FALHA DE INFRAESTRUTURA ou com ACHADO (vermelho), 0 em saudável/
 *    avisos. O workflow roda em CRON (nunca em PR): vermelho não bloqueia merge
 *    nenhum — só acende o Actions e abre/atualiza issue dedup. O contrato do
 *    modo padrão (exit 0 sempre) permanece intacto para o ritual semanal.
 *  - NUNCA "verde mudo": sem fonte de dados alcançável o banner é de FALHA DE
 *    INFRAESTRUTURA ("varredura NÃO concluída — NÃO tratar como sem achados").
 *
 * FONTE DE DADOS (em ordem)
 *  1. JEV_CORPUS_ROWS_JSON=<path> — array JSON de linhas (offline/testes, determinístico);
 *  2. psql com JEV_DATABASE_URL || DATABASE_PUBLIC_URL || DATABASE_URL (SELECT-only).
 *     Nota: produção vive em host privado; rode sob `railway run --service Postgres
 *     node scripts/verificar-saude-corpus-jev.cjs` (expõe DATABASE_PUBLIC_URL). O
 *     watchdog agendado usa o segredo DATABASE_URL (mesma credencial, via psql).
 *
 * Uso:
 *   node scripts/verificar-saude-corpus-jev.cjs [--days N] [--loud] [--help]
 *
 * REGRA DE INVOCAÇÃO (EXECUCAO_CLI/.clinerules): rodar DIRETO, sem redirecionar stdout
 * nem pipe — o harness emite falso "stdout is not a tty" e corrompe o exit code.
 */
"use strict";

const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const {
  ALARMS,
  JANELA_DIAS_DEFAULT,
  evaluateCorpusHealth,
} = require("./lib/jev-corpus-health.cjs");

const AJUDA = process.argv.includes("--help") || process.argv.includes("-h");
const LOUD = process.argv.includes("--loud");
const diasIdx = process.argv.indexOf("--days");
const dias = (() => {
  const bruto = diasIdx >= 0 ? Number.parseInt(process.argv[diasIdx + 1] ?? "", 10) : NaN;
  return Number.isFinite(bruto) && bruto > 0 ? bruto : JANELA_DIAS_DEFAULT;
})();

/** Query read-only da janela (`dias` é NUMÉRICO validado — nunca interpola texto livre). */
function montarQuery(d) {
  return (
    "SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (" +
    "SELECT auto_mode, jev_choice, jev_confidence, jev_probabilities, jev_model, fallback_reason " +
    "FROM reasoning_shadow_log " +
    `WHERE created_at > now() - interval '${String(d)} days'` +
    ") t;"
  );
}

/** URL do banco — NUNCA é impressa. */
function resolverUrl() {
  return process.env.JEV_DATABASE_URL || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || "";
}

/**
 * Carrega as linhas: fixture JSON (determinística) OU psql read-only.
 * Devolve { ok: true, rows, fonte } | { ok: false, motivo } — nunca lança.
 */
function carregarLinhas() {
  const fixture = process.env.JEV_CORPUS_ROWS_JSON;
  if (fixture && fixture.trim() !== "") {
    try {
      const rows = JSON.parse(fs.readFileSync(fixture, "utf8"));
      if (!Array.isArray(rows)) return { ok: false, motivo: `fixture não é array JSON: ${fixture}` };
      return { ok: true, rows, fonte: `fixture ${fixture}` };
    } catch (err) {
      return { ok: false, motivo: `fixture ilegível: ${fixture} (${err.message})` };
    }
  }

  const url = resolverUrl();
  if (url === "") {
    return {
      ok: false,
      motivo:
        "sem fonte de dados: defina JEV_CORPUS_ROWS_JSON ou uma URL (JEV_DATABASE_URL/DATABASE_PUBLIC_URL/DATABASE_URL)",
    };
  }
  const r = spawnSync("psql", [url, "-At", "-c", montarQuery(dias)], { encoding: "utf8" });
  if (r.error) return { ok: false, motivo: `psql indisponível (${r.error.message})` };
  if (r.status !== 0) {
    // stderr do psql pode conter host/usuário: reporta só a 1ª linha, nunca a URL.
    const primeira =
      String(r.stderr || "").split("\n").find((l) => l.trim() !== "") || `exit ${String(r.status)}`;
    return { ok: false, motivo: `psql falhou: ${primeira.trim()}` };
  }
  try {
    const rows = JSON.parse(String(r.stdout).trim() || "[]");
    if (!Array.isArray(rows)) return { ok: false, motivo: "resposta do psql não é array JSON" };
    return { ok: true, rows, fonte: `psql (janela ${String(dias)}d)` };
  } catch (err) {
    return { ok: false, motivo: `resposta do psql ilegível (${err.message})` };
  }
}

/** Detalhe humano de cada código (nunca inventa número: usa o medido). */
function detalhar(codigo, v) {
  switch (codigo) {
    case ALARMS.SEM_CONFIANCA:
      return `${String(v.autoN)} turno(s) Auto e ZERO com jev_confidence preenchida — assinatura de envelope quebrado (incidente 2026-10-04)`;
    case ALARMS.SEM_PROBABILIDADES:
      return "ZERO com jev_probabilities preenchidas — resposta do provider nao esta sendo lida";
    case ALARMS.SEM_MODELO:
      return "ZERO com jev_model preenchido — proveniencia ausente (meta da resposta nao chegou)";
    case ALARMS.MISMATCH_ALTO:
      return `${String(v.mismatchPct)}% em jev_contract_mismatch (> 10%) — contrato divergiu do provider`;
    case ALARMS.SEM_DECISAO:
      return `${String(v.autoN)} turnos Auto e NENHUM veredito venceu — pode ser limiar/calibracao (nao e defeito de contrato)`;
    default:
      return "(detalhe nao declarado)";
  }
}

/** Renderiza o relatório legível (pura sobre o veredito). */
function formatarRelatorio(veredito, fonte) {
  const linhas = [];
  linhas.push("=== SAUDE DO CORPUS JEV (guarda semanal — PATCH-JEV-CORPUS-GUARD-20261004) ===");
  linhas.push(`fonte: ${fonte}`);
  linhas.push(
    `turnos Auto: ${String(veredito.autoN)} | mismatch: ${String(veredito.mismatchN)} (${String(veredito.mismatchPct)}%) | ` +
      `confidence: ${String(veredito.confidenceFilledPct)}% | probabilities: ${String(veredito.probabilitiesFilledPct)}% | ` +
      `modelo: ${String(veredito.modelFilledPct)}% | decisao (veredito venceu): ${String(veredito.decisionRate)}%`,
  );
  for (const codigo of veredito.alarms) linhas.push(`ACHADO | ${codigo} | ${detalhar(codigo, veredito)}`);
  for (const codigo of veredito.avisos) linhas.push(`AVISO | ${codigo} | ${detalhar(codigo, veredito)}`);
  if (veredito.autoN === 0) {
    linhas.push("ℹ️ nenhum turno Auto na janela — nada a medir (não é verde de saúde).");
  }
  if (veredito.alarms.length === 0 && veredito.avisos.length === 0 && veredito.autoN > 0) {
    linhas.push("✅ corpus saudavel — contrato presente (confidence/probabilities/modelo) e sem mismatch alto.");
  }
  return linhas.join("\n");
}

function main() {
  if (AJUDA) {
    console.log("Uso: node scripts/verificar-saude-corpus-jev.cjs [--days N] [--loud] [--help]");
    console.log(`  (sem flag)   janela default ${String(JANELA_DIAS_DEFAULT)}d; exit 0 SEMPRE (nao-bloqueante)`);
    console.log(`  --days N     janela em dias (default ${String(JANELA_DIAS_DEFAULT)})`);
    console.log("  --loud       modo watchdog agendado: exit 1 em infra-failure/ACHADO, 0 em saudavel/aviso (CRON apenas — nunca required check)");
    console.log("  fonte        JEV_CORPUS_ROWS_JSON (fixture) OU psql com JEV_DATABASE_URL/DATABASE_PUBLIC_URL/DATABASE_URL");
    process.exit(0);
  }

  const carregado = carregarLinhas();
  if (!carregado.ok) {
    console.log("=== SAUDE DO CORPUS JEV (guarda semanal — PATCH-JEV-CORPUS-GUARD-20261004) ===");
    console.log(
      '⚠️ FALHA DE INFRAESTRUTURA — varredura NAO concluida; NAO tratar como "sem achados".\n' +
        `   motivo: ${carregado.motivo}\n` +
        (LOUD ? "   Modo --loud: exit 1 (aviso LOUD, nao-bloqueante — CRON nunca e required check).\n" : "   Alerta NAO-bloqueante (exit 0)."),
    );
    process.exit(LOUD ? 1 : 0);
  }

  const veredito = evaluateCorpusHealth(carregado.rows);
  console.log(formatarRelatorio(veredito, carregado.fonte));
  if (veredito.alarms.length > 0) {
    console.log(
      `⚠️ ${String(veredito.alarms.length)} ACHADO(S) — item OBRIGATORIO do relatorio desta sessao ao humano. ` +
        (LOUD ? "Modo --loud: exit 1 (CRON nunca e required check)." : "Alerta NAO-bloqueante (exit 0)."),
    );
  } else if (veredito.avisos.length > 0) {
    console.log(
      `⚠️ ${String(veredito.avisos.length)} AVISO(S) (ambar) — item do relatorio da sessao. ` +
        "Alerta NAO-bloqueante (exit 0).",
    );
  }
  process.exit(LOUD && veredito.alarms.length > 0 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { montarQuery, resolverUrl, carregarLinhas, formatarRelatorio, detalhar, main, dias };

