#!/usr/bin/env node
/* eslint-disable no-unused-vars */
/**
 * Script de validação de integridade do sistema FDV
 * 
 * Validações:
 * 1. Todo nó no grafo tem snapshot existente?
 * 2. Todo nó 🟢 (executado e finalizado — régua canônica do farol, evento deliberado 2026-09-06) tem log de execução (rastro)?
 * 3. Todo log corresponde a um nó existente no grafo?
 * 4. Nenhum arquivo produzido por dois frames diferentes (conflito de ownership)
 * 
 * Entrada: grafo.json, LILA-DEV/execucao/logs/, snapshots, índices (fs)
 * Saída:   relatório estruturado (stdout) + exit code 0/1
 *        --indices-only: valida apenas a integridade dos índices vivos
 *        --full: merge com grafo-historico.json antes de validar
 *
 * REANC-L4 / I1 (2026-09-20): as checagens do INDICE REVERSO (fragmentos + manifest
 * + presenca de buscar-simbolo.cjs) SAIRAM da superficie ativa — o indice reverso,
 * seu gerador, o lookup e a lib/fragmentacao.cjs morreram por sentenca I1
 * (localizacao literal passa ao grep nativo). Vetorial e manifest seguem validados.
 * 
 * Exit code: 0 se tudo OK, 1 se houver inconsistências
 */
const fs = require('fs');
const path = require('path');

let erros = 0;
const relatorio = [];

function erro(msg) {
  erros++;
  relatorio.push(`🔴 ${msg}`);
}

function aviso(msg) {
  relatorio.push(`🟡 ${msg}`);
}

function ok(msg) {
  relatorio.push(`🟢 ${msg}`);
}

// Modo --indices-only: valida exclusivamente a sincronia dos índices (#5-#7 no
// documento LILA-DEV/INDICES.md), pulando grafo/snapshots/logs/ownership que
// têm ruído perene (logs órfãos e conflitos de ownership pré-existentes).
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Uso: node scripts/validar-integridade.cjs [--indices-only] [--full]');
  console.log('  --indices-only  valida apenas a sincronia dos índices (ignora grafo/logs/ownership)');
  console.log('  --full          merge com grafo-historico.json antes de validar');
  process.exit(0);
}
const INDICES_ONLY = process.argv.includes('--indices-only');
const FULL_MODE = process.argv.includes('--full');

if (!INDICES_ONLY) {
// --- 1. Carrega grafo ---
let grafo;
try {
  grafo = JSON.parse(fs.readFileSync('LILA-DEV/planejamento/grafo.json', 'utf8'));
  ok('grafo.json lido com sucesso');
} catch (e) {
  erro(`grafo.json não pode ser lido: ${e.message}`);
  process.exit(1);
}

// --- 1b. Modo --full: merge com grafo-historico.json ---
if (FULL_MODE) {
  const histPath = grafo.grafo_historico || 'LILA-DEV/planejamento/grafo-historico.json';
  try {
    if (fs.existsSync(histPath)) {
      const hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
      grafo.keyframes = [...grafo.keyframes, ...(hist.keyframes || [])];
      grafo.sprints = [...grafo.sprints, ...(hist.sprints || [])];
      grafo.frames = [...grafo.frames, ...(hist.frames || [])];
      if (hist.delegacoes_tecnicas_indice) {
        grafo.delegacoes_tecnicas_indice = {
          ...(grafo.delegacoes_tecnicas_indice || {}),
          ...hist.delegacoes_tecnicas_indice,
        };
      }
      ok(`grafo-historico.json carregado (+${(hist.keyframes || []).length} KF, +${(hist.sprints || []).length} SP, +${(hist.frames || []).length} FR)`);
    } else {
      aviso(`--full solicitado mas ${histPath} não encontrado`);
    }
  } catch (e) {
    aviso(`Erro ao carregar grafo histórico: ${e.message}`);
  }
}

// --- 2. Extrai todos os nós ---
function coletarNos(obj, resultado = {}) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (const item of obj) coletarNos(item, resultado);
    } else {
      if (obj.id && obj.snapshot) {
        resultado[obj.id] = obj;
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') coletarNos(v, resultado);
      }
    }
  }
  return resultado;
}

