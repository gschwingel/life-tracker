#!/usr/bin/env node
/**
 * grafo-normalize.cjs — Normalização determinística de deprecations do grafo LILA.
 *
 * Referência: plano "MCP grafo + ledger de decisões" (aprovado 2026-08-27, modo ESTRUTURAL).
 * Evento Deliberado pendente de registro: override "colapsado = imutável" para a reescrita
 * histórica única (aplicar só ocorre após aprovação do diff por item — veto granular).
 *
 * Propósito:
 *   Extrair UNIDADES (decisões de negócio / comportamentos) dos snapshots, coletar as
 *   DECLARAÇÕES EXPLÍCITAS de deprecation (nota do nó começando com "DEPRECATED", campo
 *   superseded_by, headers "DEPRECATED (SP-LIMPEZA-OS — data)", anotações inline
 *   "→ DEPRECATED data:"), casar candidatos antigo→novo e emitir o ARTEFATO DE REVIEW
 *   numerado (C1..Cn) com evidência. Nada é gravado sem aprovação por item.
 *
 * Uso:
 *   node scripts/grafo-normalize.cjs                       → dry-run (default): imprime artefato, NÃO grava
 *   node scripts/grafo-normalize.cjs --dry-run --out <arquivo.json>  → grava artefato JSON p/ review
 *   node scripts/grafo-normalize.cjs --apply --review <arquivo.json> → grava ledger + campos estruturados
 *       (exige veredito "aprovar"|"reprovar" em TODOS os candidatos; reprovado fica ativo
 *        + flag revisao, reapresentado na próxima execução)
 *   node scripts/grafo-normalize.cjs --help
 *
 * Entradas: LILA-DEV/planejamento/grafo.json, grafo-historico.json, snapshots referenciados.
 * Saídas (--apply): LILA-DEV/planejamento/decisoes-ledger.json (schema v1 abaixo) + campos
 *   `deprecated` / `decisoes_deprecated` nos nós de grafo.json e grafo-historico.json.
 * PENDENTE (fase posterior, após aprovação do diff): reescrita dos .md de snapshot para o
 *   formato canônico com IDs de unidade — os campos estruturados são a fonte canônica.
 * Exit: 0 ok | 1 erro/gate falho | 2 uso inválido.
 *
 * SCHEMA v1 do ledger (decisoes-ledger.json):
 * {
 *   "schema": "v1",
 *   "geradoEm": "ISO-8601",
 *   "unidades": [ {
 *       "id": "KF-03.U7",                 // [nodeId].U[n] — estável, ordem de aparição
 *       "node": "KF-03", "grafo": "atual|historico", "nivel": "keyframe|sprint|frame",
 *       "snapshot": "LILA-DEV/planejamento/snapshots/.../KF-03.md",
 *       "tipo": "decisao|comportamento",
 *       "granularidade": "bullet|frase",
 *       "texto": "Dado ... quando ... então ...",        // verbatim normalizado
 *       "tomadaPor": "humano|null", "data": "YYYY-MM-DD|null",
 *       "status": "ativa|deprecated",
 *       "deprecated": null | { "em": "YYYY-MM-DD",
 *           "substituidoPor": "id|null", "motivo": "contradicao|remocao",
 *           "evidencia": "declaração/trechos", "candidato": "Cn" },
 *       "revisao": null | { "status": "reprovado", "em": "YYYY-MM-DD", "motivo": "..." }
 *   } ],
 *   "nodos": [ { "id", "grafo", "nivel", "statusDocumento": "vivo|morto|parcial|sem-snapshot",
 *                "declaracao": {...}, "substituidoPor": "id|null" } ]
 * }
 *
 * Invariantes: normalizar = re-codificar apenas o que já é explícito (E-INV-01/02);
 * default conservador — dúvida NÃO marca deprecated (E-INV-16); escopo por famílias
 * declaradas, nunca all-vs-all.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const GRAFO_PATH = process.env.LILA_GRAFO_PATH || path.join(REPO_ROOT, "LILA-DEV", "planejamento", "grafo.json");
const HISTORICO_PATH = process.env.LILA_GRAFO_HISTORICO || path.join(REPO_ROOT, "LILA-DEV", "planejamento", "grafo-historico.json");
const LEDGER_PATH = process.env.LILA_GRAFO_LEDGER || path.join(REPO_ROOT, "LILA-DEV", "planejamento", "decisoes-ledger.json");

const GENERICAS = new Set([
  "removido", "removida", "removidos", "removidas", "integralmente", "evento", "deliberado",
  "permanece", "permanecem", "testes", "teste", "modal", "fonte", "decisoes", "decisao",
  "vigentes", "vigente", "sistema", "usuario", "usada", "usado", "todos", "toda", "apenas"
]);
const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "o", "a", "os", "as", "um", "uma",
  "e", "em", "por", "com", "para", "que", "se", "ao", "aos", "sobre", "este", "esta", "isso",
  "the", "of", "via", "seu", "sua", "pelo", "pela", "como", "mais", "sem", "ate", "até"
]);

// ── Normalização de texto (determinística, sem perda) ─────────────────────────

function normalizarTexto(raw) {
  let t = String(raw).replace(/\r\n?/g, "\n");
  t = t.replace(/&#x20;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.replace(/\\([-_*#[\]`])/g, "$1");
  return t;
}

function semAcentos(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ── Seções e extração de unidades ─────────────────────────────────────────────

/** Classifica uma linha como cabeçalho de seção. Retorna {tipo, nome} | null. */
function classificarLinhaSecao(linha) {
  const t = String(linha).replace(/^[#>\s]+/, "").replace(/[*_:`]/g, "").trim();
  if (!t) return null;
  const n = semAcentos(t).toUpperCase();
  if (/^(DECISOES DE NEGOCIO|DECISOES DE NEGOCIO CONSOLIDADAS)\b/.test(n)) return { tipo: "decisao", nome: t };
  if (/^DECISOES DE REMEDIACAO\b/.test(n)) return { tipo: "decisao", nome: t };
  if (/^COMPORTAMENTO (ESPERADO|RESULTANTE)\b/.test(n)) return { tipo: "comportamento", nome: t };
  if (/^TESTES? DE VALIDACAO\b/.test(n)) return { tipo: "skip", nome: t };
  if (/^CHECKS?\b/.test(n)) return { tipo: "skip", nome: t };
  if (/^DELEGACOES\b/.test(n)) return { tipo: "skip", nome: t };
  if (/^ARQUIVOS\b/.test(n)) return { tipo: "skip", nome: t };
  if (/^COBERTURA\b/.test(n)) return { tipo: "skip", nome: t };
  if (/^FRAMES?\b/.test(n)) return { tipo: "skip", nome: t };
  if (/^DECISOES\b/.test(n)) return { tipo: "decisao", nome: t };
  if (/^COMPORTAMENTO\b/.test(n)) return { tipo: "comportamento", nome: t };
  return null;
}

/** Linha "header-like" (md # ou ALL-CAPS) não classificada — delimita seção corrente. */
function ehDelimitadorSecao(linha) {
  const trim = String(linha).trim();
  if (!trim) return false;
  if (trim.startsWith("#")) return true;
  if (trim.startsWith(">")) return false;
  const n = semAcentos(trim);
  return n.length >= 8 && /^[A-Z0-9][A-Z0-9\s\-/&+()]*:?$/.test(n);
}

/** Divide texto em frases (fronteira: pontuação final + espaço + maiúscula/dígito). */
function dividirFrases(texto) {
  const partes = [];
  const re = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9"'“(])/gu;
  let start = 0, m;
  while ((m = re.exec(texto)) !== null) {
    const frag = texto.slice(start, m.index);
    if (frag.trim()) partes.push({ texto: frag.replace(/\s+/g, " ").trim(), start, end: m.index });
    start = re.lastIndex;
  }
  const fim = texto.slice(start);
  if (fim.trim()) partes.push({ texto: fim.replace(/\s+/g, " ").trim(), start, end: texto.length });
  return partes;
}

const RE_ANOTACAO = /→\s*DEPRECATED\s+(\d{4}-\d{2}-\d{2}):\s*([^\n]*)/gi;
const RE_TOMADA_POR = /(?:→|—|\u2014)?\s*tomada por:\s*([^|\u2014\n]+?)\s*(?:\||\u2014)\s*(?:data:\s*)?(\d{4}-\d{2}-\d{2})/i;
const RE_BULLET = /^\s*(?:[-*]|\d+[.)])\s+/;

function acharAnotacoes(texto) {
  const out = [];
  RE_ANOTACAO.lastIndex = 0;
  let m;
  while ((m = RE_ANOTACAO.exec(texto)) !== null) {
    out.push({ index: m.index, fim: m.index + m[0].length, data: m[1], motivo: (m[2] || "").trim() });
  }
  return out;
}

/** Separa anotações "→ DEPRECATED data: motivo" do texto, devolvendo texto limpo + posições. */
function separarAnotacoes(texto) {
  const ans = acharAnotacoes(texto);
  let limpo = "", last = 0;
  const anotacoes = [];
  for (const a of ans) {
    limpo += texto.slice(last, a.index);
    anotacoes.push({ ...a, pos: limpo.length });
    last = a.fim;
  }
  limpo += texto.slice(last);
  return { limpo, anotacoes };
}

function extrairMetadataUnidade(texto) {
  const meta = { tomadaPor: null, data: null, anotacao: null };
  const mTp = texto.match(RE_TOMADA_POR);
  if (mTp) { meta.tomadaPor = mTp[1].trim(); meta.data = mTp[2]; }
  const mAn = texto.match(/→\s*DEPRECATED\s+(\d{4}-\d{2}-\d{2}):\s*([^\n]*)/i);
  if (mAn) meta.anotacao = { data: mAn[1], motivo: (mAn[2] || "").trim() };
  return meta;
}

/** Extrai unidades de um snapshot. Retorna { unidades, gate }. */
function extrairUnidades(conteudoBruto, nodeId) {
  const texto = normalizarTexto(conteudoBruto);
  const linhas = texto.split("\n");
  const gate = {
    node: nodeId, secoesReconhecidas: 0, secoesIgnoradas: 0, bullets: 0, unidades: 0,
    frases: 0, anotacoes: 0, tomadaPor: 0, suspeitas: [], ok: true
  };
  const unidades = [];

  // 1) localizar seções (headers classificados abrem seção; header-like não classificado fecha)
  const secoes = [];
  let cur = null;
  for (let i = 0; i < linhas.length; i++) {
    const cls = classificarLinhaSecao(linhas[i]);
    if (cls) {
      if (cur) cur.fim = i;
      cur = { ...cls, inicio: i + 1, fim: linhas.length };
      secoes.push(cur);
    } else if (cur && ehDelimitadorSecao(linhas[i])) {
      cur.fim = i;
      cur = null;
    }
  }

  // linhas ALL-CAPS não classificadas FORA de qualquer seção = possível seção perdida (gate)
  const dentroDeSecao = new Set();
  for (const s of secoes) for (let i = s.inicio; i < s.fim; i++) dentroDeSecao.add(i);
  for (let i = 0; i < linhas.length; i++) {
    if (dentroDeSecao.has(i)) continue;
    const trim = linhas[i].trim();
    if (!trim || trim.startsWith(">") || trim.startsWith("#") || /\d/.test(trim)) continue;
    const n = semAcentos(trim);
    if (n.length >= 8 && /^[A-Z0-9][A-Z0-9\s\-/&+()]*:?$/.test(n) && !classificarLinhaSecao(linhas[i])) {
      gate.suspeitas.push(trim.slice(0, 60));
    }
  }

  // 2) extrair unidades por seção
  for (const secao of secoes) {
    if (secao.tipo === "skip") { gate.secoesIgnoradas++; continue; }
    gate.secoesReconhecidas++;
    const fatia = linhas.slice(secao.inicio, secao.fim);
    const temBullets = fatia.some((l) => RE_BULLET.test(l));

    if (temBullets) {
      let buffer = null;
      const flush = () => {
        if (!buffer) return;
        const textoU = buffer.replace(/\s+/g, " ").trim();
        buffer = null;
        if (!textoU) return;
        gate.bullets++;
        const meta = extrairMetadataUnidade(textoU);
        if (meta.tomadaPor) gate.tomadaPor++;
        if (meta.anotacao) gate.anotacoes++;
        unidades.push({
          node: nodeId, tipo: secao.tipo, granularidade: "bullet",
          texto: textoU, tomadaPor: meta.tomadaPor,
          data: meta.data || (meta.anotacao ? meta.anotacao.data : null),
          anotacao: meta.anotacao
        });
      };
      for (const linha of fatia) {
        if (RE_BULLET.test(linha)) { flush(); buffer = linha.replace(RE_BULLET, ""); }
        else if (/^\s*\|/.test(linha) || /^\s*-{3,}\s*$/.test(linha)) { flush(); }
        else if (buffer !== null && linha.trim()) buffer += " " + linha.trim();
      }
      flush();
    } else {
      // prosa: frases = unidades; anotação anexa à frase que antecede
      const bruto = fatia.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
      const { limpo, anotacoes } = separarAnotacoes(bruto);
      const frases = dividirFrases(limpo);
      const pendentes = anotacoes.slice();
      for (let i = 0; i < frases.length; i++) {
        const f = frases[i];
        const proxima = frases[i + 1];
        let an = pendentes.find((a) => a.pos >= f.start && a.pos <= f.end + 1) || null;
        if (!an && pendentes.length && (!proxima || pendentes[0].pos < proxima.start) && pendentes[0].pos >= f.start) {
          an = pendentes[0];
        }
        if (an) {
          const idx = pendentes.indexOf(an);
          if (idx >= 0) pendentes.splice(idx, 1);
        }
        unidades.push({
          node: nodeId, tipo: secao.tipo, granularidade: "frase",
          texto: f.texto, tomadaPor: null, data: an ? an.data : null, anotacao: an
        });
        gate.frases++;
        if (an) gate.anotacoes++;
      }
    }
  }
  unidades.forEach((u, i) => { u.id = nodeId + ".U" + (i + 1); });
  gate.unidades = unidades.length;
  gate.ok = gate.bullets + gate.frases === gate.unidades;
  return { unidades, gate };
}

// ── Matching de sujeito (determinístico, conservador) ─────────────────────────

function tokenizar(s) {
  return semAcentos(String(s).toLowerCase())
    .split(/[^a-z0-9-]+/).filter(Boolean);
}

/** Palavras-chave de uma declaração de sujeito: tokens significativos, head primeiro. */
function palavrasChave(sujeito) {
  const toks = tokenizar(sujeito).filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !GENERICAS.has(t));
  const vistos = new Set();
  const out = [];
  for (const t of toks) { if (!vistos.has(t)) { vistos.add(t); out.push(t); } }
  return out;
}

