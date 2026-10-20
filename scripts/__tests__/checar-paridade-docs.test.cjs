'use strict';

// Testes do core puro do checador de paridade (instruct-first, nunca bloqueia).

const { test } = require('node:test');
const assert = require('node:assert');
const { checarParidade } = require('../checar-paridade-docs.cjs');

test('checarParidade: version da meta != header => desvio com instrução pronta', () => {
  const docs = [{
    arquivo: 'docs/x.md',
    texto: 'meta: format=AI-AI | version=2.3.0 | path=docs/x.md\n# x\n**Version:** 2.2.0 | **Status:** APPROVED\n',
  }];
  const r = checarParidade(docs);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].arquivo, 'docs/x.md');
  assert.strictEqual(r[0].metaVersion, '2.3.0');
  assert.strictEqual(r[0].headerVersion, '2.2.0');
  assert.match(r[0].instrucao, /\*\*Version:\*\* 2\.3\.0/);
});

test('checarParidade: paridade ok => sem desvio', () => {
  const docs = [{
    arquivo: 'docs/x.md',
    texto: 'meta: version=2.3.0 | path=docs/x.md\n**Version:** 2.3.0\n',
  }];
  assert.strictEqual(checarParidade(docs).length, 0);
});

test('checarParidade: sem header de versão => ignorado (não vira falso positivo)', () => {
  const docs = [{
    arquivo: 'docs/y.md',
    texto: 'meta: version=1.0 | path=docs/y.md\n# sem header\n',
  }];
  assert.strictEqual(checarParidade(docs).length, 0);
});

test('checarParidade: sem meta line => ignorado', () => {
  const docs = [{ arquivo: 'docs/z.md', texto: '# z\n**Version:** 9.9\n' }];
  assert.strictEqual(checarParidade(docs).length, 0);
});