const nos = coletarNos(grafo);
ok(`Total de nós no grafo: ${Object.keys(nos).length}`);

// FRAME-LOTE-HIGIENE-GRAFO-20261006: universo dual para a EXPANSÃO de ids de
// log — um nó aposentado ao grafo-historico continua sendo alvo legítimo de um
// log de execução (o arquivo existe; a aposentadoria não apaga o rastro, e a
// composição do agregado que ficou no ativo depende dele). Sem merge de nós:
// as checagens de nó continuam escopadas ao ativo (ou a --full).
let nosHistorico = {};
try {
  const histPathIds = grafo.grafo_historico || 'LILA-DEV/planejamento/grafo-historico.json';
  if (fs.existsSync(histPathIds)) {
    nosHistorico = coletarNos(JSON.parse(fs.readFileSync(histPathIds, 'utf8')));
  }
} catch (e) {
  // histórico ilegível: expansão fica só com o ativo (comportamento anterior)
}

// Guard S3 (2026-09-06): nó presente nos arrays do grafo SEM campo snapshot é ERRO
// (apenas no modo normal — gate; --full mescla o histórico antes deste ponto).
// PATCH-GUARD-S3-PROPOSTA (2026-09-09): nós 🔴 (proposta/fase futura — ainda NÃO
// planejados por E3) são EXIMIDOS: snapshot não existe por definição até o
// planejamento; o nó entra no gate quando o E3 gera o snapshot (estado → 🟡).
// Caso vivo: SP-BENCH-MODELOS 🔴 placeholder sob KF-22 (decisão: não executar
// antes do MVP do KF-22 verde). Referência: PATCH-GUARD-S3-PROPOSTA-20260909-log.md
let semSnapshotDeclarado = 0;
if (!FULL_MODE) {
  for (const colecao of ['keyframes', 'sprints', 'frames']) {
    for (const no of grafo[colecao] || []) {
      if (no && no.id && !no.snapshot && no.estado !== "🔴") {
        semSnapshotDeclarado++;
        erro(`Nó ${no.id} não tem campo snapshot declarado (nós sem snapshot são invisíveis ao gate)`);
      }
    }
  }
}
if (semSnapshotDeclarado === 0 && !FULL_MODE) ok('Todos os nós têm campo snapshot declarado');

// --- 3. Valida snapshots ---
let snapshotsExistentes = 0;
let snapshotsFaltando = 0;

for (const [id, no] of Object.entries(nos)) {
  if (no.snapshot) {
    if (fs.existsSync(no.snapshot)) {
      snapshotsExistentes++;
    } else {
      snapshotsFaltando++;
      erro(`Snapshot ausente: ${no.snapshot} (nó ${id})`);
    }
  } else {
    erro(`Nó ${id} não tem snapshot declarado`);
  }
}

if (snapshotsFaltando === 0) {
  ok(`Todos os ${snapshotsExistentes} snapshots existem`);
} else {
  erro(`${snapshotsFaltando} snapshots ausentes de ${Object.keys(nos).length} nós`);
}

// --- 4. Valida logs de execução ---
const logsDir = 'LILA-DEV/execucao/logs';

// IDs que não produzem logs individuais (delegacões técnicas, nós deprecados, keyframes colapsados)
function isDelegacaoTecnica(id) {
  // Delegações técnicas: T01-T99, STT-N*, T-GH-*, T-CA-*
  return /^T\d{2}$/.test(id) || /^(STT|T-GH|T-CA)-\d{2}$/.test(id);
}
function isDeprecado(no) {
  // Canônico (2026-09-06): morte de nó é o CAMPO deprecated (veredito aplicado via
  // MCP/grafo-normalize). Nota contendo a palavra "deprecated" é texto técnico (ex.:
  // FR-18-SNAPSHOT-L2/MARCADOR citam sub-frames deprecados) — NÃO é morte de documento.
  return !!no.deprecated && typeof no.deprecated === 'object';
}

