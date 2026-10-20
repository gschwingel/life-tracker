#!/usr/bin/env node
/**
 * prune-semanal.cjs — retenção histórica SEMANAL (1x/semana — semana ISO) orquestrando
 * prune-historico.cjs.
 *
 * Política (FDV-EXEC E5 — RETENÇÃO_SEMANAL, EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001):
 * no fim do primeiro FDV-EXEC do dia o executor roda este script. O marcador
 * LILA-DEV/execucao/.prune-marker.json guarda a última SEMANA ISO verificada —
 * garante "1x por semana" sem depender de contexto de sessão (E-INV-13).
 *
 *   - Modo padrão: se marcador == semana ISO corrente -> skip silencioso (exit 0).
 *     Senão roda prune-historico.cjs --dry-run (zero escrita), grava o marcador e
 *     imprime o relatório (fica AGUARDANDO aprovação humana para aplicação).
 *   - --apply: aplica prune-historico.cjs de verdade + grava marcador. Chamado SOMENTE
 *     após aprovação humana explícita do dry-run (script é destrutivo).
 *   - --force: ignora o marcador e re-executa na mesma semana.
 *
 * Migração do marcador legado (retensão diária até 2026-10-01): um marker com apenas
 * `ultimaData` (sem `ultimaSemana`) é tratado como semana NÃO verificada — o prune
 * executa (conservador: é dry-run + aprovação humana) e regrava o formato novo.
 *
 * A semana ISO é calculada em UTC, coerente com a data (`hoje()`) passada ao
 * prune-historico — a fronteira local de segunda-feira pode deslocar horas, nunca
 * a política de idades (15/30d, por data).
 *
 * Guarda semanal de flips pendentes (LOTE-HIGIENE-FAROL-20261002, decisão Igor
 * 2026-10-02): ao fim de toda passada REAL (pós-gravarMarcador) o script roda
 * verificar-flips-pendentes.cjs — mesma cadência da retenção, logo 1x/semana na
 * primeira execução do dia que dispara a passada; o skip semanal pula a guarda junto.
 * NÃO-bloqueante por design: o exit do prune nunca reflete a guarda. Com achados,
 * o banner vira item OBRIGATÓRIO do relatório da sessão ao humano (flip com veredito
 * ou aposentadoria com nota ⚫ — nunca auto-flip). PRUNE_SEMANAL_SEM_GUARDA=1 desliga
 * (uso: suíte de testes nos casos que não exercitam a guarda).
 *
 * Guarda semanal de SAÚDE DO CORPUS JEV (PATCH-JEV-CORPUS-GUARD-20261004, sob o frame
 * FRAME-JEV-BICEFALO-20260924): na MESMA passada real o script roda
 * verificar-saude-corpus-jev.cjs — detecta o corpus do decisor Auto ficando SEM SINAL
 * (o incidente de 2026-10-04: 867/869 em `jev_contract_mismatch`, `jev_confidence` 100%
 * NULL) que antes só era descoberto na calibração, semanas depois. READ-ONLY e
 * NÃO-bloqueante pelo mesmo desenho do guard de flips (exit do prune nunca reflete a
 * guarda; achados = item OBRIGATÓRIO do relatório da sessão; sem fonte de dados
 * alcançável o banner é de FALHA DE INFRAESTRUTURA, nunca "sem achados").
 * Desligável por PRUNE_SEMANAL_SEM_GUARDA=1 (geral) ou JEV_SEMANAL_SEM_GUARDA=1 (dedicado).
 *
 * Uso:
 *   node scripts/prune-semanal.cjs          # 1x/semana — dry-run + marcador + aguarda aprovação
 *   node scripts/prune-semanal.cjs --apply  # aplica (após aprovação)
 *   node scripts/prune-semanal.cjs --force  # re-verifica na mesma semana
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// PRUNE_DIARIO_BASE_DIR: override para testes (sandbox temporário) — sem env, root real do repo.
const root = process.env.PRUNE_DIARIO_BASE_DIR || path.resolve(__dirname, '..');
const MARKER_PATH = path.join(root, 'LILA-DEV', 'execucao', '.prune-marker.json');
const PRUNE = path.join(__dirname, 'prune-historico.cjs');
const GUARDA_FLIPS = path.join(__dirname, 'verificar-flips-pendentes.cjs');
// PATCH-JEV-CORPUS-GUARD-20261004 — guarda de saúde do corpus do decisor JEV (read-only).
const GUARDA_JEV = path.join(__dirname, 'verificar-saude-corpus-jev.cjs');
// LOTE-HIGIENE-FAROL-20261002: desliga a guarda acoplada (suíte de testes; em produção
// não há motivo para desligar — a guarda é não-bloqueante e só-lê).
const GUARDA_DESLIGADA = process.env.PRUNE_SEMANAL_SEM_GUARDA === '1';
// PATCH-JEV-CORPUS-GUARD-20261004: a guarda JEV entra na MESMA cadência semanal. Desligável
// pelo switch geral (GUARDA_DESLIGADA, já usado pela suíte) ou pelo switch dedicado.
const JEV_GUARDA_DESLIGADA = GUARDA_DESLIGADA || process.env.JEV_SEMANAL_SEM_GUARDA === '1';

const FORCE = process.argv.includes('--force');
const APPLY = process.argv.includes('--apply');
const HELP = process.argv.includes('--help') || process.argv.includes('-h');

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Semana ISO 8601 de uma data (default: agora), em UTC — "2026-W40".
 * A quinta-feira da semana define o ano ISO; W01 é a semana da PRIMEIRA quinta do ano.
 */
