#!/usr/bin/env node
/* eslint-disable no-unused-vars */
/**
 * scripts/gerar-indice-rastreabilidade.cjs
 * Proposito: gera LILA-DEV/indice-rastreabilidade.json (nó -> snapshot/log/integridade)
 * a partir do grafo.json e dos logs de execucao.
 * Entrada: LILA-DEV/planejamento/grafo.json + LILA-DEV/execucao/logs/ e logs-arquivo/
 * Saida:   LILA-DEV/indice-rastreabilidade.json
 * Erros:   exit 1 em falha de leitura do grafo ou escrita do indice.
 *
 * FR-ESTADO-EFETIVO-IA-20260921 (decisão Igor: "o foco total do grafo é leitura
 * de IA"): o índice é a superfície derivada que a IA lê — além do `estado` cru
 * (verdade de execução), cada nó carrega:
 *   - `deprecated: true` (presente SÓ em nós mortos — ausência = vivo);
 *   - `estadoEfetivo`: colapso unívoco estado×deprecated — "⚫" para mortos,
 *     o próprio `estado` para vivos. IA que lê UM campo lê a verdade inteira.
 * No grafo canônico as duas dimensões seguem ortogonais (estado = execução;
 * campo deprecated = morte, veredito 2026-08-31); o colapso acontece APENAS
 * aqui, na camada derivada de leitura.
 *
 * AUDITORIA-DOCS-REPO-20261008 (evento deliberado Igor em sessão ZCode): a coleta
 * passa a incluir TODO nó com `id` — antes, nó sem snapshot desaparecia
 * silenciosamente do índice (3 sprints SP-BOOT ficaram invisíveis por 3 semanas,
 * janela de cegueira do âncora §2 A4). Sem snapshot a entrada nasce
 * `snapshot: null` e a regra de integridade existente já a classifica 🔴
 * (e ⚫ se deprecated) — supernotificação em vez de omissão.
 *
 * AUDITORIA-DOCS-REPO-20261009 (N-01; evento deliberado Igor em sessão ZCode,
 * critério declarado: "leitura e compreensão de estado por IA — maior qualidade
 * de propriocepção"; evidência: LILA-DEV/auditorias/2026-10-09-auditoria-docs-vs-repo.md):
 * a busca de log passa a cobrir TAMBÉM o archive do prune semanal
 * (`LILA-DEV/execucao/logs-arquivo/`; o log quente ganha). `logExiste` (bool)
 * morre em favor de `logCaminho` (caminho real da evidência ou null —
 * auto-descritivo: prefixo logs-arquivo/ = armazenamento frio). Semântica da
 * integridade: 🟢 = snapshot + log (quente OU arquivado — trilha verificável);
 * 🟡 = snapshot sem log NENHUM (gap real); 🔴 = sem snapshot. Antes, 150 nós com
 * trilha completa carregavam 🟡 falso — o farol só olhava o quente e degradava
 * monotonicamente a cada prune.
 */
const fs = require('fs');
const path = require('path');
const { lerExistente, jsonIgualSemVolateis } = require('./lib/conteudo-estavel.cjs');

const VOLATEIS = new Set(['geradoEm', 'generatedAt', 'data_geracao']);

const VERBOSE = process.argv.includes('--verbose');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Uso: node scripts/gerar-indice-rastreabilidade.cjs [--verbose]');
  console.log('  --verbose  exibe logs de progresso (padrao: silencioso)');
  process.exit(0);
}

let grafo;
try {
  grafo = JSON.parse(fs.readFileSync('LILA-DEV/planejamento/grafo.json', 'utf8'));
} catch (e) {
  console.error('Erro lendo grafo.json:', e.message);
  process.exit(1);
}

// Mapeia todos os nós independente da estrutura
function coletarNos(obj, resultado = {}) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (const item of obj) coletarNos(item, resultado);
    } else {
      if (obj.id) {
        const entrada = {
          id: obj.id,
          pai: obj.pai || null,
          estado: obj.estado || 'unknown',
          // AUDITORIA-DOCS-REPO-20261008: snapshot ausente vira null explícito —
          // o nó permanece no índice e a integridade o marca 🔴 (nunca omitir).
          snapshot: obj.snapshot || null,
          depende_de: obj.depende_de || [],
          desbloqueia: obj.desbloqueia || [],
          titulo: obj.titulo || null,
          // FR-ESTADO-EFETIVO-IA: colapso unívoco para leitura de IA — morto
          // (campo deprecated) vira ⚫ independentemente do farol de execução.
          estadoEfetivo: obj.deprecated ? '⚫' : (obj.estado || 'unknown'),
        };
        if (obj.deprecated) entrada.deprecated = true;
        resultado[obj.id] = entrada;
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') coletarNos(v, resultado);
      }
    }
  }
  return resultado;
}

