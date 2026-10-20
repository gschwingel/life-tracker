#!/usr/bin/env node
/**
 * scripts/verificar-sintese.cjs
 * Proposito: verificador do ledger de sintese pendente (F2 do
 * EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922). Leitura PURA — espelho de
 * verificar-divida-patch.cjs: conta as sinteses pendentes por area tattica e
 * bloqueia (exit 1) quando a area atinge o threshold de sintese-config.json
 * (a sintese e' friccao COGNITIVA: nunca pulavel com divida — o que e' mecanico
 * e' so o registro/verificacao).
 * Entrada: LILA-DEV/execucao/sintese-pendente.json (env SINTESE_JSON sobrepoe p/ testes)
 *          LILA-DEV/execucao/sintese-config.json (env SINTESE_CONFIG sobrepoe p/ testes)
 * Saida:   contagem por area (stdout) + exit code
 * Erros:   exit 1 = pendencia da area >= threshold (sintese exigida no escopo do estrutural)
 *          exit 2 = ledger/config ilegivel (falha FECHADA — nunca passa em silencio)
 *          ledger AUSENTE = exit 0 ("sem sintese pendente — ledger ausente")
 * Flags:
 *   --area <area>   avalia apenas a area (sem --area: avalia TODAS as areas)
 *   --verbose       lista os ids pendentes com idade em dias
 * Testes: scripts/__tests__/verificar-sintese.test.cjs (node --test)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_THRESHOLD = 3;

function caminhoLedger() {
  return process.env.SINTESE_JSON || path.join(REPO_ROOT, "LILA-DEV", "execucao", "sintese-pendente.json");
}

function caminhoConfig() {
  return process.env.SINTESE_CONFIG || path.join(REPO_ROOT, "LILA-DEV", "execucao", "sintese-config.json");
}

function imprimeUso() {
  console.log("Uso: node scripts/verificar-sintese.cjs [--area <area>] [--verbose]");
  console.log("  --area <area>  avalia apenas a area (sem a flag: todas as areas)");
  console.log("  --verbose      lista os ids pendentes com idade em dias");
  console.log("Exit: 0 = nenhuma area no threshold | 1 = pendencia >= threshold (consumir a sintese)");
  console.log("      2 = ledger/config ilegivel (falha fechada)");
}

/** Thresholds: sintese-config.json { default, areas { <area>: N } }. */
function carregarConfig() {
  const alvo = caminhoConfig();
  if (!fs.existsSync(alvo)) {
    return { ok: true, config: { default: DEFAULT_THRESHOLD, areas: {} }, aviso: `config ausente (${alvo}) — default ${DEFAULT_THRESHOLD}` };
  }
  try {
    const json = JSON.parse(fs.readFileSync(alvo, "utf8"));
    return {
      ok: true,
      config: {
        default: Number.isFinite(json && json.default) ? json.default : DEFAULT_THRESHOLD,
        areas: (json && json.areas) || {},
      },
      aviso: null,
    };
  } catch (e) {
    return { ok: false, motivo: `config ilegivel (${e.message})`, caminho: alvo };
  }
}

function thresholdDe(area, config) {
  const porArea = config.areas && Number.isFinite(config.areas[area]) ? config.areas[area] : null;
  return porArea === null ? config.default : porArea;
}

