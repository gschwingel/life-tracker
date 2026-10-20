'use strict';

// Testes dos helpers puros do verificar-pontos-cegos (varredura read-only de
// pontos cegos fora do padrao de PR). Nenhum teste toca rede nem spawna os
// verificadores de verdade — apenas a logica de parsing/classificacao.

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parsePinsCharter,
  extrairVersaoFdv,
  extrairRefsRepo,
  extrairLinksMd,
  classificarRot,
  stripFences,
  eAreaHistorica,
  chavesMeta,
  blocosProsa,
  frasesDoBloco,
  eIsentoIAIA,
  listarEscopo,
  arquivosGovernados,
  avaliarMetaLinha,
  extrairHeaderVersion,
} = require('../verificar-pontos-cegos.cjs');

// -------------------------------------------------------------------------
// extrairHeaderVersion + paridade meta↔header (PATCH-GRAMMAR-PARIDADE-20261002)
// -------------------------------------------------------------------------

test('extrairHeaderVersion: le "**Version:** x.y.z" do corpo', () => {
  const t = 'meta: ... version=2.3.0 ...\n# Titulo\n**Version:** 2.3.0 | **Status:** APPROVED\n';
  assert.strictEqual(extrairHeaderVersion(t), '2.3.0');
});

test('extrairHeaderVersion: le variante "**Version**: x.y.z" (colon fora do bold)', () => {
  const t = '# doc\n**Version**: 1.33 | **Last update**: 2026-09-24\n';
  assert.strictEqual(extrairHeaderVersion(t), '1.33');
});

test('extrairHeaderVersion: ausente = null (só compara quando ambos existem)', () => {
  assert.strictEqual(extrairHeaderVersion('# doc sem header de versao\n'), null);
});

test('avaliarMetaLinha: expõe version da meta line (paridade)', () => {
  const r = avaliarMetaLinha('meta: format=AI-AI | version=2.3.0 | path=x.md\n');
  assert.strictEqual(r.version, '2.3.0');
});

// -------------------------------------------------------------------------
// parsePinsCharter — derivar pins da linha derived_from do charter
// -------------------------------------------------------------------------

const CABECALHO_V21 = `# ZCODE-BRACO-CHARTER v2.1
meta: format=AI-AI | audience=AI | density=max | version=2.1 | date=2026-09-22
  | status=APPROVED-FROZEN (human go 2026-09-22)
derived_from: FDV-Principal v33 | FDV-E v32 | FDV-Visual v4 — all FROZEN 2026-09-21,
  canonical at lila-zcode/src/prompts/Canonical/ | LILA-DEV: FDV-DEV + FDV-EXEC +
  FDV-PATCH + PROTOCOLO-TRANSVERSAL + PROTOCOLO-CANONICAL + PROTOCOLO-INDICES
pin_rule: versions above are PINS not copies
`;

test('parsePinsCharter extrai os 3 pins do cabecalho v2.1', () => {
  const { pins, erro } = parsePinsCharter(CABECALHO_V21);
  assert.strictEqual(erro, null);
  assert.deepStrictEqual(pins, [
    { nome: 'Principal', versao: 33 },
    { nome: 'E', versao: 32 },
    { nome: 'Visual', versao: 4 },
  ]);
});

test('parsePinsCharter sinaliza erro quando derived_from ausente', () => {
  const r = parsePinsCharter('# charter sem pin\npin_rule: nada aqui\n');
  assert.strictEqual(r.pins.length, 0);
  assert.match(r.erro, /ausente/);
});

test('parsePinsCharter ignora linhas derivadas sem pin FDV-N vN', () => {
  const r = parsePinsCharter('derived_from: nenhum pin aqui mas tem texto\n');
  assert.strictEqual(r.pins.length, 0);
  assert.match(r.erro, /nenhum pin/);
});

// -------------------------------------------------------------------------
// extrairVersaoFdv — versao declarada no head de cada FDV
// -------------------------------------------------------------------------

