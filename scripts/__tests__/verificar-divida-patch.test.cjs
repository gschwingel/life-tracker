'use strict';

// Testes do nucleo PURO do verificar-divida-patch (ledger de dividas de patch).
// Cobrem a EMENDA 2026-09-26 (veredito Igor, P1 do M1): divida com excecao datada
// de adiamento NAO conta para o exit code; divida de contingencia vencida/da area
// continua exigindo pagamento (exit 1) — o contrato do CLI nao muda.

const { test } = require('node:test');
const assert = require('node:assert');
const { avaliarDividas, dividaAdiada, dataToDate, diasAberto } = require('../verificar-divida-patch.cjs');

const HOJE = new Date(2026, 8, 26); // 2026-09-26

function debito(over = {}) {
  return {
    id: 'PATCH-TESTE-001',
    patchId: 'PATCH-TESTE',
    data: '2026-09-20',
    area: 'ferramentas',
    tipo: 'gates',
    descricao: 'faltou o gate',
    skippedSteps: ['passo pulado'],
    pagamentoExigido: 'proximo patch da area',
    status: 'aberta',
    ...over,
  };
}

test('divida com excecao datada NAO e pendente (exit 0) e sai na lista de adiadas', () => {
  const r = avaliarDividas({
    debts: [debito({ excecao: 'ADIAMENTO formal por veredito Igor 2026-09-26' })],
    area: 'ferramentas',
    days: 30,
    hoje: HOJE,
  });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.pendentesAtivas.length, 0);
  assert.strictEqual(r.adiadas.length, 1);
  assert.strictEqual(r.adiadas[0].d.id, 'PATCH-TESTE-001');
});

test('excecao vazia/somente espacos NAO adia — segue pendente', () => {
  for (const valor of ['', '   ']) {
    const r = avaliarDividas({ debts: [debito({ excecao: valor })], area: 'ferramentas', days: 30, hoje: HOJE });
    assert.strictEqual(r.exitCode, 1);
    assert.strictEqual(r.adiadas.length, 0);
  }
});

test('divida de contingencia da area atual segue exigindo pagamento (exit 1)', () => {
  const r = avaliarDividas({ debts: [debito()], area: 'ferramentas', days: 30, hoje: HOJE });
  assert.strictEqual(r.exitCode, 1);
  assert.strictEqual(r.pendentesAtivas.length, 1);
  assert.strictEqual(r.pendentesAtivas[0].daArea, true);
});

test('divida vencida por idade exige pagamento mesmo fora da area (exit 1)', () => {
  const r = avaliarDividas({
    debts: [debito({ data: '2026-01-01' })],
    area: null,
    days: 30,
    hoje: HOJE,
  });
  assert.strictEqual(r.exitCode, 1);
  assert.strictEqual(r.pendentesAtivas[0].velha, true);
});

test('divida aberta, recente e de outra area nao e pendente nem adiada (exit 0)', () => {
  const r = avaliarDividas({ debts: [debito({ area: 'chat', data: '2026-09-25' })], area: 'ferramentas', days: 30, hoje: HOJE });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.pendentesAtivas.length, 0);
  assert.strictEqual(r.pendentesInativas.length, 1);
  assert.strictEqual(r.adiadas.length, 0);
});

test('divida paga nao entra em nenhuma lista (nem conta como aberta)', () => {
  const r = avaliarDividas({
    debts: [debito({ status: 'paga', pagoEm: '2026-09-26' })],
    area: 'ferramentas',
    days: 30,
    hoje: HOJE,
  });
  assert.strictEqual(r.abertas.length, 0);
  assert.strictEqual(r.exitCode, 0);
});

test('adiada nao esconde a contingencia pendente na mesma area (exit 1)', () => {
  const r = avaliarDividas({
    debts: [
      debito({ id: 'A', excecao: 'ADIAMENTO formal por veredito Igor 2026-09-26' }),
      debito({ id: 'B' }),
    ],
    area: 'ferramentas',
    days: 30,
    hoje: HOJE,
  });
  assert.strictEqual(r.exitCode, 1);
  assert.deepStrictEqual(r.pendentesAtivas.map((i) => i.d.id), ['B']);
  assert.deepStrictEqual(r.adiadas.map((i) => i.d.id), ['A']);
});

test('divida sem data valida nao e considerada velha (mas segue na area)', () => {
  const r = avaliarDividas({ debts: [debito({ data: 'data-invalida', area: 'chat' })], area: null, days: 30, hoje: HOJE });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.pendentesInativas.length, 1);
  assert.strictEqual(r.pendentesInativas[0].dias, null);
});

test('ledger vazio ou malformado nao quebra e nao exige pagamento', () => {
  for (const debts of [[], undefined, null, 'nao-array']) {
    const r = avaliarDividas({ debts, area: 'ferramentas', days: 30, hoje: HOJE });
    assert.strictEqual(r.exitCode, 0);
    assert.strictEqual(r.abertas.length, 0);
  }
});

test('helpers: dividaAdiada so aceita string nao vazia; dataToDate/diasAberto formatam YYYY-MM-DD', () => {
  assert.strictEqual(dividaAdiada({ excecao: 'x' }), true);
  assert.strictEqual(dividaAdiada({ excecao: '  ' }), false);
  assert.strictEqual(dividaAdiada({}), false);
  assert.strictEqual(dividaAdiada({ excecao: 42 }), false);
  assert.strictEqual(dataToDate('2026-09-26').getFullYear(), 2026);
  assert.strictEqual(dataToDate('26/09/2026'), null);
  assert.strictEqual(diasAberto('data-ruim'), null);
});