// Normaliza nome de log para o ID canônico, reconhecendo 3 convenções:
//   Fase 2/FDV: {ID}-log.md → {ID}
//   Fase 1:      Log {ID}.md → {ID}
//   Fase 1 alt:  log {ID}.MD → {ID}
//   Merge:       MERGE-{ID}.md → MERGE-{ID}  (não tem ID no grafo, será órfão legítimo)
function extrairIdDeLog(filename) {
  const semExt = filename.replace(/\.(md|MD)$/, '');
  // Caso 1: {ID}-log.md → {ID}
  if (/^(.+)-log$/i.test(semExt)) {
    return semExt.replace(/-log$/i, '');
  }
  // Caso 2: Log {ID}.md ou log {ID}.MD → {ID}
  const m = semExt.match(/^[Ll]og (.+)$/);
  if (m) return m[1];
  // Caso 3: fallback — retorna o nome como está (ex: MERGE-HARDENING-ONDAS-1-2)
  return semExt;
}

// Expande um ID de log merge em múltiplos IDs de nós do grafo.
// Ex: "SP-17-C-D-E" → ["SP-17-C", "SP-17-D", "SP-17-E"]
// Ex: "SP-CA-03-N03" → ["FR-CA-N03"]         (sprint prefix → frame real)
// Ex: "SP-CA-04-N05" → ["FR-CA-N05"]
// Ex: "KF-TEST-REGRESSION-FASE0" → ["KF-TEST-REGRESSION"]
// Ex: "KF-TEST-REGRESSION-FASE4-FASE5" → ["KF-TEST-REGRESSION"]
function expandirIdMerge(idCanonico) {
  const idsGrafoSet = new Set([...Object.keys(nos), ...Object.keys(nosHistorico)]);

  // Caso 1: ID já existe diretamente no grafo → sem expansão
  if (idsGrafoSet.has(idCanonico)) return [idCanonico];

  // Caso 2: Sprint merge serial: SP-17-C-D-E → SP-17-C, SP-17-D, SP-17-E
  // Padrão: SP-{N}-{LETRA}-{LETRA}-{LETRA}
  const sprintMerge = idCanonico.match(/^(SP-\d+-)([A-Z](?:-[A-Z])+)$/);
  if (sprintMerge) {
    const prefixo = sprintMerge[1];
    const letras = sprintMerge[2].split('-');
    const ids = letras.map(l => prefixo + l).filter(id => idsGrafoSet.has(id));
    if (ids.length > 0) return ids;
  }

  // Caso 3: Sprint frame: SP-CA-03-N03 → FR-CA-N03, SP-CA-04-N05 → FR-CA-N05
  // Padrão: SP-{PREFIXO}-{SPRINT}-N{FRAME} → FR-{PREFIXO}-N{FRAME}
  const sprintFrame = idCanonico.match(/^SP-([A-Z]+-\d+)-N(\d+)$/);
  if (sprintFrame) {
    const frameId = `FR-${sprintFrame[1]}-N${sprintFrame[2]}`;
    if (idsGrafoSet.has(frameId)) return [frameId];
  }

  // Caso 4: Keyframe por fase: KF-TEST-REGRESSION-FASE0 → KF-TEST-REGRESSION
  const kfFase = idCanonico.match(/^(KF-TEST-REGRESSION)-FASE/);
  if (kfFase && idsGrafoSet.has(kfFase[1])) return [kfFase[1]];

  // Caso 5: Log de sprint sem nó correspondente no grafo (ex: SP-15-A, SP-15-B)
  // prefixo "SP-15" não existe no grafo atual → órfão legítimo
  // Retorna array vazio para sinalizar que não expandiu para nenhum nó válido
  return [];
}

const idsGrafoLower = new Set(Object.keys(nos).map(id => id.toLowerCase()));
const logsExistentes = {};  // idCanonico (lowercase) → { filename, rawId, idsCobertos: [] }
const logsOrfaosLegitimos = [];

// --- 4a. Fonte primária: campo log_execucao no grafo.json ---
// Cada nó pode declarar o arquivo de log que cobre sua execução.
// Esta é a fonte canônica — prevalece sobre inferência por nome.
const logPorExecucao = {}; // id (lowercase) → filename
for (const [id, no] of Object.entries(nos)) {
  if (no.log_execucao && typeof no.log_execucao === 'string') {
    const filename = no.log_execucao;
    const key = id.toLowerCase();
    logPorExecucao[key] = filename;
    // Registra no logsExistentes imediatamente como fonte canônica
    logsExistentes[key] = { filename, rawId: id, idsCobertos: [id], fonte: 'log_execucao' };
  }
}