test('extrairVersaoFdv le "# FDV-Principal v33" no padrao real', () => {
  const head = '> preamble...\n\n# FDV-Principal v33 (Executor-MaxDensity) — SOURCE OF TRUTH\n';
  assert.strictEqual(extrairVersaoFdv(head, 'Principal'), 33);
});

test('extrairVersaoFdv le "**FDV-E v32" no padrao real', () => {
  const head = '**FDV-E v32 (Executor-MaxDensity) — EPISTEMOLOGICAL GOVERNANCE**\n**Version:** v32\n';
  assert.strictEqual(extrairVersaoFdv(head, 'E'), 32);
});

test('extrairVersaoFdv retorna null quando head nao declara versao', () => {
  assert.strictEqual(extrairVersaoFdv('# sem versao aqui\n', 'Visual'), null);
});

test('extrairVersaoFdv ignora versao declarada fora do head (30 primeiras linhas)', () => {
  const linhas = Array.from({ length: 40 }, (_, i) => `linha ${i}`);
  linhas[35] = '# FDV-Visual v99 declarado tarde demais';
  assert.strictEqual(extrairVersaoFdv(linhas.join('\n'), 'Visual'), null);
});

// -------------------------------------------------------------------------
// extrairRefsRepo — paths backtickados candidatos a verificacao
// -------------------------------------------------------------------------

test('extrairRefsRepo pega path backtickado enraizado no repo', () => {
  const md = 'Roda via `scripts/verificar-divida-patch.cjs` no gate.\n';
  assert.deepStrictEqual(extrairRefsRepo(md), ['scripts/verificar-divida-patch.cjs']);
});

test('extrairRefsRepo filtra urls, paths de fora do repo e relativos', () => {
  const md = [
    'Veja https://exemplo.com/a.md e o doc `../fora/repo.ts`.',
    'Tambem `package.json` (sem barra), `LILA-DEV/FDV-*.md` (glob) e `fix-{alvo}-{acao}.cjs`.',
    'E `LILA-DEV/execucao/patch-debt.json`.',
  ].join('\n');
  assert.deepStrictEqual(extrairRefsRepo(md), ['LILA-DEV/execucao/patch-debt.json']);
});

test('extrairRefsRepo ignora conteudo dentro de code fence', () => {
  const md = '```js\nconst x = require("scripts/fantasma.cjs");\n```\nsegue o texto\n';
  assert.deepStrictEqual(extrairRefsRepo(md), []);
});

test('extrairRefsRepo deduplica repeticoes', () => {
  const md = '`scripts/a.cjs` e de novo `scripts/a.cjs`\n';
  assert.deepStrictEqual(extrairRefsRepo(md), ['scripts/a.cjs']);
});

// -------------------------------------------------------------------------
// extrairLinksMd — links relativos .md
// -------------------------------------------------------------------------

test('extrairLinksMd pega link relativo .md e filtra url externa/ancora', () => {
  const md = [
    'Veja [guia](./TESTING.md) e [ancora](./OUTRO.md#secao).',
    'Nao conta [externo](https://a.com/b.md) nem [subir](../cima.md).',
  ].join('\n');
  assert.deepStrictEqual(extrairLinksMd(md), ['./TESTING.md', './OUTRO.md']);
});

// -------------------------------------------------------------------------
// classificarRot + eAreaHistorica
// -------------------------------------------------------------------------

test('classificarRot distingue vivo, orfao-testado e orfao-sem-teste', () => {
  assert.strictEqual(classificarRot({ referenciado: true, temTeste: false }), 'vivo');
  assert.strictEqual(classificarRot({ referenciado: false, temTeste: true }), 'orfao-testado');
  assert.strictEqual(classificarRot({ referenciado: false, temTeste: false }), 'orfao-sem-teste');
});

