#!/usr/bin/env node
/**
 * scripts/verificar-divida-patch.cjs
 * Proposito: verificador do ledger de dividas de patch
 * (LILA-DEV/execucao/patch-debt.json — append-only, Evento Deliberado
 * PATCH-OTIMIZACAO 2026-08-25, D1/D6). Lista dividas abertas por area e
 * responde se ha pagamento pendente: exit 1 quando existir divida aberta da
 * area do frame/patch atual OU divida aberta com idade > N dias (default 30).
 * EMENDA 2026-09-26 (veredito Igor — o P1 do M1 expos o defeito): o verificador
 * era CEGO ao campo `pagamentoExigido` (so o IMPRIMIA em verbose). Divida com
 * EXCECAO DATADA de adiamento (`excecao`) declara pagamento condicionado a um
 * gatilho nao disparado/veto de construcao: ela NAO conta para o exit code e e
 * impressa como "adiada por gatilho (excecao datada)". Semantica preservada
 * para dividas de contingencia ("proximo structural da area") e por idade.
 * Entrada: LILA-DEV/execucao/patch-debt.json (env PATCH_DEBT_JSON sobrepoe p/ testes)
 * Saida:   lista de dividas abertas (stdout) + exit code
 * Erros:   exit 1 se houver divida pendente de pagamento (area atual ou idade > dias),
 *          excluindo dividas com excecao datada de adiamento
 * Flags:
 *   --area <area>   area tatica do frame/patch atual (github|chat|drive|...)
 *   --days <N>      idade maxima aceitavel em dias (default 30)
 *   --verbose       exibe detalhes por divida
 */