function dataToDate(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Idade da pendencia em dias (null quando a data e' invalida). */
function diasAberto(data) {
  const d = dataToDate(data);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ── Avaliacao ───────────────────────────────────────────────────────────────

/** Pendencias por area (status "pendente"; consumidas nao contam). Puro. */
function agruparPendentes(entradas) {
  const porArea = new Map();
  for (const e of entradas || []) {
    if (!e || e.status !== "pendente") continue;
    const area = e.area || "(sem area)";
    if (!porArea.has(area)) porArea.set(area, []);
    porArea.get(area).push(e);
  }
  return porArea;
}

/**
 * Avalia as areas (ou apenas areaFiltro). Puro.
 * Devolve { linhas: [{ area, pendentes, threshold, bloqueia }], bloqueios: [...] }
 */
function avaliar(entradas, config, areaFiltro) {
  const porArea = agruparPendentes(entradas);
  const areas = areaFiltro ? [areaFiltro] : [...porArea.keys()].sort();
  const linhas = areas.map((area) => {
    const pendentes = porArea.get(area) || [];
    const threshold = thresholdDe(area, config);
    return { area, pendentes, threshold, bloqueia: pendentes.length >= threshold };
  });
  return { linhas, bloqueios: linhas.filter((l) => l.bloqueia) };
}

function formatar(linhas, bloqueios, { verbose }) {
  if (linhas.length === 0) {
    console.log("✅ verificar-sintese — nenhuma sintese pendente registrada (ledger sem entradas pendentes).");
    return;
  }
  for (const l of linhas) {
    const marca = l.bloqueia ? "🔴" : "✅";
    console.log(`${marca} area ${l.area}: ${l.pendentes.length} pendente(s) | threshold ${l.threshold}`);
    if (verbose) {
      for (const p of l.pendentes) {
        console.log(`     - [${p.id}] ${p.patchId} | ${p.data} | ${diasAberto(p.data)}d | ${p.logPath}`);
      }
    }
  }
  if (bloqueios.length > 0) {
    console.error("");
    console.error(
      `🔴 verificar-sintese — sintese pendente no threshold: ${bloqueios.map((l) => `${l.area} (${l.pendentes.length} >= ${l.threshold})`).join(" | ")}`,
    );
    console.error("A sintese NAO e' pulavel com divida: e' friccao COGNITIVA — exige o escopo do estrutural (o que e' mecanico e' o registro no ledger).");
    console.error("Consuma com: npm run sintese:pay (ler os logs E3 pendentes + achados do sweep, destilar no snapshot da area, marcar consumo).");
    return;
  }
  console.log("✅ verificar-sintese — nenhuma area atingiu o threshold (exit 0).");
}

function main(argv) {
  const args = argv === undefined ? process.argv.slice(2) : argv;
  if (args.includes("--help") || args.includes("-h")) {
    imprimeUso();
    return 0;
  }
  const iArea = args.indexOf("--area");
  const area = iArea !== -1 && args[iArea + 1] && !String(args[iArea + 1]).startsWith("--") ? args[iArea + 1] : null;
  if (iArea !== -1 && area === null) {
    console.error("🔴 verificar-sintese — uso invalido: --area recebido sem valor");
    imprimeUso();
    return 2;
  }
  const verbose = args.includes("--verbose");

  const cfg = carregarConfig();
  if (!cfg.ok) {
    console.error(`🔴 verificar-sintese — ${cfg.motivo}: ${cfg.caminho}`);
    console.error("Falha FECHADA: threshold indeterminado — nunca trate como abaixo do threshold.");
    return 2;
  }
  if (cfg.aviso) console.log(`⚠️  ${cfg.aviso}`);

  const alvo = caminhoLedger();
  if (!fs.existsSync(alvo)) {
    console.log("✅ verificar-sintese — sem sintese pendente (ledger ausente)");
    return 0;
  }
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(alvo, "utf8"));
  } catch (e) {
    console.error(`🔴 verificar-sintese — ledger ilegivel: ${e.message} (${alvo})`);
    return 2;
  }
  if (!ledger || !Array.isArray(ledger.entradas)) {
    console.error(`🔴 verificar-sintese — ledger sem campo 'entradas' (schema sintese-pendente/v1): ${alvo}`);
    return 2;
  }

  const { linhas, bloqueios } = avaliar(ledger.entradas, cfg.config, area);
  formatar(linhas, bloqueios, { verbose });
  return bloqueios.length > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  REPO_ROOT,
  DEFAULT_THRESHOLD,
  caminhoLedger,
  caminhoConfig,
  carregarConfig,
  thresholdDe,
  diasAberto,
  agruparPendentes,
  avaliar,
  formatar,
  main,
};