// --- 4b. Fonte secundária: inferência por nome de arquivo ---
try {
  const entries = fs.readdirSync(logsDir, { withFileTypes: true });
  for (const f of entries) {
    if (f.isFile() && /\.(md|MD)$/.test(f.name)) {
      const idCanonico = extrairIdDeLog(f.name);
      const idsExpandidos = expandirIdMerge(idCanonico);
      if (idsExpandidos.length > 0) {
        // Registra o log contra cada nó coberto (se já não tiver fonte canônica)
        for (const idExp of idsExpandidos) {
          const key = idExp.toLowerCase();
          if (!logsExistentes[key]) {
            logsExistentes[key] = { filename: f.name, rawId: idCanonico, idsCobertos: idsExpandidos, fonte: 'inferencia' };
          }
        }
      } else {
        // Log sem correspondência no grafo — órfão legítimo
        const key = idCanonico.toLowerCase();
        if (!logsExistentes[key]) {
          logsExistentes[key] = { filename: f.name, rawId: idCanonico, idsCobertos: [], fonte: 'inferencia' };
        }
        if (!idsGrafoLower.has(key) && !logPorExecucao[key]) {
          logsOrfaosLegitimos.push(f.name);
        }
      }
    }
  }
} catch (e) {
  erro(`Diretório de logs não encontrado: ${logsDir}`);
}

// --- 4c. Fonte terciária: logs arquivados (prune-historico — retenção diária)
// O prune move logs antigos de execucao/logs para execucao/logs-arquivo; um nó
// 🟢 cujo log foi arquivado continua com rastro válido — a composição S2 elimina
// o ruído perene "🟢 sem log de execução". Logs no arquivo NUNCA são órfãos.
const logsArquivoDir = 'LILA-DEV/execucao/logs-arquivo';
try {
  const entriesArquivo = fs.readdirSync(logsArquivoDir, { withFileTypes: true });
  for (const f of entriesArquivo) {
    if (f.isFile() && /\.(md|MD)$/.test(f.name)) {
      const idCanonico = extrairIdDeLog(f.name);
      const idsExpandidos = expandirIdMerge(idCanonico);
      for (const idExp of idsExpandidos) {
        const key = idExp.toLowerCase();
        if (!logsExistentes[key]) {
          logsExistentes[key] = { filename: f.name, rawId: idCanonico, idsCobertos: idsExpandidos, fonte: 'arquivo' };
        }
      }
    }
  }
} catch (e) {
  // diretório de arquivo inexistente = prune ainda não rodou; não é erro
}

// Logs órfãos: log sem IDs expandidos e sem correspondência no grafo → aviso
for (const [key, meta] of Object.entries(logsExistentes)) {
  if (meta.idsCobertos && meta.idsCobertos.length > 0) continue;
  if (!idsGrafoLower.has(key) && !logsOrfaosLegitimos.includes(meta.filename)) {
    logsOrfaosLegitimos.push(meta.filename);
  }
}
// Emite avisos para órfãos (fora do loop para não poluir entre linhas de progresso)
for (const orfao of logsOrfaosLegitimos) {
  aviso(`Log órfão (nó não existe no grafo): ${orfao}`);
}

