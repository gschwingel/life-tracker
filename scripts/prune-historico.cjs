#!/usr/bin/env node
/* eslint-disable no-unused-vars */
/**
 * prune-historico.cjs — degradação programada por tempo (retenção histórica).
 *
 * Política (canônica): histórico é rastro de auditoria, não lastro de decisão
 * (E-INV-13). Degradação por tempo:
 *   0–15 dias → detalhe completo (inalterado, canal ativo execucao/logs/)
 *   > 15 dias → arquivamento (movido para execucao/logs-arquivo/ — fora do canal ativo)
 *
 * Artefatos afetados: LILA-DEV/execucao/logs/ e pares de relatório de
 * backend/reports/ (PATCH-REPORTS-RETENCAO-20261003).
 * O CHANGELOG.md foi APOSENTADO (evento deliberado Igor 2026-10-05, aposentadoria
 * 2026-10-06): este script nunca o tocou desde FRAME-CHANGELOG-REFORM-20261001.
 * A cauda meta_* do AI-PROJECT-MANIFEST esta EXTINTA desde a v3.0 (estado puro por
 * construcao, MANIFEST-V3-ESTADO-PURO-N3 2026-09-08 — docs/AI-PROJECT-MANIFEST.md e
 * artefato gerado): este script NAO a emite, NAO a parseia, NAO a poda e NAO escreve
 * em docs/. Necropsia: LILA-DEV/historico/manifesto/NECROPSIA-CAUDA-META-2026-09-08.md.
 *
 * Uso:
 *   node scripts/prune-historico.cjs --dry-run          # relatório, zero escrita
 *   node scripts/prune-historico.cjs                    # aplica
 *   node scripts/prune-historico.cjs --base 2026-08-14  # data de referência
 */
const fs = require('fs');
const path = require('path');

// PRUNE_BASE_DIR: override para testes (sandbox temporário) — sem a env, comportamento idêntico.
const root = process.env.PRUNE_BASE_DIR || path.resolve(__dirname, '..');
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : new Date().toISOString().slice(0, 10);
const DRY = process.argv.includes('--dry-run');

const LOGS_DIR = path.join(root, 'LILA-DEV', 'execucao', 'logs');
// Retenção unificada: tudo com > 15 dias sai do canal ativo (execucao/logs/) e
// vai para execucao/logs-arquivo/ (fora do canal ativo — scanners do canal
// navegam apenas logs/). Política: 0-15d detalhe completo; > 15d arquivo morto.
const ARQ_DIR = path.join(root, 'LILA-DEV', 'execucao', 'logs-arquivo');
// Retenção dos pares de relatório de medição do backend (<tema>-<AAAA-MM-DD>.md|.json):
// mesma idade única — > 15 dias sai do
// canal ativo e vai para backend/reports/arquivo/ (par move inteiro, basename a basename).
const REPORTS_DIR = path.join(root, 'backend', 'reports');
const REPORTS_ARQ_DIR = path.join(REPORTS_DIR, 'arquivo');

const DAYS_1 = 15;