function semanaISO(data = new Date()) {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const diaSeg = (d.getUTCDay() + 6) % 7; // segunda=0 .. domingo=6
  const quinta = new Date(d);
  quinta.setUTCDate(quinta.getUTCDate() - diaSeg + 3);
  const primeiraQui = new Date(Date.UTC(quinta.getUTCFullYear(), 0, 1));
  primeiraQui.setUTCDate(primeiraQui.getUTCDate() + ((4 - primeiraQui.getUTCDay() + 7) % 7));
  const semana = 1 + Math.round((quinta - primeiraQui) / (7 * 86400000));
  return `${quinta.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/**
 * H8 (complemento pós-sweep 2026-09-25, item 4) — a regra do `--apply` do E5 é uma
 * decisão pura e testável: o flag é a ÚNICA porta para escrita destrutiva, e ele
 * nunca pode ser inferido de outro flag. `--force` (re-verificar na mesma semana) e
 * `--apply` (aplicar de verdade) são eixos independentes:
 *   sem `--apply` → extraArgs = ['--dry-run'] (zero escrita, aguarda aprovação)
 *   com `--apply` → extraArgs = [] (aplica)
 * Extraído para o teste travar a regra sem tocar o filesystem.
 */
function extraArgsDoPrune({ apply }) {
  return apply ? [] : ["--dry-run"];
}

function lerMarcador() {
  try {
    return JSON.parse(fs.readFileSync(MARKER_PATH, 'utf8')).ultimaSemana || '';
  } catch {
    return '';
  }
}

function gravarMarcador(semana) {
  fs.mkdirSync(path.dirname(MARKER_PATH), { recursive: true });
  fs.writeFileSync(MARKER_PATH, JSON.stringify({ ultimaSemana: semana }, null, 2) + '\n', 'utf-8');
}

function rodarPrune(extraArgs) {
  return spawnSync(process.execPath, [PRUNE, '--base', hoje(), ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, PRUNE_BASE_DIR: root },
  });
}

function rodarGuardaFlips() {
  // LILA_GRAFO_PATH/LILA_FLIPS_LOG_DIR passam por {...process.env} — fixtures de teste.
  return spawnSync(process.execPath, [GUARDA_FLIPS], { encoding: 'utf8' });
}

function contarAchados(stdout) {
  return (String(stdout).match(/^ACHADO \|/gm) || []).length;
}

/**
 * Guarda semanal de flips pendentes, acoplada à passada real da retenção (decisão
 * Igor 2026-10-02). Chamada só depois de gravarMarcador — o skip semanal pula a
 * guarda junto. NÃO-bloqueante: nunca altera o exit do prune; achados viram item
 * obrigatório do relatório da sessão ao humano (nunca auto-flip).
 */
function rodarEReportarGuarda() {
  if (GUARDA_DESLIGADA) return;
  process.stdout.write('\n=== GUARDA SEMANAL DE FLIPS PENDENTES (acoplada à retenção — LOTE-HIGIENE-FAROL-20261002) ===\n');
  const g = rodarGuardaFlips();
  if (g.stdout) process.stdout.write(g.stdout);
  if (g.stderr) process.stderr.write(g.stderr);
  if (g.error || (g.status !== null && g.status !== 0)) {
    process.stdout.write(
      '⚠️ Guarda em FALHA DE INFRAESTRUTURA — varredura NÃO concluída; NÃO tratar como "sem achados".\n' +
      '   Verificar grafo/diretórios de log. Alerta NÃO-bloqueante (exit 0).\n'
    );
    return;
  }
  const n = contarAchados(g.stdout);
  if (n > 0) {
    process.stdout.write(
      `⚠️ ${n} ACHADO(S): nó(s) executado(s) e merged na main SEM flip 🟢 — item OBRIGATÓRIO do ` +
      'relatório desta sessão ao humano: para cada id, veredito humano (flip com evidência OU ' +
      'aposentadoria com nota ⚫). NUNCA auto-flip. Alerta NÃO-bloqueante (exit 0).\n'
    );
  } else {
    process.stdout.write('✅ Nenhum achado — nenhum frame/sprint com execução merged pendente de flip.\n');
  }
}

/**
 * PATCH-JEV-CORPUS-GUARD-20261004 — guarda de SAÚDE do corpus JEV, acoplada à passada real
 * (mesma cadência do guard de flips). READ-ONLY e NÃO-bloqueante: nunca altera o exit.
 * Achados viram item OBRIGATÓRIO do relatório da sessão ao humano — corpus sem sinal não
 * pode voltar a ser descoberto apenas na calibração.
 */
function rodarGuardaJev() {
  // env herdado (JEV_CORPUS_ROWS_JSON / JEV_DATABASE_URL / DATABASE_* passam direto).
  return spawnSync(process.execPath, [GUARDA_JEV], { encoding: 'utf8' });
}

function rodarEReportarGuardaJev() {
  if (JEV_GUARDA_DESLIGADA) return;
  process.stdout.write(
    '\n=== GUARDA SEMANAL DE SAUDE DO CORPUS JEV (acoplada à retenção — PATCH-JEV-CORPUS-GUARD-20261004) ===\n'
  );
  const g = rodarGuardaJev();
  if (g.stdout) process.stdout.write(g.stdout);
  if (g.stderr) process.stderr.write(g.stderr);
  if (g.error || (g.status !== null && g.status !== 0)) {
    process.stdout.write(
      '⚠️ Guarda JEV em FALHA DE INFRAESTRUTURA — varredura NÃO concluída; NÃO tratar como "sem achados".\n' +
        '   Alerta NÃO-bloqueante (exit 0).\n'
    );
    return;
  }
  const n = contarAchados(g.stdout);
  if (n > 0) {
    process.stdout.write(
      `⚠️ ${n} ACHADO(S) de corpus JEV — item OBRIGATÓRIO do relatório desta sessão ao humano ` +
        '(corpus sem sinal ⇒ a calibração futura mediria o vazio). Alerta NÃO-bloqueante (exit 0).\n'
    );
  }
}

function main() {
  if (HELP) {
    console.log('Uso: node scripts/prune-semanal.cjs [--apply] [--force]');
    console.log('  (sem flag)  dry-run 1x/semana (semana ISO) + grava marcador (aguarda aprovacao)');
    console.log('  --apply     aplica prune-historico.cjs (apos aprovacao humana)');
    console.log('  --force     ignora o marcador da semana');
    console.log('  guarda de flips roda acoplada ao fim da passada real (PRUNE_SEMANAL_SEM_GUARDA=1 desliga)');
  console.log('  guarda de saude do corpus JEV roda acoplada na mesma passada (JEV_SEMANAL_SEM_GUARDA=1 desliga)');
    process.exit(0);
  }

  const semana = semanaISO();
  const ultima = lerMarcador();

  if (!FORCE && !APPLY && ultima === semana) {
    console.log(`retenção semanal já verificada nesta semana (${semana}) — skip.`);
    process.exit(0);
  }

  const extra = extraArgsDoPrune({ apply: APPLY });
  const r = rodarPrune(extra);

  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stderr.write(r.stderr);

  if (r.status !== 0) {
    console.error(`[prune-semanal] falha ao executar prune-historico (exit ${String(r.status)}) — retenção não aplicada.`);
    process.exit(r.status || 1);
  }

  gravarMarcador(semana);
  console.log(`[prune-semanal] marcador atualizado: ${semana}`);
  if (!APPLY) {
    console.log('[prune-semanal] relatório dry-run acima — aguardando aprovação humana para --apply.');
  }
  rodarEReportarGuarda();
  rodarEReportarGuardaJev();
  process.exit(0);
}

if (require.main === module) main();

// H8 (item 4): exposto para teste da regra do `--apply` (guard acima garante que
// importar o módulo NÃO roda o prune).
module.exports = {
  extraArgsDoPrune,
  hoje,
  semanaISO,
  lerMarcador,
  gravarMarcador,
  rodarGuardaFlips,
  rodarGuardaJev,
  contarAchados,
  rodarEReportarGuarda,
  rodarEReportarGuardaJev,
  main,
};