const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');
const argArea = (() => {
  const i = process.argv.indexOf('--area');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
const argDays = (() => {
  const i = process.argv.indexOf('--days');
  return i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : 30;
})();

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Uso: node scripts/verificar-divida-patch.cjs [--area <area>] [--days <N>] [--verbose]');
  console.log('  --area <area>  area tatica do frame/patch atual (github|chat|drive|...)');
  console.log('  --days <N>     idade maxima aceitavel em dias (default 30)');
  console.log('  --verbose      exibe detalhes por divida');
  console.log('Exit: 0 = nenhum pagamento pendente | 1 = divida aberta da area ou com idade > days');
  console.log('      (dividas com excecao datada de adiamento nao contam para o exit code)');
  console.log('Saida programatica: avaliarDividas({debts, area, days, hoje}) — nucleo puro testavel');
  // Espelha o exit do CLI sem cortar o carregamento do modulo (testes usam require).
  if (require.main === module) process.exit(0);
}

const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH =
  process.env.PATCH_DEBT_JSON || path.join(REPO_ROOT, 'LILA-DEV', 'execucao', 'patch-debt.json');

function dataToDate(data) {
  // Formato esperado: "YYYY-MM-DD" (campo "data" do schema patch-debt.json v1)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function diasAberto(data) {
  const d = dataToDate(data);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/**
 * Divida com excecao datada de adiamento (veredito humano): pagamento
 * condicionado a gatilho nao disparado / veto de construcao registrado.
 * Nao conta para o exit code — o gate respeita o veto registrado.
 */
function dividaAdiada(d) {
  return typeof d.excecao === 'string' && d.excecao.trim() !== '';
}

/**
 * Nucleo PURO do verificador (testavel sem spawn): classifica as dividas
 * abertas e devolve o exit code canonico.
 * - pendentesAtivas: pagamento exigido agora (area atual ou idade > days);
 * - pendentesInativas: abertas, sem excecao, exibidas sem exigir pagamento;
 * - adiadas: abertas com excecao datada (informativo).
 */
function avaliarDividas({ debts, area = null, days = 30, hoje = new Date() }) {
  const lista = Array.isArray(debts) ? debts : [];
  const abertas = lista.filter((d) => d && d.status === 'aberta');
  const pendentesAtivas = [];
  const pendentesInativas = [];
  const adiadas = [];
  for (const d of abertas) {
    const dias = (() => {
      const dt = dataToDate(d.data);
      if (!dt) return null;
      return Math.floor((hoje.getTime() - dt.getTime()) / 86400000);
    })();
    const info = {
      d,
      dias,
      velha: dias !== null && dias > days,
      daArea: area !== null && d.area === area,
      adiada: dividaAdiada(d),
    };
    if (info.adiada) {
      adiadas.push(info);
      continue;
    }
    if (info.velha || info.daArea) pendentesAtivas.push(info);
    else pendentesInativas.push(info);
  }
  return {
    abertas,
    pendentesAtivas,
    pendentesInativas,
    adiadas,
    exitCode: pendentesAtivas.length > 0 ? 1 : 0,
  };
}

function main() {
  if (!fs.existsSync(LEDGER_PATH)) {
    console.log('✅ verificar-divida-patch — nenhum ledger encontrado (patch-debt.json ausente): sem dividas abertas.');
    return 0;
  }

  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch (e) {
    console.error(`🔴 patch-debt.json ilegivel: ${e.message}`);
    return 1;
  }

  const debts = Array.isArray(ledger.debts) ? ledger.debts : [];
  const avaliacao = avaliarDividas({ debts, area: argArea, days: argDays });
  const { abertas, pendentesAtivas, pendentesInativas, adiadas } = avaliacao;

  if (abertas.length === 0) {
    console.log('✅ verificar-divida-patch — ledger presente, nenhuma divida aberta (status "aberta" = 0).');
    if (debts.length > 0 && VERBOSE) console.log(`  (${debts.length} registro(s) no ledger, todos pagos)`);
    return 0;
  }

  console.log(`⚠️  ${abertas.length} divida(s) aberta(s) no ledger (total ${debts.length} registro(s)):`);
  console.log('');

  const porArea = new Map();
  for (const info of [...pendentesAtivas, ...pendentesInativas]) {
    if (!porArea.has(info.d.area)) porArea.set(info.d.area, []);
    porArea.get(info.d.area).push(info);
  }

  for (const [area, lista] of porArea) {
    console.log(`Área: ${area}`);
    for (const { d, dias, velha, daArea } of lista) {
      const marcas = [];
      if (daArea) marcas.push(`area atual (--area ${argArea})`);
      if (velha) marcas.push(`${dias}d > ${argDays}d`);
      console.log(`  - [${d.id}] ${d.tipo} | ${d.data} | ${d.descricao}${marcas.length > 0 ? ' | ⚠️ ' + marcas.join(' + ') : ''}`);
      if (VERBOSE) {
        console.log(`      patchId: ${d.patchId || '-'}`);
        console.log(`      skippedSteps: ${(d.skippedSteps || []).join(', ') || '-'}`);
        console.log(`      pagamentoExigido: ${d.pagamentoExigido || '-'}`);
      }
    }
    console.log('');
  }

  if (adiadas.length > 0) {
    console.log(`⏸️  ${adiadas.length} divida(s) adiada(s) por gatilho (excecao datada — nao contam para o exit code):`);
    for (const { d } of adiadas) {
      console.log(`  - [${d.id}] ${d.tipo} | ${d.data} | ${d.descricao}`);
      console.log(`      excecao: ${d.excecao}`);
      if (VERBOSE) {
        console.log(`      patchId: ${d.patchId || '-'}`);
        console.log(`      pagamentoExigido: ${d.pagamentoExigido || '-'}`);
      }
    }
    console.log('');
  }

  if (pendentesAtivas.length > 0) {
    console.error(`🔴 Pagamento de divida exigido: ${pendentesAtivas.length} divida(s) pendente(s) (area atual e/ou idade > ${argDays}d).`);
    console.error('Regra D6 (FDV-PATCH DIVIDA_EXPLICITA): o proximo estrutural da area DEVE pagar a divida.');
    console.error('Pague com: npm run debt:pay (npm run indices && npm run test:ci && npm run indices:check && npm run indices:status).');
    console.error('Apos pagar, marque status="paga" + pagoEm no ledger e rode este verificador de novo.');
    return 1;
  }

  console.log('✅ verificar-divida-patch — dividas abertas existem, mas nenhum pagamento e exigido agora');
  console.log(
    `   (sem divida da area atual${argArea ? ' ' + argArea : ''} e todas com idade <= ${argDays}d${adiadas.length > 0 ? `; ${adiadas.length} adiada(s) por gatilho — excecao datada)` : ')'}.`,
  );
  return 0;
}

module.exports = { avaliarDividas, dividaAdiada, diasAberto, dataToDate, main };

if (require.main === module) process.exit(main());