/** Casa uma unidade/frase com as keywords da declaração. Conservador: head OU >=2 overlaps. */
function casaUnidade(textoUnidade, kws) {
  if (!kws.length) return { casa: false, motivo: "" };
  const toks = tokenizar(textoUnidade);
  const textoNorm = " " + toks.join(" ") + " ";
  const head = kws[0];
  for (const tok of toks) {
    if (tok === head) return { casa: true, motivo: 'head "' + head + '"' };
    if (head.length >= 6 && tok.length >= 6 && (tok.startsWith(head) || head.startsWith(tok))) {
      return { casa: true, motivo: 'head-prefix "' + tok + '"~"' + head + '"' };
    }
  }
  if (textoNorm.includes(" " + head + " ") || textoNorm.includes(head)) {
    return { casa: true, motivo: 'contém "' + head + '"' };
  }
  const hits = kws.filter((kw) => toks.includes(kw));
  if (hits.length >= 2) return { casa: true, motivo: 'tokens: ' + hits.slice(0, 3).join(", ") };
  return { casa: false, motivo: "" };
}

// ── Declarações explícitas de deprecation ─────────────────────────────────────

function carregarGrafos() {
  const atual = JSON.parse(fs.readFileSync(GRAFO_PATH, "utf8"));
  const hist = JSON.parse(fs.readFileSync(HISTORICO_PATH, "utf8"));
  const nos = new Map();
  const add = (arr, grafo, nivel) => {
    for (const n of arr || []) if (n && n.id && !nos.has(n.id)) nos.set(n.id, { node: n, grafo, nivel });
  };
  add(atual.keyframes, "atual", "keyframe");
  add(atual.sprints, "atual", "sprint");
  add(atual.frames, "atual", "frame");
  add(hist.keyframes, "historico", "keyframe");
  add(hist.sprints, "historico", "sprint");
  add(hist.frames, "historico", "frame");
  return { atual, hist, nos };
}