const MS_DAY = 24 * 60 * 60 * 1000;
function ms(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
function ageDays(iso) { return Math.floor((ms(BASE) - ms(iso)) / MS_DAY); }

function ensureDir(dir) { if (!DRY) fs.mkdirSync(dir, { recursive: true }); }

// report.changelog REMOVIDO (FRAME-CHANGELOG-REFORM-20261001; sistema inteiro
// aposentado em 2026-10-06 — evento deliberado Igor 2026-10-05).
// report.meta REMOVIDO: a cauda meta_* do Manifest esta extinta (v3.0, 2026-09-08).
const report = { logs: { keep: [], dehydrate: [], archive: [], noDate: [] }, relatorios: { keep: [], archive: [], noDate: [] } };

// ─────────────────────────────────────────────────────────────────────────────
// Cauda meta_* do AI-PROJECT-MANIFEST.md — EXTINTA (sem emissao, sem parsing,
// sem poda, sem escrita em docs/). Estado puro por construcao na v3.0
// (MANIFEST-V3-ESTADO-PURO-N3, 2026-09-08).
// Necropsia: LILA-DEV/historico/manifesto/NECROPSIA-CAUDA-META-2026-09-08.md.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 3. Logs de execução
// ─────────────────────────────────────────────────────────────────────────────
function extractLogDate(content, fname) {
  let m;
  if ((m = content.match(/\*\*Data:\*\*\s*(20\d{2}-\d{2}-\d{2})/i))) return m[1];
  if ((m = content.match(/\*\*Date:\*\*\s*(20\d{2}-\d{2}-\d{2})/i))) return m[1];
  if ((m = content.match(/^DATA:\s*(20\d{2}-\d{2}-\d{2})/im))) return m[1];
  if ((m = fname.match(/(20\d{2}-\d{2}-\d{2})/))) return m[1];
  if ((m = fname.match(/(20\d{2})(\d{2})(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}

function processLogs() {
  const files = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|MD|txt)$/.test(e.name)) files.push(p);
    }
  }
  walk(LOGS_DIR);

  const keep = [], dehydrate = [], archive = [], noDate = [];
  for (const f of files) {
    const rel = path.relative(LOGS_DIR, f).replace(/\\/g, '/');
    const content = fs.readFileSync(f, 'utf8');
    const date = extractLogDate(content, path.basename(f));
    if (!date) { noDate.push(rel); continue; }
    const d = ageDays(date);
    // Endpoint único de retenção: > 15 dias sai do canal ativo para logs-arquivo/.
    if (d > DAYS_1) archive.push({ rel, date });
    else keep.push(rel);
  }
  report.logs = { keep, dehydrate: [], archive, noDate };

  if (!DRY) {
    ensureDir(ARQ_DIR);
    for (const x of archive) fs.renameSync(path.join(LOGS_DIR, x.rel), path.join(ARQ_DIR, x.rel));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Relatórios de medição do backend (backend/reports/)
// ─────────────────────────────────────────────────────────────────────────────
function processReports() {
  if (!fs.existsSync(REPORTS_DIR)) return;
  const names = fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(md|json)$/.test(e.name))
    .map((e) => e.name);

  const keep = [], archive = [], noDate = [];
  for (const name of names) {
    // Convenção de nome (reports de medição): <tema>-<AAAA-MM-DD>.md|.json —
    // a data do basename é a fonte única de idade; arquivo sem data é mantido e reportado.
    const m = name.match(/(20\d{2}-\d{2}-\d{2})\.(md|json)$/);
    if (!m) { noDate.push(name); continue; }
    if (ageDays(m[1]) > DAYS_1) archive.push(name);
    else keep.push(name);
  }
  report.relatorios = { keep, archive, noDate };

  if (!DRY && archive.length > 0) {
    ensureDir(REPORTS_ARQ_DIR);
    for (const name of archive) fs.renameSync(path.join(REPORTS_DIR, name), path.join(REPORTS_ARQ_DIR, name));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Uso: node scripts/prune-historico.cjs [--dry-run] [--base YYYY-MM-DD]');
    console.log('  --dry-run       relatório (zero escrita)');
    console.log('  --base DATA     data de referência (padrão: hoje)');
    process.exit(0);
  }
  try {
    processLogs();
    processReports();
  } catch (e) {
    console.error(`Falha ao executar prune-historico: ${e.message}`);
    process.exit(1);
  }

  console.log('=== prune-historico ' + (DRY ? '(DRY-RUN)' : '(APLICADO)') + ' — base ' + BASE + ' ===');
  console.log('logs: manter=' + report.logs.keep.length + ' desidratar=' + report.logs.dehydrate.length + ' arquivar=' + report.logs.archive.length + ' semData=' + report.logs.noDate.length);
  if (report.logs.noDate.length > 0) console.log('  sem data (mantidos): ' + report.logs.noDate.join(', '));
  console.log('relatorios: manter=' + report.relatorios.keep.length + ' arquivar=' + report.relatorios.archive.length + ' semData=' + report.relatorios.noDate.length);
  if (report.relatorios.noDate.length > 0) console.log('  sem data (mantidos): ' + report.relatorios.noDate.join(', '));
  if (DRY) console.log('Nada foi escrito (dry-run).');
}

main();