test('eAreaHistorica marca historico/planejamento/logs/evidencias/registry', () => {
  assert.ok(eAreaHistorica('LILA-DEV/historico/x.md'));
  assert.ok(eAreaHistorica('LILA-DEV/planejamento/backlog.md'));
  assert.ok(eAreaHistorica('LILA-DEV/execucao/logs-arquivo/2026.log.md'));
  assert.ok(eAreaHistorica('LILA-DEV/execucao/evidencias/e.md'));
  assert.ok(eAreaHistorica('LILA-DEV/execucao/auditorias/AK-X.md'));
  assert.ok(eAreaHistorica('LILA-DEV/auditorias/2026-10-07-auditoria-docs-vs-repo.md'));
  // D3 do item 4.7 (2026-10-16): area LOCAL gitignored (.gitignore:30) — evidencias de gate + rascunhos de
  // PR body; o scanner anda no filesystem e nao respeita .gitignore, entao ref morta aqui e informativa.
  assert.ok(eAreaHistorica('LILA-DEV/validacao/pr-body-bench-modelos.md'));
  assert.ok(eAreaHistorica('LILA-DEV/hardening/registry-ate-2026-09-25.md'));
  assert.ok(!eAreaHistorica('LILA-DEV/kfs/KF-X.md'));
  assert.ok(!eAreaHistorica('docs/TESTING.md'));
});

test('stripFences remove bloco cercado preservando texto fora', () => {
  const t = 'antes\n```js\ncode()\n```\ndepois\n';
  assert.strictEqual(stripFences(t), 'antes\n\ndepois\n');
});

// -------------------------------------------------------------------------
// Secao E — gramatica AI-IAIA (modo sombra): helpers puros de conformidade
// -------------------------------------------------------------------------

test('chavesMeta le as chaves fixas da meta line (AI-IAIA-GRAMMAR §2)', () => {
  const linha =
    'meta: format=AI-AI | audience=AI | human_readable=false | density=max | prose=0 | version=1.1.0 | last_update=2026-09-26 | status=APPROVED | path=docs/X.md';
  assert.deepStrictEqual(chavesMeta(linha), [
    'format',
    'audience',
    'human_readable',
    'density',
    'prose',
    'version',
    'last_update',
    'status',
    'path',
  ]);
});

test('chavesMeta tolera espacos em volta do = e ignora partes sem chave', () => {
  assert.deepStrictEqual(chavesMeta('meta: format = AI-AI | lixo | version=1.0.0'), ['format', 'version']);
});

test('blocosProsa ignora fences, headings, bullets, quote, tabela e meta', () => {
  const md = [
    '# Titulo',
    'meta: format=AI-AI',
    '- bullet um',
    '> citação',
    '| a | b | c | d |',
    '```js',
    'prosa(com.duas.Frases) dentro de fence',
    '```',
    'Prosa real com varias frases.',
  ].join('\n');
  const blocos = blocosProsa(md);
  assert.strictEqual(blocos.length, 1);
  assert.match(blocos[0].texto, /Prosa real/);
});

test('blocosProsa junta linhas continuas num unico bloco e reporta a linha 1-based', () => {
  const md = 'Prosa linha um\nprosa linha dois\n\nOutro bloco.';
  const blocos = blocosProsa(md);
  assert.strictEqual(blocos.length, 2);
  assert.strictEqual(blocos[0].linha, 1);
  assert.match(blocos[0].texto, /linha um prosa linha dois/);
  assert.strictEqual(blocos[1].linha, 4);
});

test('frasesDoBloco nao conta pontos de code span nem decimais como fim de frase', () => {
  assert.strictEqual(frasesDoBloco('Frase com `a.b.c` no meio e decimal 1.5 aqui.'), 1);
  assert.strictEqual(frasesDoBloco('Primeira frase. Segunda frase. Terceira frase.'), 3);
  assert.strictEqual(frasesDoBloco('So uma frase sem ponto final'), 1);
});

// -------------------------------------------------------------------------
// Secao E v2.0 — escopo governado + isencoes + audience=human (grammar §7)
// -------------------------------------------------------------------------