// Composição (P1b — régua do farol 2026-09-06): agregado (KF/SP) 🟢 cujos filhos
// diretos TODOS têm rastro é verde legítimo — o rastro do agregado é a composição
// dos filhos (fecho até fixpoint, mesmo critério do one-shot de reclassificação).
const filhosPorPai = {};
for (const no of Object.values(nos)) {
  if (no.pai && typeof no.pai === 'string') {
    (filhosPorPai[no.pai] = filhosPorPai[no.pai] || []).push(no.id);
  }
}
// FRAME-LOTE-HIGIENE-GRAFO-20261006: filhos aposentados ao grafo-historico
// continuam compondo o rastro do agregado que ficou no ativo — o log existe;
// a aposentadoria do filho não pode apagar o rastro do pai. Só amplifica a
// cobertura (filhosPorPai vira superconjunto); nunca a reduz.
try {
  const histPathComp = grafo.grafo_historico || 'LILA-DEV/planejamento/grafo-historico.json';
  if (fs.existsSync(histPathComp)) {
    const histComp = JSON.parse(fs.readFileSync(histPathComp, 'utf8'));
    for (const colecao of ['keyframes', 'sprints', 'frames']) {
      for (const no of (histComp[colecao] || [])) {
        if (no && no.id && no.pai && typeof no.pai === 'string') {
          (filhosPorPai[no.pai] = filhosPorPai[no.pai] || []).push(no.id);
        }
      }
    }
  }
} catch (e) {
  // histórico ilegível: composição fica só com o ativo (comportamento anterior)
}
const verdesComposicao = (() => {
  const verde = new Set();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const no of Object.values(nos)) {
      if (verde.has(no.id)) continue;
      const filhos = filhosPorPai[no.id];
      if (!filhos || filhos.length === 0) continue;
      const todosOk = filhos.every((f) => logsExistentes[f.toLowerCase()] || verde.has(f));
      if (todosOk) { verde.add(no.id); mudou = true; }
    }
  }
  return verde;
})();

// Nós 🟢 (executado e finalizado — rastro obrigatório) sem log (excluindo delegacões técnicas, deprecados e keyframes colapsados que têm log em naming antigo)
const verdesSemLog = Object.values(nos).filter(n => {
  if (n.estado !== '🟢') return false;
  if (isDelegacaoTecnica(n.id)) return false;
  if (isDeprecado(n)) return false;
  if (verdesComposicao.has(n.id)) return false; // rastro por composição de filhos
  return !logsExistentes[n.id.toLowerCase()];
});

const colapsadosComLogAntigo = Object.values(nos).filter(n => {
  if (n.estado !== '🟢') return false;
  if (n.colapsado !== true) return false;
  return !logsExistentes[n.id.toLowerCase()];
});

// Keyframes colapsados com log em naming antigo: não reportar como erro
const verdesSemLogFiltrados = verdesSemLog.filter(n => !colapsadosComLogAntigo.includes(n));

if (verdesSemLog.length > 0) {
  if (colapsadosComLogAntigo.length > 0) {
    ok(`${colapsadosComLogAntigo.length} keyframes colapsados com log em naming antigo (Log {ID}.md) — não reportados como ausentes`);
  }
  if (verdesSemLogFiltrados.length > 0) {
    aviso(`${verdesSemLogFiltrados.length} nós marcados como 🟢 mas sem log de execução:`);
    for (const n of verdesSemLogFiltrados) {
      aviso(`  ${n.id} (${n.titulo || 'sem título'})`);
    }
  }
}

ok(`Total de logs: ${Object.keys(logsExistentes).length} (${logsOrfaosLegitimos.length} órfãos legítimos — bugfixes/UI/operacional)`);

