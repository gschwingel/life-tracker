#!/usr/bin/env node
/**
 * scripts/notificar-falha-cron.cjs
 * Proposito: canal de alerta para falhas de workflows agendados (P1b do painel
 * vital, DIR-HOMEOSTASE — decisão Igor 2026-10-01). Fecha o buraco "falha de
 * cron é silenciosa": todo workflow de cron com o job `alerta` (if: failure())
 * chama este script, que abre issue DEDUPLICADA no repo.
 *
 * Dedup: uma issue aberta por workflow+data-UTC (título fixo). Se já existe
 * issue aberta com o mesmo título, NÃO cria segunda — o run falho é anexado
 * como comentário (rastro de recorrência sem spam).
 *
 * Entrada (env): GH_TOKEN (github.token do run, com issues:write), WORKFLOW
 * (nome legível), RUN_URL (html_url do run falho), GITHUB_REPOSITORY.
 * Saida: stdout com a decisão (issue criada / comentário anexado / nada).
 * Erros: exit 1 se GH_TOKEN/WORKFLOW ausentes ou falha de API (fail-loud —
 *        o alerta não pode falhar em silêncio).
 * Idempotente: mesma chamada no mesmo dia não duplica issue.
 */
'use strict';

const { spawnSync } = require('child_process');

const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const WORKFLOW = process.env.WORKFLOW || '';
const RUN_URL = process.env.RUN_URL || '';
const REPO = process.env.GITHUB_REPOSITORY || '';
// Evento do run (GITHUB_EVENT_NAME é injetado pelo runner) — entra no corpo para que
// a triagem distinga cron de PR/dispatch. Origem: #1497/#1504 rotuladas "cron falhou"
// com runs event=pull_request (PATCH-ALERTA-CRON-FALSO-POSITIVO-20261019).
const EVENTO = process.env.GITHUB_EVENT_NAME || '(nao informado)';

function gh(args) {
  const r = spawnSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN },
  });
  if (r.status !== 0) {
    process.stderr.write(`gh ${args.join(' ')} falhou (exit ${r.status}): ${(r.stderr || '').slice(0, 300)}\n`);
    process.exit(1);
  }
  return (r.stdout || '').trim();
}

function dataUtc() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  if (!GH_TOKEN || !WORKFLOW || !REPO) {
    process.stderr.write('🔴 notificar-falha-cron — GH_TOKEN/WORKFLOW/GITHUB_REPOSITORY ausentes no ambiente\n');
    process.exit(1);
  }
  const titulo = `🔴 cron falhou: ${WORKFLOW} — ${dataUtc()}`;
  const corpo = [
    `Workflow agendado **${WORKFLOW}** terminou em falha.`,
    '',
    `Run: ${RUN_URL || '(sem URL)'} | Data UTC: ${dataUtc()} | Evento: \`${EVENTO}\` | Emissor: alerta-falha-cron (automático, sem intervenção humana na abertura)`,
    '',
    'Triagem: abrir o run, diagnosticar (ambiente antes de diff — lição FR-SINTESE-FERRAMENTAS-2-20260928 T2), fechar a issue com a causa.',
  ].join('\n');

  // Dedup: issue ABERTA com o mesmo título (workflow + data UTC).
  const existentes = gh(['issue', 'list', '--repo', REPO, '--state', 'open', '--search', `in:title "${titulo}"`, '--json', 'number,title,url']);
  let dup;
  try {
    const arr = JSON.parse(existentes || '[]');
    dup = Array.isArray(arr) ? arr.find((i) => i.title === titulo) : undefined;
  } catch {
    dup = undefined;
  }
  if (dup) {
    if (RUN_URL) {
      gh(['issue', 'comment', String(dup.number), '--repo', REPO, '--body', `Recorrência no mesmo dia UTC: ${RUN_URL}`]);
    }
    console.log(`✅ alerta deduplicado — issue #${dup.number} já aberta para "${titulo}"`);
    return;
  }
  const url = gh(['issue', 'create', '--repo', REPO, '--title', titulo, '--body', corpo]);
  console.log(`🔴 issue de alerta criada: ${url}`);
}

main();