function snapshotAbs(node) {
  if (!node || typeof node.snapshot !== "string" || !node.snapshot.trim()) return null;
  return path.join(REPO_ROOT, node.snapshot);
}

/** Declarações no PRÓPRIO nó: nota começando com DEPRECATED, campo superseded_by. */
function declaracoesDoNo(entry) {
  const node = entry.node;
  const out = [];
  if (typeof node.superseded_by === "string" && node.superseded_by.trim()) {
    out.push({ origem: "superseded_by", tipo: "substituicao", alvo: node.superseded_by.trim(),
      evidencia: 'campo superseded_by = "' + node.superseded_by.trim() + '"' });
  }
  const nota = (node.nota || "").trim();
  if (/^DEPRECATED/i.test(nota)) {
    const m = nota.match(/Substitu[íi]d[oa]s? por\s+([A-Za-z0-9][\w-]*)/i)
      || nota.match(/Absorvido por\s+([A-Za-z0-9][\w-]*)/i)
      || nota.match(/postergados? para\s+([A-Za-z0-9][\w-]*)/i);
    if (m) out.push({ origem: "nota", tipo: "substituicao", alvo: m[1], evidencia: 'nota: "' + nota.slice(0, 140) + '"' });
    else out.push({ origem: "nota", tipo: "remocao", alvo: null, evidencia: 'nota: "' + nota.slice(0, 140) + '"' });
  }
  return out;
}

/** Declarações em notas de TOPO do grafo (nota_kf_test etc.) — mapeadas e verificadas. */
function declaracoesTopo(atual, nos) {
  const out = [];
  for (const [chave, valor] of Object.entries(atual || {})) {
    if (!/^nota_/.test(chave) || typeof valor !== "string" || !/^DEPRECATED/i.test(valor.trim())) continue;
    const candidatoId = semAcentos(chave.replace(/^nota_/, "")).toUpperCase().replace(/_/g, "-");
    if (nos.has(candidatoId)) {
      const m = valor.match(/Substitu[íi]d[oa]s? por\s+([A-Za-z0-9][\w-]*)/i);
      out.push({
        node: candidatoId, grafo: nos.get(candidatoId).grafo,
        tipo: m ? "substituicao" : "remocao", alvo: m ? m[1] : null,
        evidencia: chave + ': "' + valor.slice(0, 140) + '"'
      });
    } else {
      out.push({ node: null, candidatoId, tipo: "informativo", alvo: null,
        evidencia: chave + ": nó " + candidatoId + " não encontrado nos grafos" });
    }
  }
  return out;
}

/** Header "DEPRECATED (SP-LIMPEZA-OS — data): <sujeito> substituída(s) por ALVO". */
function extrairDeclaracaoLimpezaOs(texto) {
  const m = texto.match(/DEPRECATED\s*\(SP-LIMPEZA-OS\s*[—–-]\s*(\d{4}-\d{2}-\d{2})\)\s*:\s*([\s\S]*?)\s+substitu[íi]d[oa]s?\s+por\s+([A-Za-z0-9][\w-]*)/i);
  if (!m) return null;
  return { data: m[1], sujeito: m[2].replace(/\s+/g, " ").trim(), alvo: m[3] };
}

// ── Construção de candidatos (orquestrador determinístico) ────────────────────

const FAMILIA_RANK = { TEST: 0, "LIMPEZA-OS": 1, "KF-01-TRUNCAMENTO": 2, OUTRA: 3 };

