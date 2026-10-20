#!/usr/bin/env node
/**
 * scripts/checar-paridade-docs.cjs
 * Proposito: checagem INSTRUCT-FIRST de paridade meta↔header para docs do
 * escopo governado da gramática AI-IAIA (§7), alterados num PR. NÃO BLOQUEIA:
 * a cobrança dura da regra vive na sentinela diária (verificar-pontos-cegos
 * §E, flip 2026-09-29). Aqui o gate DEVOLVE o texto pronto para colar quando
 * a version da meta line difere do campo irmão **Version:** do corpo — o
 * incidente de 2026-10-02 (meta 2.3.0 vs header 2.2.0 no próprio GRAMMAR,
 * invisível ao scanner) é a motivação (decisão Igor 2026-10-05, lote painel
 * vital: "instruct-first, dente duro só pós-migração").
 *
 * Comportamento: exit 0 SEMPRE (instruct-first); desvios impressos com a
 * linha de header pronta para colar. Base do diff via --base <sha> ou env
 * PR_BASE_SHA (padrão do pr-gate); sem base, não há faixa — exit 0 silencioso.
 *
 * Core puro exportado (checarParidade) para testes offline.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const { arquivosGovernados, avaliarMetaLinha, extrairHeaderVersion } = require('./verificar-pontos-cegos.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

/** Core puro: docs = [{ arquivo, texto }] → desvios com instrução pronta. */
function checarParidade(docs) {
  const desvios = [];
  for (const { arquivo, texto } of docs) {
    const meta = avaliarMetaLinha(texto);
    if (!meta.temMeta || !meta.version) continue;
    const headerVersion = extrairHeaderVersion(texto);
    if (!headerVersion) continue;
    if (meta.version !== headerVersion) {
      desvios.push({
        arquivo,
        metaVersion: meta.version,
        headerVersion,
        instrucao: `Substitua a linha do header por: **Version:** ${meta.version} | **Last update:** <YYYY-MM-DD> | **Status:** APPROVED`,
      });
    }
  }
  return desvios;
}

function arquivosAlterados(base) {
  const r = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' });
  return r.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Uso: node scripts/checar-paridade-docs.cjs --base <sha>');
    console.log('  Instruct-first: imprime a linha de header pronta para colar quando');
    console.log('  version da meta difere do **Version:** do corpo. Exit 0 sempre.');
    return 0;
  }
  const i = process.argv.indexOf('--base');
  const base = i !== -1 ? process.argv[i + 1] : process.env.PR_BASE_SHA || '';
  if (!base) {
    console.log('⚪ sem base de diff (PR_BASE_SHA/--base) — nada a checar');
    return 0;
  }
  let alterados;
  try {
    alterados = arquivosAlterados(base);
  } catch (e) {
    console.error(`ERRO de leitura do diff (infra, nao drift): ${e.message}`);
    return 2;
  }
  const governados = new Set(arquivosGovernados());
  const docs = [];
  for (const rel of alterados) {
    if (!governados.has(rel.replace(/\\/g, '/'))) continue;
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    docs.push({ arquivo: rel, texto: fs.readFileSync(abs, 'utf8') });
  }
  const desvios = checarParidade(docs);
  if (desvios.length === 0) {
    console.log('✅ paridade meta↔header OK nos docs governados alterados');
    return 0;
  }
  console.log(`⚠️  ${desvios.length} doc(s) com version da meta != **Version:** do corpo (nao bloqueia — cole o header corrigido):`);
  for (const d of desvios) {
    console.log(`  - ${d.arquivo}: meta=${d.metaVersion} vs header=${d.headerVersion}`);
    console.log(`    ${d.instrucao}`);
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { checarParidade };