// --- 5. Valida conflito de ownership (arquivo produzido por mais de 1 frame) ---
const ownership = {};
for (const [id, no] of Object.entries(nos)) {
  if (no.snapshot && fs.existsSync(no.snapshot)) {
    const c = fs.readFileSync(no.snapshot, 'utf8');
    const prodMatch = c.match(/(?:##\s*)?Arquivos\s+Produzidos\s*:?\s*\n([\s\S]*?)(?=\n(?:##\s*)?(?:[A-ZÀ-Ú][A-ZÀ-Ú\s]+:?\s*\n|$))/i);
    if (prodMatch) {
      const arquivos = prodMatch[1]
        .split('\n')
        .map(l => l.trim().replace(/^[-*]\s*/, ''))
        .filter(l => l.length > 0 && l.includes('/'));
      for (const arq of arquivos) {
        if (!ownership[arq]) ownership[arq] = [];
        ownership[arq].push(id);
      }
    }
  }
}

let conflitos = 0;
for (const [arq, donos] of Object.entries(ownership)) {
  if (donos.length > 1) {
    conflitos++;
    erro(`Conflito de ownership: ${arq} é produzido por ${donos.join(', ')}`);
  }
}

if (conflitos === 0) {
  ok('Nenhum conflito de ownership de arquivos');
} else {
  erro(`${conflitos} conflitos de ownership encontrados`);
}

} // fim de !INDICES_ONLY

// --- 6. Valida integridade do índice vetorial: sidecar ↔ .bin (FR-SEM-06/07) ---
try {
  const VETORIAL_JSON = 'indice-vetorial.json';
  const VETORIAL_BIN = 'indice-vetorial.bin';
  if (!fs.existsSync(VETORIAL_JSON) || !fs.existsSync(VETORIAL_BIN)) {
    aviso('Índice vetorial ausente (indice-vetorial.json ou .bin) — rode npm run indices');
  } else {
    const sidecar = JSON.parse(fs.readFileSync(VETORIAL_JSON, 'utf8'));
    const binSize = fs.statSync(VETORIAL_BIN).size;
    const chunks = sidecar.chunks || [];

    if (!Array.isArray(chunks) || chunks.length === 0) {
      erro('Índice vetorial sidecar sem chunks (índice vazio/inválido)');
    } else {
      // Regra: chunks.length × 1536 × 4 == .bin.size (Float32 = 4 bytes)
      const dims = typeof sidecar.dimensions === 'number' ? sidecar.dimensions : 1536;
      const expectedBytes = chunks.length * dims * 4;
      if (expectedBytes !== binSize) {
        erro(`Índice vetorial dessincronizado: sidecar espera ${expectedBytes} bytes, .bin tem ${binSize} — rode npm run indices (fricção mecânica) e, se persistir, diagnóstique (fricção cognitiva)`);
      } else {
        ok(`Índice vetorial sidecar↔bin consistente (${chunks.length} chunks × ${dims}d × 4 = ${binSize} bytes)`);
      }

      // Offsets monotônicos (cada chunk começa exatamente onde o anterior terminou)
      let prevEnd = 0;
      let offsetsOk = true;
      for (const c of chunks) {
        if (typeof c.offset !== 'number' || typeof c.length !== 'number') {
          offsetsOk = false;
          break;
        }
        if (c.offset !== prevEnd) {
          offsetsOk = false;
          break;
        }
        prevEnd += c.length;
      }
      if (!offsetsOk) {
        erro('Índice vetorial com offsets não-monotônicos no sidecar — reconstrua com npm run indices:vetorial');
      } else if (chunks.length > 0) {
        ok('Índice vetorial offsets monotônicos no sidecar');
      }
    }
  }
} catch (e) {
  aviso(`Problema validando índice vetorial: ${e.message}`);
}


// --- 7. Valida integridade estrutural do AI-PROJECT-MANIFEST (docfix SP-AI-WRITE-01) ---
// Guard contra a anomalia de bloco espelhado duplicado (header do documento colado no fim):
// o header '# AI-PROJECT-MANIFEST' DEVE aparecer exatamente 1× — qualquer duplicação
// indica corrupção estrutural (cópia antiga/driftada) e bloqueia a validação.
try {
  const MANIFEST_PATH = 'docs/AI-PROJECT-MANIFEST.md';
  if (!fs.existsSync(MANIFEST_PATH)) {
    aviso('AI-PROJECT-MANIFEST.md não encontrado');
  } else {
    const conteudo = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const headers = conteudo.match(/^# AI-PROJECT-MANIFEST.*$/gm) || [];
    if (headers.length !== 1) {
      erro(`AI-PROJECT-MANIFEST.md: header '# AI-PROJECT-MANIFEST' deve aparecer 1× (encontrado ${headers.length}) — bloco espelhado duplicado corrompe o documento; remova a cópia antiga no fim do arquivo`);
    } else {
      ok('AI-PROJECT-MANIFEST.md: header único (sem bloco espelhado duplicado)');
    }
  }
} catch (e) {
  aviso(`Problema validando AI-PROJECT-MANIFEST.md: ${e.message}`);
}

// --- Resumo ---
console.log('\n=== VALIDAÇÃO DE INTEGRIDADE FDV ===');
for (const linha of relatorio) {
  console.log(linha);
}
console.log(`\nTotal: ${erros > 0 ? '🔴 FALHA' : '🟢 OK'} — ${erros} erro(s) encontrado(s)`);

process.exit(erros > 0 ? 1 : 0);