const nos = coletarNos(grafo);
// INDICES_OUT_DIR: redireciona a ESCRITA (default: raiz do repo) — usado pelo
// verificar-frescor-indices (comparação por conteúdo em tmp). Leituras seguem do cwd.
const OUT_DIR = process.env.INDICES_OUT_DIR || '.';

// Busca logs de execução — quente (logs/) ganha sobre o archive do prune
// semanal (logs-arquivo/) — AUDITORIA-DOCS-REPO-20261009 (N-01). Diretórios
// são opcionais (sandbox de teste / repo recém-clonado).
const logs = {};
const DIRS_DE_LOG = ['LILA-DEV/execucao/logs', 'LILA-DEV/execucao/logs-arquivo'];
for (const dirDeLog of DIRS_DE_LOG) {
  let entries;
  try {
    entries = fs.readdirSync(dirDeLog, { withFileTypes: true });
  } catch (e) { continue; /* dir opcional */ }
  for (const f of entries) {
    if (f.isFile() && f.name.endsWith('-log.md')) {
      const id = f.name.replace('-log.md', '');
      if (!logs[id]) logs[id] = path.join(dirDeLog, f.name).replace(/\\/g, '/');
    }
  }
}

const rastreabilidade = {
  // geradoEm removido (PATCH-PURGA-INATIVOS-20261006): wall clock aqui gerava
  // churn de diff a cada regen (conflitos em cadeia entre PRs abertos — drain
  // de 2026-10-06). Os gates de frescor ja stripam o campo; o git trail e o
  // registro de frescor.
  totalNos: Object.keys(nos).length,
  nos: {},
};

for (const [id, no] of Object.entries(nos)) {
  const hasSnapshot = no.snapshot ? fs.existsSync(no.snapshot) : false;
  const logCaminho = logs[id] || null;
  rastreabilidade.nos[id] = {
    ...no,
    snapshotExiste: hasSnapshot,
    logCaminho,
    integridade: hasSnapshot && logCaminho ? '🟢' : hasSnapshot ? '🟡' : '🔴',
  };
}

// SKIP-WRITE (fim do churn de timestamp, drenagem 2026-10-06): regen com
// conteúdo-útil idêntico ao commitado NÃO reescreve o arquivo — `geradoEm`
// congela na última mudança REAL de conteúdo e regen dupla em árvore imutável
// = diff zero ( Política: scripts/lib/conteudo-estavel.cjs; validadores já
// stripam geradoEm/generatedAt/data_geracao — verificar-frescor-indices).
const destino = path.join(OUT_DIR, 'LILA-DEV', 'indice-rastreabilidade.json');
const existente = lerExistente(destino);
if (jsonIgualSemVolateis(rastreabilidade, existente, VOLATEIS)) {
  let preservado = '?';
  try { preservado = JSON.parse(existente).geradoEm || '?'; } catch { /* já validado acima */ }
  console.log(`indice-rastreabilidade.json skip (conteúdo idêntico; geradoEm preservado: ${preservado})`);
} else {
  try {
    fs.writeFileSync(destino, JSON.stringify(rastreabilidade, null, 2));
  } catch (e) {
    console.error(`Erro ao gravar LILA-DEV/indice-rastreabilidade.json: ${e.message}`);
    process.exit(1);
  }
  console.log(`indice-rastreabilidade.json gerado (geradoEm ${rastreabilidade.geradoEm})`);
}

const total = Object.keys(rastreabilidade.nos).length;
const v = Object.values(rastreabilidade.nos).filter(n => n.integridade === '🟢').length;
const a = Object.values(rastreabilidade.nos).filter(n => n.integridade === '🟡').length;
const r = Object.values(rastreabilidade.nos).filter(n => n.integridade === '🔴').length;
console.log(`indice-rastreabilidade.json: ${total} nós | 🟢 ${v} | 🟡 ${a} | 🔴 ${r}`);
if (VERBOSE && total === 0) console.warn('Aviso: nenhum nó com snapshot encontrado no grafo.');