test('eIsentoIAIA cobre constituição por arquivo e Canonical/ por prefixo (B-2)', () => {
  assert.ok(eIsentoIAIA('LILA-DEV/FDV-EXEC.md'));
  assert.ok(eIsentoIAIA('LILA-DEV/PROTOCOLO-INDICES.md'));
  assert.ok(eIsentoIAIA('LILA-DEV/Canonical/FDV-PLAN.md'));
  assert.ok(eIsentoIAIA('LILA-DEV/kfs/kf-backend.md'));
  // FR-AIFIRST-DOCS-CLASS-N01: os 11 docs/ provisórios saíram da isenção —
  // reclassificados com meta line (audience=human × audience=AI)
  // SP-AI-ONLY-DOCS-20261020: docs/README.md virou artefato gerado (par docs-catalog)
  assert.ok(eIsentoIAIA('docs/README.md'));
  assert.ok(!eIsentoIAIA('docs/TESTING.md'));
  assert.ok(!eIsentoIAIA('docs/LOCALSTORAGE-KEYS.md'));
  assert.ok(!eIsentoIAIA('docs/AI-IAIA-GRAMMAR.md'));
  assert.ok(!eIsentoIAIA('docs/ANTI-STALL.md'));
  assert.ok(!eIsentoIAIA('LILA-DEV/planejamento/snapshots/frames/X.md'));
});

test('os 9 docs do antigo GRAMMAR_SCOPE permanecem sob a regua (B-3)', () => {
  const antigos = [
    'docs/AI-IAIA-GRAMMAR.md',
    'docs/AI-PROJECT-MANIFEST.md',
    'docs/TOOLUSE-PHASING.md',
    'docs/MCP-GRAFO.md',
    'docs/MCP-AUDITORIA.md',
    'docs/FLUXO-SESSAO-ISOLADA.md',
    'docs/ANTI-STALL.md',
    'docs/AI-ENV-PREREQUISITES.md',
    'docs/MSG-FORMAT-BLOCKS.md',
  ];
  const governados = arquivosGovernados();
  for (const rel of antigos) {
    assert.ok(governados.includes(rel), `${rel} deveria estar governado`);
    assert.ok(listarEscopo().includes(rel));
  }
});

test('escopo governado nao lista arquivo isento e cobre as 3 raizes do §7', () => {
  const escopo = listarEscopo();
  const governados = arquivosGovernados();
  assert.ok(escopo.length > governados.length, 'deve haver isentos no escopo');
  for (const rel of governados) {
    assert.ok(rel.startsWith('docs/') || rel.startsWith('LILA-DEV/') || rel.startsWith('LILA-DEV/kfs/'), rel);
    assert.ok(!eIsentoIAIA(rel));
  }
});

test('avaliarMetaLinha detecta meta ausente, chaves faltantes e audience=human (B-1/B-2)', () => {
  const semMeta = avaliarMetaLinha('# doc sem meta\n\nconteudo');
  assert.strictEqual(semMeta.temMeta, false);
  assert.strictEqual(semMeta.audienceHuman, false);
  assert.ok(semMeta.faltando.includes('format'));

  const humano =
    'meta: format=AI-AI | audience=human | human_readable=true | density=medium | prose=0 | version=1.0.0 | last_update=2026-09-29 | status=APPROVED | path=docs/X.md';
  const metaHumano = avaliarMetaLinha(humano);
  assert.strictEqual(metaHumano.temMeta, true);
  assert.strictEqual(metaHumano.audienceHuman, true);
  assert.deepStrictEqual(metaHumano.faltando, []);

  const ia =
    'meta: format=AI-AI | audience=AI | density=max | version=2.0.0 | last_update=2026-09-29 | status=APPROVED | path=docs/Y.md';
  const metaIA = avaliarMetaLinha(ia);
  assert.strictEqual(metaIA.temMeta, true);
  assert.strictEqual(metaIA.audienceHuman, false);
  assert.ok(metaIA.faltando.includes('human_readable') && metaIA.faltando.includes('prose'));
});