function familiaDe(nodeId) {
  if (/^KF-TEST$|^KF-TEST-BACKEND$|^(SP|FR)-TEST-/.test(nodeId)) return "TEST";
  return "OUTRA";
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Coleta declarações explícitas e constrói candidatos C1..Cn.
 * Escopo: famílias com declaração explícita — nunca all-vs-all.
 */
function construirCandidatos() {
  const { atual, hist, nos } = carregarGrafos();
  const cache = new Map(); // nodeId -> { unidades, gate, snapshotExiste, snapshotRel }
  const gates = [];
  const informativos = [];

  function unidadesDe(id) {
    if (cache.has(id)) return cache.get(id);
    const entry = nos.get(id);
    const rel = (entry.node && entry.node.snapshot) || null;
    const abs = snapshotAbs(entry.node);
    let v;
    if (!abs || !fs.existsSync(abs)) {
      v = { unidades: [], gate: { node: id, ok: true, unidades: 0, suspeitas: [], semSnapshot: true }, snapshotExiste: false, snapshotRel: rel };
    } else {
      const r = extrairUnidades(fs.readFileSync(abs, "utf8"), id);
      v = { unidades: r.unidades, gate: r.gate, snapshotExiste: true, snapshotRel: rel };
    }
    cache.set(id, v);
    return v;
  }

  // 1) declarações de nó (nota ^DEPRECATED, superseded_by) — todos os nós
  const declaracoes = new Map(); // nodeId -> [decl]
  const addDecl = (id, grafo, decl) => {
    if (!declaracoes.has(id)) declaracoes.set(id, []);
    const arr = declaracoes.get(id);
    // dedupe por (tipo, alvo) — nota do nó e nota de topo podem declarar o mesmo alvo
    if (!arr.some((d) => d.tipo === decl.tipo && (d.alvo || null) === (decl.alvo || null))) arr.push(decl);
  };
  for (const [id, entry] of nos) {
    for (const d of declaracoesDoNo(entry)) addDecl(id, entry.grafo, { ...d, grafo: entry.grafo });
  }
  // 2) declarações de topo (nota_* com ^DEPRECATED)
  for (const d of declaracoesTopo(atual, nos)) {
    if (d.node) addDecl(d.node, d.grafo, { origem: "nota-topo", tipo: d.tipo, alvo: d.alvo, evidencia: d.evidencia, grafo: d.grafo });
    else informativos.push(d);
  }
  // 3) headers LIMPEZA-OS nos KFs do histórico
  for (const [id, entry] of nos) {
    if (entry.grafo !== "historico" || entry.nivel !== "keyframe") continue;
    const u = unidadesDe(id);
    if (!u.snapshotExiste) continue;
    const conteudo = normalizarTexto(fs.readFileSync(path.join(REPO_ROOT, u.snapshotRel), "utf8"));
    const limpeza = extrairDeclaracaoLimpezaOs(conteudo);
    if (limpeza) {
      addDecl(id, "historico", { origem: "header-snapshot", tipo: "substituicao", alvo: limpeza.alvo,
        evidencia: 'header: "DEPRECATED (SP-LIMPEZA-OS — ' + limpeza.data + '): ' + limpeza.sujeito.slice(0, 120) + '..."',
        limpeza });
    }
  }
  // 4) FR-GRAFO-T4 (A7) — classificação RETROATIVA (somente leitura, sem mutação):
  // substituido_por/superseded_by JÁ gravados pelo batch em node.deprecated apontando
  // para alvo não resolvível → informativo alvo-nao-resolvivel (fósseis nunca são editados).
  for (const [id, entry] of nos) {
    const dep = entry.node && entry.node.deprecated;
    if (!dep || typeof dep !== "object") continue;
    for (const campo of ["substituido_por", "superseded_by"]) {
      const alvo = dep[campo];
      if (typeof alvo !== "string" || !alvo.trim() || nos.has(alvo)) continue;
      informativos.push({ node: id, tipo: "informativo", motivo: "alvo-nao-resolvivel", alvo,
        evidencia: "alvo-nao-resolvivel (retroativo, sem mutação): deprecated." + campo + " = \"" + alvo
          + "\" não resolve no universo consolidado" });
    }
  }
  return { atual, hist, nos, cache, gates, informativos, declaracoes, unidadesDe, addDecl };
}

/** Idempotência: remove candidatos já normalizados (unidade deprecated no ledger com mesmo alvo, ou nó já em ledger.nodos). */
function filtrarJaNormalizados(candidatos, ledger) {
  const nosFeitos = new Set((ledger.nodos || []).map((n) => n.id));
  const unidadesFeitas = new Set((ledger.unidades || [])
    .filter((u) => u.status === "deprecated")
    .map((u) => u.id + "|" + ((u.deprecated && u.deprecated.substituidoPor) || "")));
  return candidatos.filter((c) => {
    if (c.granularidade === "nodo" && nosFeitos.has(c.node)) return false;
    if (c.unidadeId && unidadesFeitas.has(c.unidadeId + "|" + (c.alvo || ""))) return false;
    return true;
  });
}

/** Fase 2 da construção: monta candidatos a partir das declarações coletadas. */
function montarCandidatos(ctx) {
  const { nos, unidadesDe, declaracoes, informativos, gates } = ctx;
  const candidatos = [];

  for (const [id, decls] of declaracoes) {
    const entry = nos.get(id);
    const familia = familiaDe(id);
    const u = unidadesDe(id);
    for (const d of decls) {
      const alvoResolvido = d.alvo ? nos.has(d.alvo) : false;
      const alvoSnapshotExiste = alvoResolvido ? unidadesDe(d.alvo).snapshotExiste : null;
      // FR-GRAFO-T4 (A7): alvo declarado e NÃO resolvível nunca vira candidato —
      // vai para informativos (dry-run) e é bloqueado no apply (veredito humano).
      if (d.alvo && !alvoResolvido) {
        informativos.push({ node: id, tipo: "informativo", motivo: "alvo-nao-resolvivel", alvo: d.alvo,
          evidencia: "alvo-nao-resolvivel: \"" + d.alvo + "\" não resolve no universo consolidado | " + d.evidencia });
        continue;
      }
      if (d.limpeza) {
        const kws = palavrasChave(d.limpeza.sujeito);
        const casadas = u.unidades.filter((un) => casaUnidade(un.texto, kws).casa);
        if (!casadas.length) {
          informativos.push({ node: id, tipo: "informativo", alvo: d.alvo,
            evidencia: "LIMPEZA-OS sem unidade casada (kws: " + kws.slice(0, 4).join(",") + ") — unidades permanecem vivas" });
          continue;
        }
        for (const un of casadas) {
          const m = casaUnidade(un.texto, kws);
          candidatos.push({
            familia: "LIMPEZA-OS", node: id, grafo: entry.grafo, nivel: entry.nivel,
            snapshotRel: u.snapshotRel, snapshotExiste: u.snapshotExiste,
            tipo: "substituicao", granularidade: "unidade", unidadeId: un.id,
            texto: un.texto, tomadaPor: un.tomadaPor, dataUnidade: un.data,
            alvo: d.alvo, alvoResolvido, alvoSnapshotExiste,
            evidencia: d.evidencia + " | casamento: " + m.motivo,
            motivo: "contradicao", em: d.limpeza.data
          });
        }
      } else if (u.unidades.length) {
        for (const un of u.unidades) {
          candidatos.push({
            familia, node: id, grafo: entry.grafo, nivel: entry.nivel,
            snapshotRel: u.snapshotRel, snapshotExiste: u.snapshotExiste,
            tipo: d.tipo, granularidade: "unidade", unidadeId: un.id,
            texto: un.texto, tomadaPor: un.tomadaPor, dataUnidade: un.data,
            alvo: d.alvo, alvoResolvido, alvoSnapshotExiste,
            evidencia: d.evidencia, motivo: d.tipo === "substituicao" ? "contradicao" : "remocao", em: hoje()
          });
        }
      } else {
        candidatos.push({
          familia, node: id, grafo: entry.grafo, nivel: entry.nivel,
          snapshotRel: u.snapshotRel, snapshotExiste: u.snapshotExiste,
          tipo: d.tipo, granularidade: "nodo", unidadeId: null,
          texto: null, tomadaPor: null, dataUnidade: null,
          alvo: d.alvo, alvoResolvido, alvoSnapshotExiste,
          evidencia: d.evidencia, motivo: d.tipo === "substituicao" ? "contradicao" : "remocao", em: hoje()
        });
      }
    }
  }

  // anotações inline (→ DEPRECATED) em KFs do histórico — decisão individual explícita
  for (const [id, entry] of nos) {
    if (entry.grafo !== "historico" || entry.nivel !== "keyframe") continue;
    const u = unidadesDe(id);
    if (!u.snapshotExiste) continue;
    if ((declaracoes.get(id) || []).some((d) => d.limpeza)) continue;
    for (const un of u.unidades) {
      if (!un.anotacao) continue;
      const mAlvo = un.anotacao.motivo.match(/Substitu[íi]d[oa]s? por\s+([A-Za-z0-9][\w-]*)/i);
      // FR-GRAFO-T4 (A7): mesmo guard do fluxo principal — alvo inline não
      // resolvível vai para informativos, nunca para candidatos.
      if (mAlvo && !nos.has(mAlvo[1])) {
        informativos.push({ node: id, tipo: "informativo", motivo: "alvo-nao-resolvivel", alvo: mAlvo[1],
          evidencia: "alvo-nao-resolvivel: \"" + mAlvo[1] + "\" não resolve no universo consolidado | anotação inline: \"→ DEPRECATED " + un.anotacao.data + ": " + un.anotacao.motivo.slice(0, 120) + "\"" });
        continue;
      }
      candidatos.push({
        familia: "KF-01-TRUNCAMENTO", node: id, grafo: entry.grafo, nivel: entry.nivel,
        snapshotRel: u.snapshotRel, snapshotExiste: u.snapshotExiste,
        tipo: mAlvo ? "substituicao" : "remocao", granularidade: "unidade", unidadeId: un.id,
        texto: un.texto, tomadaPor: un.tomadaPor, dataUnidade: un.data,
        alvo: mAlvo ? mAlvo[1] : null, alvoResolvido: mAlvo ? nos.has(mAlvo[1]) : false, alvoSnapshotExiste: null,
        evidencia: 'anotação inline: "→ DEPRECATED ' + un.anotacao.data + ": " + un.anotacao.motivo.slice(0, 120) + '"',
        motivo: mAlvo ? "contradicao" : "remocao", em: un.anotacao.data
      });
    }
  }

  candidatos.sort((a, b) =>
    (FAMILIA_RANK[a.familia] - FAMILIA_RANK[b.familia])
    || a.node.localeCompare(b.node)
    || String(a.unidadeId || "").localeCompare(String(b.unidadeId || ""))
  );
  // idempotência: já-normalizados (ledger v1) não são re-propostos — unidade
  // deprecated com mesmo alvo, ou nó já terminal, somem do diff (E-INV-16: o que
  // restar de ambíguo/reprovado continua reapresentável)
  const ledgerExistente = fs.existsSync(LEDGER_PATH)
    ? JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"))
    : { unidades: [], nodos: [] };
  const restantes = filtrarJaNormalizados(candidatos, ledgerExistente);
  const removidos = candidatos.length - restantes.length;
  restantes.forEach((c, i) => { c.id = "C" + (i + 1); c.veredito = null; c.motivoReprovacao = null; });

  const nosTocados = [...new Set(restantes.map((c) => c.node))].sort();
  for (const id of nosTocados) gates.push(unidadesDe(id).gate);
  const morte = nosTocados.map((id) => {
    const u = unidadesDe(id);
    const props = restantes.filter((c) => c.node === id);
    let statusDocumento;
    if (!u.snapshotExiste || !u.unidades.length) statusDocumento = props.some((p) => p.granularidade === "nodo") ? "morte-nivel-no" : "vivo";
    else if (props.length >= u.unidades.length) statusDocumento = "morre";
    else statusDocumento = "parcial";
    return { node: id, grafo: nos.get(id).grafo, totalUnidades: u.unidades.length, propostas: props.length, statusDocumento };
  });

  return { candidatos: restantes, gates, morte, informativos, removidosJaNormalizados: removidos };
}

// ── Artefato de review (dry-run) ──────────────────────────────────────────────

function trunc(s, n) {
  s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function imprimirArtefato({ candidatos, gates, morte, informativos, removidosJaNormalizados }) {
  const L = [];
  L.push("==== ARTEFATO DE REVIEW — NORMALIZAÇÃO DE DEPRECATIONS ====");
  L.push("Gerado em: " + new Date().toISOString() + " | modo: DRY-RUN — NADA foi gravado");
  if (removidosJaNormalizados) L.push("Idempotência: " + removidosJaNormalizados + " candidato(s) já normalizados foram omitidos (ledger v1).");
  L.push("Veto por item: responda com veredito \"aprovar\"|\"reprovar\" por Cn (reprovado fica ativo + flag).");
  L.push("");
  const familias = [...new Set(candidatos.map((c) => c.familia))];
  for (const fam of familias) {
    const itens = candidatos.filter((c) => c.familia === fam);
    L.push("── FAMÍLIA " + fam + " (" + itens.length + " candidato(s)) ──");
    for (const c of itens) {
      L.push("[" + c.id + "] " + c.node + (c.unidadeId ? " · " + c.unidadeId : " · nível-de-nó")
        + " · " + c.tipo + " · " + c.granularidade);
      if (c.texto) L.push("     ANTIGO: " + trunc(c.texto, 170));
      L.push("     DECLARAÇÃO: " + trunc(c.evidencia, 170));
      if (c.alvo) {
        L.push("     NOVO: " + c.alvo + (c.alvoResolvido ? "" : "  ⚠️ alvo não resolvido nos grafos")
          + (c.alvoSnapshotExiste === false ? "  ⚠️ snapshot do alvo ausente" : ""));
      }
      L.push("     AÇÃO: deprecated (" + c.motivo + ") em " + c.em
        + (c.alvo ? " → substituidoPor: " + c.alvo : " → substituidoPor: null"));
    }
    L.push("");
  }
  L.push("── MORTE DE DOCUMENTO (derivada; RECALCULADA após vetos) ──");
  for (const m of morte) {
    L.push("  " + m.node + " (" + m.grafo + "): " + m.propostas + "/" + m.totalUnidades
      + " unidades propostas → " + m.statusDocumento);
  }
  L.push("");
  L.push("── GATES (extração determinística) ──");
  let gateFalhas = 0;
  for (const g of gates) {
    if (!g) continue;
    const suspeitasTxt = (g.suspeitas || []).length ? " | suspeitas: " + g.suspeitas.join(" ; ") : "";
    const ok = (g.suspeitas || []).length === 0;
    if (!ok) gateFalhas++;
    L.push("  " + (ok ? "✅" : "⚠️ ") + g.node + ": unidades=" + g.unidades
      + " (bullets=" + g.bullets + ", frases=" + g.frases + ")"
      + ", seções=" + g.secoesReconhecidas + "/" + g.secoesIgnoradas + " skip"
      + ", tomadaPor=" + g.tomadaPor + ", anotações=" + g.anotacoes + suspeitasTxt);
  }
  L.push("");
  L.push("── INFORMATIVOS (sem ação de unidade) ──");
  if (!informativos.length) L.push("  (nenhum)");
  for (const inf of informativos) L.push("  • " + (inf.node || inf.candidatoId || "?") + ": " + trunc(inf.evidencia, 150));
  L.push("");
  L.push("RESUMO: " + candidatos.length + " candidato(s) (" + (candidatos.length ? "C1.." + "C" + candidatos.length : "—")
    + ") | nós tocados: " + morte.length + " | gates com suspeita: " + gateFalhas);
  L.push("Próximo passo: revisar itens, preencher veredito no JSON (--out) e executar --apply --review <arquivo>.");
  return L.join("\n");
}

// ── Apply (só roda com review preenchido) ─────────────────────────────────────

function aplicar(reviewPath) {
  if (!reviewPath) {
    console.error("ERRO: --apply exige --review <arquivo.json> com vereditos preenchidos.");
    process.exit(2);
  }
  const abs = path.isAbsolute(reviewPath) ? reviewPath : path.join(REPO_ROOT, reviewPath);
  if (!fs.existsSync(abs)) { console.error("ERRO: review não encontrado: " + reviewPath); process.exit(1); }
  const review = JSON.parse(fs.readFileSync(abs, "utf8"));
  const semVeredito = (review.candidatos || []).filter((c) => c.veredito !== "aprovar" && c.veredito !== "reprovar");
  if (semVeredito.length) {
    console.error("ERRO: " + semVeredito.length + " candidato(s) sem veredito (ex.: " + semVeredito[0].id
      + "). Preencha \"aprovar\"|\"reprovar\" em TODOS antes de aplicar.");
    process.exit(1);
  }

  const ctx = construirCandidatos();
  const { candidatos, morte, nos } = { ...ctx, ...montarCandidatos(ctx) };
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  for (const r of review.candidatos) {
    if (!porId.has(r.id)) { console.error("ERRO: candidato " + r.id + " do review não existe mais (artefato desatualizado — re-gerar)."); process.exit(1); }
    porId.get(r.id).veredito = r.veredito;
    porId.get(r.id).motivoReprovacao = r.motivoReprovacao || null;
  }

  // FR-GRAFO-T4 (A7): apply BLOQUEIA item aprovado com alvo não resolvível —
  // disciplina do veto granular: veredito humano obrigatório antes de gravar.
  const bloqueados = [...porId.values()].filter((c) => c.veredito === "aprovar" && c.alvo && !nos.has(c.alvo));
  if (bloqueados.length) {
    for (const c of bloqueados) {
      console.error("BLOQUEADO (alvo-nao-resolvivel): " + c.id + " " + c.node + " → alvo \"" + c.alvo
        + "\" não resolve no universo consolidado. Reprove o item no review ou corrija o alvo (veredito humano obrigatório).");
    }
    process.exit(1);
  }

  const aprovados = candidatos.filter((c) => c.veredito === "aprovar");
  const reprovados = candidatos.filter((c) => c.veredito === "reprovar");
  const hojeStr = hoje();
  const unidadesLedger = [];
  const nodosLedger = [];
  const porNode = new Map();
  for (const c of candidatos) {
    if (!porNode.has(c.node)) porNode.set(c.node, []);
    porNode.get(c.node).push(c);
  }

  for (const [nodeId, itens] of porNode) {
    const entry = nos.get(nodeId);
    const ctxU = ctx.unidadesDe(nodeId);
    const aprovNode = itens.filter((c) => c.veredito === "aprovar");
    if (ctxU.unidades.length) {
      for (const un of ctxU.unidades) {
        const cand = itens.find((c) => c.unidadeId === un.id);
        if (!cand) continue; // unidade fora de proposta permanece fora do ledger neste passe
        if (cand.veredito === "aprovar") {
          unidadesLedger.push({
            id: un.id, node: nodeId, grafo: cand.grafo, nivel: cand.nivel,
            snapshot: cand.snapshotRel, tipo: un.tipo, granularidade: un.granularidade,
            texto: un.texto, tomadaPor: un.tomadaPor, data: un.data,
            status: "deprecated",
            deprecated: { em: cand.em, substituidoPor: cand.alvo || null, motivo: cand.motivo, evidencia: cand.evidencia, candidato: cand.id },
            revisao: null
          });
        } else {
          unidadesLedger.push({
            id: un.id, node: nodeId, grafo: cand.grafo, nivel: cand.nivel,
            snapshot: cand.snapshotRel, tipo: un.tipo, granularidade: un.granularidade,
            texto: un.texto, tomadaPor: un.tomadaPor, data: un.data,
            status: "ativa", deprecated: null,
            revisao: { status: "reprovado", em: hojeStr, motivo: cand.motivoReprovacao || "sem motivo declarado" }
          });
        }
      }
    }
    const morteInfo = morte.find((m) => m.node === nodeId);
    const inteira = morteInfo && (morteInfo.statusDocumento === "morre" || morteInfo.statusDocumento === "morte-nivel-no") && aprovNode.length > 0;
    const alvoUnico = aprovNode.length && aprovNode.every((c) => (c.alvo || null) === (aprovNode[0].alvo || null)) ? aprovNode[0].alvo : null;
    if (inteira) {
      entry.node.deprecated = {
        em: hojeStr, motivo: aprovNode[0].motivo, substituido_por: alvoUnico,
        fonte: "grafo-normalize", ledger: "LILA-DEV/planejamento/decisoes-ledger.json"
      };
    } else if (aprovNode.length) {
      entry.node.decisoes_deprecated = {
        total: morteInfo ? morteInfo.totalUnidades : 0, unidades: aprovNode.length,
        em: hojeStr, ledger: "LILA-DEV/planejamento/decisoes-ledger.json"
      };
    }
    if (!ctxU.unidades.length && aprovNode.length) {
      nodosLedger.push({
        id: nodeId, grafo: entry.grafo, nivel: entry.nivel,
        statusDocumento: morteInfo ? morteInfo.statusDocumento : "vivo",
        declaracao: { tipo: aprovNode[0].tipo, alvo: aprovNode[0].alvo, evidencia: aprovNode[0].evidencia },
        substituidoPor: aprovNode[0].alvo || null
      });
    }
  }

  const existente = fs.existsSync(LEDGER_PATH)
    ? JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"))
    : { schema: "v1", unidades: [], nodos: [] };
  // MERGE (nunca sobrescrever): entradas novas substituem por id; unidades/nós
  // já no ledger de runs anteriores são preservados — idempotência de estado.
  const unidadesMap = new Map((existente.unidades || []).map((u) => [u.id, u]));
  for (const u of unidadesLedger) unidadesMap.set(u.id, u);
  const nodosMap = new Map((existente.nodos || []).map((n) => [n.id, n]));
  for (const n of nodosLedger) nodosMap.set(n.id, n);
  const todasUnidades = [...unidadesMap.values()];
  const todosNodos = [...nodosMap.values()];
  const ledger = {
    schema: "v1", geradoEm: new Date().toISOString(),
    resumo: { unidades: todasUnidades.length, deprecated: todasUnidades.filter((u) => u.status === "deprecated").length, reprovados: reprovados.length, nodos: todosNodos.length },
    unidades: todasUnidades, nodos: todosNodos
  };
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  // grava grafos apenas se o conteúdo serializado mudar (evita diff espúrio)
  for (const [caminho, obj] of [[GRAFO_PATH, ctx.atual], [HISTORICO_PATH, ctx.hist]]) {
    const serializado = JSON.stringify(obj, null, 2) + "\n";
    if (fs.readFileSync(caminho, "utf8") !== serializado) fs.writeFileSync(caminho, serializado, "utf8");
  }

  console.log("OK — apply concluído:");
  console.log("  ledger: " + path.relative(REPO_ROOT, LEDGER_PATH) + " (" + ledger.resumo.unidades + " unidades, " + ledger.resumo.deprecated + " deprecated)");
  console.log("  grafo.json + grafo-historico.json atualizados com campos estruturados");
  console.log("  aprovados: " + aprovados.length + " | reprovados (ficam ativos + flag): " + reprovados.length);
  console.log("  PENDENTE (próxima fase): reescrita dos .md de snapshot para o formato canônico.");
}

// ── Fase 4: reescrita canônica dos snapshots (header + marcadores inline) ────

const MARCADOR_V1 = "GRAFO-NORMALIZE v1";

/** Plano de reescrita por nó tocado: header canônico + bullets a marcar inline. */
function montarPlanoReescrita() {
  if (!fs.existsSync(LEDGER_PATH)) return { erro: "ledger ausente — rode --apply antes de --rewrite-snapshots" };
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
  const nos = carregarGrafos().nos;
  const porNo = new Map();
  for (const u of ledger.unidades || []) {
    if (!porNo.has(u.node)) porNo.set(u.node, []);
    porNo.get(u.node).push(u);
  }
  const nosTocados = new Set(porNo.keys());
  for (const [, entry] of nos) {
    if (entry.node.deprecated || entry.node.decisoes_deprecated) nosTocados.add(entry.node.id);
  }
  const plano = [];
  for (const id of [...nosTocados].sort()) {
    const entry = nos.get(id);
    if (!entry || !entry.node.snapshot) continue;
    const rel = entry.node.snapshot;
    const abs = path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
    const unidades = porNo.get(id) || [];
    const dep = unidades.filter((u) => u.status === "deprecated" && u.deprecated);
    const morre = !!entry.node.deprecated;
    const parcial = !morre && !!entry.node.decisoes_deprecated;
    const alvos = [...new Set([
      ...(morre && entry.node.deprecated.substituido_por ? [entry.node.deprecated.substituido_por] : []),
      ...dep.map((u) => u.deprecated.substituidoPor).filter(Boolean)
    ])];
    const alvo = alvos.length === 1 ? alvos[0] : null;
    const motivo = (morre && entry.node.deprecated.motivo)
      || (dep[0] && dep[0].deprecated.motivo)
      || (parcial ? "contradicao" : "remocao");
    const em = (morre && entry.node.deprecated.em)
      || (dep[0] && dep[0].deprecated.em)
      || (parcial && entry.node.decisoes_deprecated.em) || hoje();
    const headerLines = [
      "<!-- " + MARCADOR_V1 + " · SSOT: LILA-DEV/planejamento/decisoes-ledger.json · unidades deste doc no ledger: " + unidades.length + " · gerado: " + hoje() + " -->"
    ];
    if (morre) {
      headerLines.push("<!-- ⚠️ DOCUMENTO DEPRECATO INTEGRALMENTE → " + (alvo || "(removido, sem alvo)") + " · motivo: " + motivo + " · em: " + em + " · unidades: " + dep.length + (dep.length ? " (" + dep[0].id + ".." + dep[dep.length - 1].id + ")" : "") + " -->");
    } else if (parcial) {
      headerLines.push("<!-- ⚠️ DEPRECATED PARCIAL: " + dep.length + "/" + entry.node.decisoes_deprecated.total + " unidades" + (alvo ? " → " + alvo : "") + " · motivo: " + motivo + " · em: " + em + " · unidades marcadas com [DEPRECATED→…] · DEMAIS DECISÕES PERMANECEM VIGENTES -->");
      for (const u of dep) {
        headerLines.push("<!-- · " + u.id + " (" + u.granularidade + "): " + trunc(u.texto, 110) + " → " + (u.deprecated.substituidoPor || "(removida)") + " -->");
      }
    } else {
      headerLines.push("<!-- ⚠️ DEPRECATED NO NÍVEL DE NÓ" + (alvo ? " → " + alvo : " (removido, sem alvo)") + " · motivo: " + motivo + " · em: " + em + " · sem unidades extraíveis neste snapshot -->");
    }
    const bullets = morre ? [] : dep.filter((u) => u.granularidade === "bullet");
    plano.push({ node: id, grafo: entry.grafo, snapshotRel: rel, abs, existe: fs.existsSync(abs), morre, parcial, alvo, motivo, em, headerLines, unidades: dep, bullets });
  }
  return { plano };
}

/** Regex de busca para um trecho (espaço = \s+; hífen com backslash opcional). */
function padraoDe(alvo) {
  return new RegExp(alvo.split("").map((ch) => {
    if (ch === " ") return "\\s+";
    if (ch === "-") return "\\\\?-";
    return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join(""));
}

/**
 * Localiza a posição de inserção do marcador inline de um bullet.
 * Janela adaptativa (26→480 chars): unidades com prefixos idênticos são
 * desambiguadas por janelas maiores. Linhas já marcadas ou reivindicadas
 * por outra unidade são puladas. Retorna índice pós-marcador-de-bullet, ou null.
 */
function posMarcadorBullet(bruto, textoUnidade, claimed) {
  const texto = normalizarTexto(textoUnidade).replace(/\s+/g, " ").trim();
  for (const tam of [26, 60, 120, 240, 480]) {
    const alvo = texto.slice(0, tam);
    if (alvo.length < 8) break;
    const re = padraoDe(alvo);
    let from = 0;
    while (from < bruto.length) {
      const m = bruto.slice(from).search(re);
      if (m < 0) break;
      const idx = from + m;
      const iniLinha = bruto.lastIndexOf("\n", idx) + 1;
      let fim = bruto.indexOf("\n", iniLinha);
      if (fim < 0) fim = bruto.length;
      const linha = bruto.slice(iniLinha, fim);
      if (!linha.includes("[DEPRECATED→") && !claimed.has(iniLinha)) {
        const bm = linha.match(/^([ \t]*(?:[-*]|\\-|\d+[.)])[ \t]+)/);
        if (bm) { claimed.add(iniLinha); return iniLinha + bm[1].length; }
      }
      from = idx + 1;
    }
  }
  return null;
}

/** Aplica (ou simula) a reescrita. Retorna relatório por nó. */
function executarReescrita(planoItens, aplicar) {
  const relatorio = [];
  for (const item of planoItens) {
    if (!item.existe) { relatorio.push({ node: item.node, acao: "skip — snapshot ausente" }); continue; }
    const bruto = fs.readFileSync(item.abs, "utf8");
    if (bruto.includes(MARCADOR_V1)) { relatorio.push({ node: item.node, acao: "skip — header já presente (idempotente)" }); continue; }
    const eol = bruto.includes("\r\n") ? "\r\n" : "\n";
    const header = item.headerLines.join(eol) + eol + eol;
    // bullets casados no BRUTO original (o header contém trechos das unidades e
    // poluiria a busca); inserções de trás pra frente mantêm as posições válidas.
    const insercoes = [];
    const naoAchados = [];
    const claimed = new Set();
    for (const u of item.bullets) {
      const pos = posMarcadorBullet(bruto, u.texto, claimed);
      if (pos === null) { naoAchados.push(u.id); continue; }
      insercoes.push({ pos, marca: "[DEPRECATED→" + (u.deprecated.substituidoPor || "REMOVIDA") + "·" + u.id + "] " });
    }
    insercoes.sort((a, b) => b.pos - a.pos);
    let conteudo = bruto;
    for (const ins of insercoes) conteudo = conteudo.slice(0, ins.pos) + ins.marca + conteudo.slice(ins.pos);
    conteudo = header + conteudo;
    if (aplicar) fs.writeFileSync(item.abs, conteudo, "utf8");
    relatorio.push({
      node: item.node, acao: aplicar ? "ESCRITO" : "simulado",
      header: item.headerLines.length + " linhas",
      tipo: item.morre ? "morre" : (item.parcial ? "parcial" : "nível-de-nó"),
      alvo: item.alvo, bulletsMarcados: insercoes.length, bulletsNaoAchados: naoAchados
    });
  }
  return relatorio;
}

// ── FR-GRAFO-T7A (A10): backfill de tomadaPor/data a partir do trailer do texto ──
// Unidades registradas sem metadados (ex.: via register_unit sem args) têm o
// trailer de autoria no PRÓPRIO texto — re-parseia e preenche SOMENTE os campos
// estruturados; textos ficam inalterados. Idempotente.

function backfillTomadaPor() {
  if (!fs.existsSync(LEDGER_PATH)) {
    console.error("ERRO: ledger ausente: " + LEDGER_PATH);
    process.exit(1);
  }
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
  let preenchidos = 0;
  const detalhe = [];
  for (const u of ledger.unidades || []) {
    if (u.tomadaPor && u.data) continue;
    const meta = extrairMetadataUnidade(u.texto || "");
    if (meta.tomadaPor) {
      u.tomadaPor = meta.tomadaPor;
      u.data = meta.data;
      preenchidos++;
      detalhe.push(u.id);
    }
  }
  if (preenchidos > 0) {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  }
  console.log("=== backfill tomadaPor/data (T7A/A10) ===");
  console.log("Unidades preenchidas a partir do trailer do texto: " + preenchidos);
  if (detalhe.length) console.log("  " + detalhe.join(", "));
  console.log("Textos das unidades: INALTERADOS (somente campos estruturados tomadaPor/data).");
  process.exit(0);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function uso() {
  console.log("Uso: node scripts/grafo-normalize.cjs [opções]");
  console.log("  --dry-run              (default) imprime artefato de review, NÃO grava estado");
  console.log("  --out <arquivo.json>   grava o artefato JSON (candidatos com veredito=null)");
  console.log("  --apply --review <arquivo.json>  aplica vereditos: ledger + campos estruturados");
  console.log("  --rewrite-snapshots    Fase 4: plano de reescrita canônica dos .md (dry-run)");
  console.log("  --rewrite-snapshots --apply  grava headers + marcadores [DEPRECATED→…] nos .md");
  console.log("  --backfill-tomada-por  preenche tomadaPor/data nulos a partir do trailer no texto (T7A)");
  console.log("  --verbose              log de progresso");
  console.log("Exit: 0 ok | 1 erro/gate | 2 uso inválido");
}

function main(argv) {
  const opts = { modo: "dry-run" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { uso(); process.exit(0); }
    else if (a === "--dry-run") opts.modo = "dry-run";
    else if (a === "--apply") { opts.modo = "apply"; opts.apply = true; }
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--review") opts.review = argv[++i];
    else if (a === "--rewrite-snapshots") opts.rewrite = true;
    else if (a === "--backfill-tomada-por") opts.backfill = true;
    else if (a === "--verbose") opts.verbose = true;
    else { console.error("ERRO: argumento desconhecido: " + a + "\n"); uso(); process.exit(2); }
  }

  if (opts.backfill) backfillTomadaPor();

  if (opts.rewrite) {
    const plano = montarPlanoReescrita();
    if (plano.erro) { console.error("ERRO: " + plano.erro); process.exit(1); }
    const relatorio = executarReescrita(plano.plano, !!opts.apply);
    console.log("==== REESCRITA CANÔNICA DE SNAPSHOTS — " + (opts.apply ? "APLICADO" : "DRY-RUN (nada gravado)") + " ====");
    for (const r of relatorio) {
      const detalhe = r.acao.startsWith("skip") ? "" :
        " · " + r.tipo + (r.alvo ? " → " + r.alvo : "") + " · header: " + r.header + " · bullets marcados: " + r.bulletsMarcados
        + (r.bulletsNaoAchados && r.bulletsNaoAchados.length ? " · NÃO localizados no arquivo: " + r.bulletsNaoAchados.join(",") : "");
      console.log("  [" + r.acao + "] " + r.node + detalhe);
    }
    console.log("Total: " + relatorio.length + " snapshot(s). " + (opts.apply ? "Concluído." : "Rode com --apply para gravar."));
    process.exit(0);
  }

  if (opts.modo === "apply") { aplicar(opts.review); process.exit(0); }

  // dry-run
  const ctx = construirCandidatos();
  const resultado = montarCandidatos(ctx);
  const relatorio = imprimirArtefato(resultado);
  console.log(relatorio);
  if (opts.out) {
    const abs = path.isAbsolute(opts.out) ? opts.out : path.join(REPO_ROOT, opts.out);
    const artefato = {
      schema: "review-v1", geradoEm: new Date().toISOString(), modo: "dry-run",
      instrucao: 'Preencha veredito "aprovar"|"reprovar" em cada candidato (motivoReprovacao opcional) e rode: node scripts/grafo-normalize.cjs --apply --review <este arquivo>',
      candidatos: resultado.candidatos.map((c) => ({
        id: c.id, familia: c.familia, node: c.node, grafo: c.grafo, nivel: c.nivel,
        snapshot: c.snapshotRel, tipo: c.tipo, granularidade: c.granularidade,
        unidadeId: c.unidadeId, texto: c.texto, tomadaPor: c.tomadaPor, dataUnidade: c.dataUnidade,
        alvo: c.alvo, alvoResolvido: c.alvoResolvido, evidencia: c.evidencia,
        motivo: c.motivo, em: c.em, veredito: null, motivoReprovacao: null
      })),
      morte: resultado.morte, gates: resultado.gates, informativos: resultado.informativos
    };
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(artefato, null, 2) + "\n", "utf8");
    console.log("Artefato JSON gravado em: " + path.relative(REPO_ROOT, abs));
  }
  process.exit(0); // suspeitas são aviso, não bloqueio (E-INV-16: conservador)
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error("ERRO: " + (err && err.message ? err.message : err));
    process.exit(1);
  }
}

module.exports = {
  normalizarTexto, semAcentos, classificarLinhaSecao, dividirFrases, separarAnotacoes,
  extrairMetadataUnidade, extrairUnidades, tokenizar, palavrasChave, casaUnidade,
  declaracoesDoNo, declaracoesTopo, extrairDeclaracaoLimpezaOs, familiaDe,
  filtrarJaNormalizados, backfillTomadaPor
};

















