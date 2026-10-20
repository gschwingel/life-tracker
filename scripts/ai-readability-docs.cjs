#!/usr/bin/env node
// ai-readability-docs.cjs — Sonda de retenção em docs AI-facing: censo de âncoras determinístico, sumarização por cosseno multilingual (Jaccard diagnóstico), Q+A resposta-vs-resposta, edição sintética.
// Paga a dívida PATCH-20260926-003 (gatilho D-DIR-05 disparado: pedido direto de
// Igor 2026-09-28). Avalia RETENÇÃO DE INFORMAÇÃO de um fold de prosa — o fold
// test da AI-IAIA-GRAMMAR (§4.2) não é mecanicamente mensurável; esta sonda mede.
//
// PATCH-SONDA-CALIBRACAO-CROSSLANG-20260930 — modo cross-language (baseline PT →
// fold EN). Evidência motivadora (runs 36661771019/36662588807/36662881495):
// governor/FDV-Tooluse 100 vs executor/FDV-Tooluse 65 no MESMO conteúdo; auditoria
// semântica independente do FDV-Sono 17/17 lossless com score 25. Causa raiz:
// (a) extractSymbols lê "SIMBOLOS:" no idioma do texto — PT e EN geram conjuntos
// disjuntos; (b) Q+A comparava resposta EN vs resposta-referência PT. Mudanças:
//   0. CENSO DE ÂNCORAS (novo, determinístico, zero LLM): números, IDs hifenizados,
//      ALL-CAPS e conteúdo backtickado do baseline devem existir verbatim no fold
//      (hard); literais citados e snake_case são reportados como soft.
//   1. SUMARIZAÇÃO: score = cosseno de embedding (multilingual) entre resumos;
//      Jaccard de símbolos mantido como diagnóstico (não pontua).
//   2. Q+A RESPOSTA-VS-RESPOSTA: o MESMO LLM responde as mesmas perguntas duas
//      vezes (contexto baseline vs contexto fold) e compara-se resposta-com-
//      resposta via cosseno — zero comparação cross-language. 10 perguntas com
//      ancoragem estrutural, temperature 0, mediana por questão.
//   3. EDIÇÃO SINTÉTICA: inalterada (1.0 em todos os runs reais).
//
// 3 provas (base = versão prosa pré-fold; doc = versão foldada atual):
//   1. SUMARIZAÇÃO CRUZADA PROSA-VS-FOLD (cosseno; Jaccard diagnóstico)
//   2. PROBE PERGUNTA-RESPOSTA (resposta-vs-resposta, cosseno, mediana)
//   3. EDIÇÃO SINTÉTICA: 5 marcadores SYNTH_EDIT_n determinísticos no doc
//
// Entradas: --doc <path> (fold atual, obrigatório), --baseline <ref-git|arquivo>
//           (versão prosa pré-fold — sem ela, provas 1-2 SKIPPED com skip declarado),
//           --mock (determinístico, sem LLM), --exit-on-fail, --llm1/--llm2, --verbose, -h.
// Saídas: relatorio JSON (stdout) + resumo; exit 0 (não-bloqueante) ou 1 com --exit-on-fail.
// Credencial: OPENROUTER_API_KEY (env ou .env do repo) — herda o carregador do irmão.
// Reuso: helpers de scripts/lib/readability-helpers.cjs (tokenize/jaccard/
//        extractSymbols/edits — extraídos do extinto CLI ai-readability.cjs) e
//        scripts/lib/embedding-client.cjs (embedQuery — multilingual).
//
// PATCH-SONDA-JUIZ-DEEPSEEK-20261020 — juiz llm2 trocado de google/gemini-3.7-flash
// (removido do dropdown 2026-08-27) para deepseek/deepseek-v4.1-flash-1017 (id PIN,
// provider distinto do llm1 → independência cross-provider preservada; veredito humano
// Igor 2026-10-20). llm1 permanece openai/gpt-6-luna.
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  tokenize,
  jaccardSets,
  extractSymbols,
  applySyntheticEdits,
} = require("./lib/readability-helpers.cjs");

const REPO_ROOT = path.resolve(__dirname, "..");

// THRESHOLDS — dois regimes, escolhidos pela detecção cross-language (§ detectarCrossLang):
//
// THRESHOLDS_DOCS — mesmo idioma (fold intra-idioma). Calibração varredura
// 2026-09-29 (N=4 docs / 5 runs reais com credencial CI, workflow "Sonda
// Semantica Docs"; runs 36600962747/36607013301/36609058448+36611670323/36609986250):
//   doc                       sumarização · Q+A · sintética
//   ANTI-STALL (#904)         0.96 · 0.70 · 1.0
//   AI-ENV-PREREQUISITES(#904) 0.91 · 1.00 · 1.0
//   FLUXO-SESSAO-ISOLADA(#898) 0.97 · 0.80 · 1.0
//   MCP-GRAFO (#898, 2 runs)  0.69/0.67 · 0.80/1.00 · 1.0
// Investigação do outlier MCP-GRAFO (diff do fold #898): a única perda REAL de
// conteúdo foi 1 menção de `overrideFrozen` (2→1); toda a prosa removida
// reapareceu como bullet. A sumarização 0.67-0.69 é variância do MEDIDOR
// (sumarizadores enumeram conjuntos de símbolos distintos quando a estrutura
// muda prosa→bullet), não perda — por isso o piso desce 0.70→0.60 e a prova
// DECISIVA de retenção é o Q+A (medido 0.70-1.00, piso 0.60 mantido). Sintética
// 1.0 ×5 (piso 0.80 mantido). Bloqueio em PR continua exigindo decisão deliberada.
const THRESHOLDS_DOCS = {
  regime: "same-language",
  anchorRetention: 1.0,
  // instrumento unificado (cosseno): migrado do Jaccard calibrado N=4 — a
  // variância 0.67-0.69 do medidor antigo era sintoma do mesmo problema que o
  // modo cross corrige; recalibração pelo mesmo corpus rotulado (declaração no
  // header). PROVISÓRIO até a separação 100% no corpus.
  summarizationCosine: 0.75,
  qaCosine: 0.6,
  syntheticEditAccuracy: 0.8,
  QA_PAIRS: 5,
};

// THRESHOLDS_CROSS — cross-language (baseline PT → fold EN). PROVISÓRIO: valores
// iniciais de projeto, a calibrar no corpus rotulado (positivos: FDV-Sono EN
// auditado 17/17 + governor/executor FDV-Tooluse; negativos: degradações
// sintéticas rotuladas em scripts/__tests__/fixtures/sonda-calibracao/) —
// separação 100% exigida antes de sair de PROVISÓRIO (aprovação humana).
const THRESHOLDS_CROSS = {
  regime: "cross-language",
  anchorRetention: 1.0, // hard anchors: números/IDs/ALL-CAPS/backtick verbatim no fold
  summarizationCosine: 0.75, // cosseno multilingual entre resumos (PROVISÓRIO)
  qaCosine: 0.6, // cosseno mediano resposta-vs-resposta (PROVISÓRIO)
  qaAnswerCosine: 0.55, // por questão (PROVISÓRIO)
  syntheticEditAccuracy: 0.8,
  QA_PAIRS: 10,
};

const FLAGS = {
  doc: null,
  baseline: null,
  mock: false,
  exitOnFail: false,
  verbose: false,
  llm1: process.env.AI_READABILITY_LLM1 || "openai/gpt-6-luna",
  llm2: process.env.AI_READABILITY_LLM2 || "deepseek/deepseek-v4.1-flash-1017",
};

function usage() {
  return [
    "Uso: node scripts/ai-readability-docs.cjs [opcoes]",
    "  --doc <path>            doc foldado atual (obrigatório)",
    "  --baseline <ref|arq>    versão prosa pré-fold (git ref ou arquivo) — sem ela provas 1-2 skipam",
    "  --mock                  modo demo determinístico, sem chamada LLM (CI/testes)",
    "  --exit-on-fail          exit 1 se qualquer prova falhar (opt-in)",
    "  --llm1/--llm2 <modelo>  modelos das provas",
    "  --verbose               log de progresso em stderr",
    "  -h/--help               esta mensagem",
  ].join("\n");
}

for (let i = 0; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "-h" || a === "--help") { console.log(usage()); process.exit(0); }
  if (a === "--mock") FLAGS.mock = true;
  if (a === "--exit-on-fail") FLAGS.exitOnFail = true;
  if (a === "--verbose") FLAGS.verbose = true;
  if (a === "--doc") FLAGS.doc = process.argv[++i];
  if (a === "--baseline") FLAGS.baseline = process.argv[++i];
  if (a === "--llm1") FLAGS.llm1 = process.argv[++i];
  if (a === "--llm2") FLAGS.llm2 = process.argv[++i];
}
// Validação CLI somente quando executado direto (o require dos testes importa
// apenas o núcleo exportado).
if (require.main === module) {
  if (!FLAGS.doc) {
    console.error("ai-readability-docs: --doc obrigatório.");
    console.error(usage());
    process.exit(2);
  }
}

function log(msg) {
  if (FLAGS.verbose) console.error("[ai-readability-docs] " + msg);
}

function lerTexto(arg) {
  const p = path.resolve(REPO_ROOT, arg);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  const cmd = `git --no-pager show --no-color ${JSON.stringify(arg)}`;
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    throw new Error("baseline ilegível (arquivo ausente e git ref falhou): " + String(err.message).split("\n")[0], { cause: err });
  }
}

// Reaproveita o carregador de credencial do irmão (env ou .env do repo).
function loadOpenRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  for (const p of [path.join(REPO_ROOT, ".env"), path.join(REPO_ROOT, "backend", ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^OPENROUTER_API_KEY\s*=\s*(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

async function callLLM(prompt, model) {
  const apiKey = loadOpenRouterKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY ausente (env ou .env). Use --mock para modo determinístico.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0 }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("OpenRouter HTTP " + res.status + " (" + model + "): " + txt.slice(0, 200));
  }
  const data = await res.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
  if (typeof content !== "string" || !content.trim()) throw new Error("OpenRouter retornou conteúdo vazio (" + model + ").");
  return content.trim();
}

// Embeddings multilingual (reusa o cliente do índice vetorial). Lazy: --mock e os
// testes offline nunca carregam o módulo (nem exigem credencial).
let _embedQuery = null;
async function embedTexto(texto) {
  if (!_embedQuery) _embedQuery = require("./lib/embedding-client.cjs").embedQuery;
  return _embedQuery(String(texto).slice(0, 8000));
}

function cosseno(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? null : dot / den;
}

function mediana(valores) {
  const v = valores.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Heurística cross-language: densidade de stopwords PT no baseline vs no doc. */
const PT_STOPWORDS = /\b(de|da|do|das|dos|que|para|com|não|uma|como|por|seu|quando|entre|sobre|será|pelo|aos)\b/g;
function detectarCrossLang(baseline, doc) {
  const dens = (t) => ((t.match(PT_STOPWORDS) || []).length) / Math.max(1, t.split(/\s+/).length);
  return dens(baseline) >= 0.08 && dens(doc) < dens(baseline) / 2;
}

/**
 * Censo de âncoras (prova 0 — determinística, zero LLM, à prova de idioma):
 * HARD (pontuam): números >=2 dígitos; tokens hifenizados com dígito ou com
 * prefixo de família de ID do repo (E-INV-*, FR-*, SP-*, D-*, KF-*, PR-*, HB-*,
 * FRAME-*, PATCH-*, BUGFIX-*, SONO-*, REANC-*, FDV-*); tokens com underscore e
 * dígito (l1_breach_events); conteúdo backtickado. SOFT (reportados, não
 * pontuam): ALL-CAPS/citados/snake_case sem dígito — podem ser tradução
 * legítima (ex.: ênfase PT "DIRECIONAL" → "DIRECTIONAL", enum §11 do FDV-Sono).
 */
const PREFIXOS_ID = new Set(["E", "FR", "SP", "KF", "D", "PR", "HB", "FRAME", "PATCH", "BUGFIX", "SONO", "REANC", "FDV", "AK", "AS"]);
function extrairAncoras(baseline) {
  const hard = new Set();
  const soft = new Set();
  for (const m of baseline.matchAll(/(?<![\w.])(\d{2,}(?:[.,]\d+)?)(?![\w.])/g)) hard.add(m[1]);
  for (const m of baseline.matchAll(/\b[A-Za-zà-ú][A-Za-z0-9à-ú]*(?:-[A-Za-z0-9à-ú]+)+\b/g)) {
    const segs = m[0].split("-");
    if (/\d/.test(m[0]) || PREFIXOS_ID.has(segs[0].toUpperCase())) hard.add(m[0]);
    else soft.add(m[0]);
  }
  for (const m of baseline.matchAll(/\b[A-Za-zà-ú][A-Za-z0-9à-ú_]*_[A-Za-z0-9à-ú_]+\b/g)) {
    if (/\d/.test(m[0])) hard.add(m[0]);
    else soft.add(m[0]);
  }
  for (const m of baseline.matchAll(/`([^`\n]+)`/g)) if (m[1].trim().length >= 2) hard.add(m[1].trim());
  for (const m of baseline.matchAll(/"([^"\n]{6,})"/g)) soft.add(m[1].trim());
  return { hard: [...hard], soft: [...soft] };
}

/** Retenção de âncoras: fração de HARD anchors verbatim no fold + misses detalhados.
 *  Normalização de localidade: decimal com vírgula (PT "99,5") aceita a forma com
 *  ponto ("99.5") — localização legítima, não perda (achado da sondagem do SLO). */
function retencaoAncoras(ancoras, doc) {
  const presente = (a) => doc.includes(a) || (/^\d+,\d+$/.test(a) && doc.includes(a.replace(",", ".")));
  const faltandoHard = ancoras.hard.filter((a) => !presente(a));
  const faltandoSoft = ancoras.soft.filter((a) => !presente(a));
  const retencao = ancoras.hard.length === 0 ? null : (ancoras.hard.length - faltandoHard.length) / ancoras.hard.length;
  return { retencao, faltandoHard, faltandoSoft };
}

// Fallback de resolução de caminho: runner Windows + dispatch pode mutilar não-ASCII
// (ex.: "Instruções.md" -> ENOENT). Casa por basename via git ls-files (quotepath off).
function resolverCaminhoNaoAscii(arg) {
  try {
    const base = path.basename(arg);
    const listar = execSync('git -c core.quotepath=false ls-files -- "' + path.posix.dirname(arg.split(path.sep).join("/")) + '"', {
      cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    });
    const candidata = listar.split("\n").map((s) => s.trim()).find((f) => f && path.basename(f) === base);
    if (candidata) return path.resolve(REPO_ROOT, candidata);
  } catch { /* fallback best-effort */ }
  return null;
}

// ---------------------------------------------------------------------------
// Núcleo puro (exportado para testes offline)
// ---------------------------------------------------------------------------

/** Retenção por LLM: símbolos do resumo do fold presentes no resumo do baseline. */
function retencaoSumario(resumoBaseline, resumoFold) {
  const base = extractSymbols(resumoBaseline);
  const fold = extractSymbols(resumoFold);
  if (base.size === 0) return null; // inconclusivo — sem símbolos no baseline
  let presentes = 0;
  for (const s of base) if (fold.has(s)) presentes++;
  return presentes / base.size;
}

/** Parseia pares "P: ...\nR: ..." emitidos pelo extrator de perguntas. */
function parseQAPairs(texto) {
  const pares = [];
  const re = /P\s*:\s*([\s\S]*?)\nR\s*:\s*([\s\S]*?)(?=\nP\s*:|$)/gi;
  let m;
  while ((m = re.exec(String(texto))) !== null) {
    const p = m[1].trim();
    const r = m[2].trim();
    if (p && r) pares.push({ p, r });
  }
  return pares;
}

/** Retenção do probe Q+A: fração de respostas do fold com Jaccard >= limiar vs baseline. */
function retencaoQA(respostasBase, respostasFold, limiar) {
  if (respostasBase.length === 0) return null;
  let ok = 0;
  for (let i = 0; i < respostasBase.length; i++) {
    const j = jaccardSets(tokenize(respostasBase[i]), tokenize(respostasFold[i] ?? ""));
    if (j >= limiar) ok++;
  }
  return ok / respostasBase.length;
}

module.exports = {
  THRESHOLDS_DOCS,
  THRESHOLDS_CROSS,
  retencaoSumario,
  parseQAPairs,
  retencaoQA,
  extrairAncoras,
  retencaoAncoras,
  cosseno,
  mediana,
  detectarCrossLang,
  applySyntheticEdits,
  // Credencial DRY (env ou .env do repo) — reusada pelo heartbeat do gate de PR
  // (scripts/sonda-gate-rodar.cjs), nunca copiada WET.
  loadOpenRouterKey,
};

// ---------------------------------------------------------------------------
// Provas (modo real)
// ---------------------------------------------------------------------------

const PROMPT_RESUMO =
  "Resuma em bullets concisos (pt-BR) o conteúdo deste documento, listando os fatos, decisões e referências técnicas observáveis. " +
  "NAO invente nada que nao esteja no documento. Somente bullets curtos. " +
  "Ao final, na linha 'SIMBOLOS:', liste os identificadores técnicos principais (nomes de arquivos, ferramentas, variáveis, regras) separados por vírgula.\n\nDOCUMENTO:\n";

/** Prova 0 — censo de âncoras: determinística, zero LLM, à prova de idioma. */
function provaAncoras(baseline, doc) {
  const ancoras = extrairAncoras(baseline);
  const { retencao, faltandoHard, faltandoSoft } = retencaoAncoras(ancoras, doc);
  const inconclusivo = retencao === null;
  return {
    retencao: inconclusivo ? null : Number(retencao.toFixed(3)),
    hardTotal: ancoras.hard.length,
    faltandoHard,
    faltandoSoft,
    pass: !inconclusivo && retencao >= THRESHOLDS_CROSS.anchorRetention,
    skip: inconclusivo,
    mock: false,
  };
}

/** Prova 1 — sumarização: cosseno multilingual entre resumos (Jaccard = diagnóstico). */
async function provaSumarizacao(baseline, doc, thresholds) {
  const pBase = PROMPT_RESUMO + baseline.slice(0, 12000);
  const pFold = PROMPT_RESUMO + doc.slice(0, 12000);
  const [b1, f1, b2, f2] = await Promise.all([
    callLLM(pBase, FLAGS.llm1), callLLM(pFold, FLAGS.llm1),
    callLLM(pBase, FLAGS.llm2), callLLM(pFold, FLAGS.llm2),
  ]);
  const [eb1, ef1, eb2, ef2] = await Promise.all([
    embedTexto(b1), embedTexto(f1), embedTexto(b2), embedTexto(f2),
  ]);
  const cos1 = cosseno(eb1, ef1);
  const cos2 = cosseno(eb2, ef2);
  const ret1 = retencaoSumario(b1, f1);
  const ret2 = retencaoSumario(b2, f2); // diagnóstico (não pontua)
  const inconclusivo = cos1 === null || cos2 === null;
  const retencao = inconclusivo ? 0 : (cos1 + cos2) / 2;
  return {
    retencao: Number(retencao.toFixed(3)),
    porLLM: {
      [FLAGS.llm1]: { cosseno: cos1 === null ? null : Number(cos1.toFixed(3)), jaccardDiag: ret1 },
      [FLAGS.llm2]: { cosseno: cos2 === null ? null : Number(cos2.toFixed(3)), jaccardDiag: ret2 },
    },
    pass: !inconclusivo && retencao >= thresholds.summarizationCosine,
    skip: false,
  };
}

/** Prova 2 — Q+A resposta-vs-resposta: mesmo LLM responde com baseline vs fold no
 *  contexto; compara-se resposta-com-resposta via cosseno (zero comparação
 *  cross-language). Mediana por questão; retenção = média das medianas dos LLMs. */
async function provaQA(baseline, doc, thresholds) {
  const promptQ =
    "Leia o documento abaixo e produza exatamente " + thresholds.QA_PAIRS + " pares de pergunta-resposta sobre FATOS concretos dele " +
    "(números, nomes, regras, decisões — nada opinativo). Ancore estruturalmente: 1 par por seção principal do documento, na ordem. " +
    "Formato ESTRITO, um par por bloco:\nP: <pergunta>\nR: <resposta factual curta>\n\nDOCUMENTO:\n" +
    baseline.slice(0, 12000);
  const bruto = await callLLM(promptQ, FLAGS.llm1);
  const pares = parseQAPairs(bruto).slice(0, thresholds.QA_PAIRS);
  if (pares.length < 3) return { retencao: 0, pares: pares.length, pass: false, skip: false, motivo: "extrator devolveu <3 pares" };
  const perguntas = pares.map((x) => x.p).join("\n");

  const responde = async (modelo, contexto) => {
    const promptA =
      "Responda CADA pergunta abaixo usando SOMENTE o documento fornecido. Se o documento não contém a resposta, escreva 'AUSENTE'. " +
      "Formato: uma resposta por linha, na ordem das perguntas.\n\nDOCUMENTO:\n" + contexto.slice(0, 12000) + "\n\nPERGUNTAS:\n" + perguntas;
    return callLLM(promptA, modelo);
  };
  const linhas = (t) => String(t).split(/\n+/).map((s) => s.trim()).filter(Boolean);

  const retencaoPorLLM = {};
  let inconclusivo = false;
  for (const modelo of [FLAGS.llm1, FLAGS.llm2]) {
    const [respBase, respFold] = await Promise.all([
      responde(modelo, baseline),
      responde(modelo, doc),
    ]);
    const lb = linhas(respBase);
    const lf = linhas(respFold);
    const porQuestao = [];
    for (let i = 0; i < pares.length; i++) {
      const [eb, ef] = await Promise.all([embedTexto(lb[i] ?? ""), embedTexto(lf[i] ?? "")]);
      const c = cosseno(eb, ef);
      porQuestao.push(c === null ? 0 : c);
    }
    const med = mediana(porQuestao);
    if (med === null) inconclusivo = true;
    retencaoPorLLM[modelo] = { mediana: med === null ? null : Number(med.toFixed(3)), questoes: porQuestao.map((c) => Number(c.toFixed(3))) };
  }
  const valores = Object.values(retencaoPorLLM).map((x) => x.mediana).filter((x) => x !== null);
  const retencao = inconclusivo || valores.length === 0 ? 0 : valores.reduce((a, b) => a + b, 0) / valores.length;
  return {
    retencao: Number(retencao.toFixed(3)),
    porLLM: retencaoPorLLM,
    pares: pares.length,
    pass: !inconclusivo && valores.length > 0 && retencao >= thresholds.qaCosine,
    skip: false,
  };
}

async function provaEdicaoSintetica(doc) {
  const { modified, edits } = applySyntheticEdits(doc);
  const numbered = modified.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
  const prompt =
    "Procure o texto literal 'SYNTH_EDIT_' no documento abaixo (linhas numeradas) e liste o número de CADA linha onde ele aparece. " +
    "Responda somente com os números, um por linha.\n\n--- DOCUMENTO MODIFICADO (linhas numeradas) ---\n" +
    numbered.slice(0, 22000);
  const answer = await callLLM(prompt, FLAGS.llm1);
  const found = new Set((answer.match(/\d+/g) || []).map(Number));
  const expected = new Set(edits.map((e) => e.line));
  let matched = 0;
  for (const l of expected) if ([...found].some((f) => Math.abs(f - l) <= 1)) matched++;
  const accuracy = matched / Math.max(1, expected.size);
  return { accuracy: Number(accuracy.toFixed(2)), edits: edits.length, pass: accuracy >= THRESHOLDS_DOCS.syntheticEditAccuracy, skip: false };
}

// ---------------------------------------------------------------------------
// Modo mock (determinístico, sem custo — testes/CI)
// ---------------------------------------------------------------------------

function runMock(baseline, doc) {
  const syn = applySyntheticEdits(doc);
  // sem baseline, prova 0 skipa (mesmo contrato das provas 1-2)
  const ancoras = baseline
    ? provaAncoras(baseline, doc)
    : { retencao: null, pass: true, skip: true, mock: true, hardTotal: null, faltandoHard: [], faltandoSoft: [] };
  return {
    anchors: { ...ancoras, mock: true },
    summarization: { retencao: 0.92, pass: true, mock: true, baselineChars: baseline.length, docChars: doc.length },
    qaProbe: { retencao: 0.85, pares: THRESHOLDS_CROSS.QA_PAIRS, pass: true, mock: true },
    syntheticEdits: { accuracy: 0.90, edits: syn.edits.length, pass: true, mock: true },
    score: 90,
    costEstimate: { tokens: Math.ceil((baseline.length + doc.length) / 4) * 5, costUsd: 0, mock: true },
  };
}

async function runReal(baseline, doc, thresholds, crossLang) {
  const [anc, sum, qa, syn] = await Promise.all([
    Promise.resolve(provaAncoras(baseline, doc)),
    provaSumarizacao(baseline, doc, thresholds),
    provaQA(baseline, doc, thresholds),
    provaEdicaoSintetica(doc),
  ]);
  const score = Math.round(
    15 * (anc.pass ? 1 : 0) + 30 * (sum.pass ? 1 : 0) + 35 * (qa.pass ? 1 : 0) + 20 * (syn.pass ? 1 : 0)
  );
  return {
    anchors: { ...anc, mock: false },
    summarization: { ...sum, mock: false },
    qaProbe: { ...qa, mock: false },
    syntheticEdits: { ...syn, mock: false },
    score,
    costEstimate: { tokens: Math.ceil((baseline.length + doc.length) / 4) * 10, costUsd: null, mock: false },
    regime: crossLang ? "cross-language" : "same-language",
  };
}

async function main() {
  try {
    let docPath = path.resolve(REPO_ROOT, FLAGS.doc);
    if (!fs.existsSync(docPath)) {
      const alternativo = resolverCaminhoNaoAscii(FLAGS.doc);
      if (alternativo) {
        log("doc não encontrado no caminho literal — resolvido via ls-files: " + alternativo);
        docPath = alternativo;
      }
    }
    const doc = fs.readFileSync(docPath, "utf8");
    let baseline = "";
    if (FLAGS.baseline) {
      baseline = lerTexto(FLAGS.baseline);
      log("baseline: " + baseline.length + " chars | doc: " + doc.length + " chars");
    } else {
      log("sem --baseline: provas 1-2 vão SKIPAR (skip declarado)");
    }

    const crossLang = !!FLAGS.baseline && detectarCrossLang(baseline, doc);
    const thresholds = crossLang ? THRESHOLDS_CROSS : THRESHOLDS_DOCS;
    log("regime: " + thresholds.regime + " (crossLang=" + crossLang + ")");

    let results;
    if (FLAGS.mock) {
      results = runMock(baseline, doc);
    } else if (!FLAGS.baseline) {
      const syn = await provaEdicaoSintetica(doc);
      results = {
        anchors: { retencao: null, pass: true, skip: true, mock: false },
        summarization: { retencao: null, pass: true, skip: true, mock: false },
        qaProbe: { retencao: null, pass: true, skip: true, mock: false },
        syntheticEdits: { ...syn, mock: false },
        score: Math.round(20 * (syn.pass ? 1 : 0)),
        costEstimate: { tokens: Math.ceil(doc.length / 4), costUsd: null, mock: false },
      };
    } else {
      results = await runReal(baseline, doc, thresholds, crossLang);
    }

    const failed = Object.entries(results)
      .filter(([k, v]) => ["anchors", "summarization", "qaProbe", "syntheticEdits"].includes(k) && v.pass === false)
      .map(([k]) => k);

    const report = {
      score: results.score,
      pass: failed.length === 0,
      failed,
      checks: {
        anchors: {
          pass: results.anchors.pass, retencao: results.anchors.retencao ?? null,
          hardTotal: results.anchors.hardTotal ?? null, skip: !!results.anchors.skip, mock: !!results.anchors.mock,
          faltandoHard: results.anchors.faltandoHard ?? [], faltandoSoft: (results.anchors.faltandoSoft ?? []).slice(0, 20),
        },
        summarization: { pass: results.summarization.pass, retencao: results.summarization.retencao, skip: !!results.summarization.skip, mock: !!results.summarization.mock, porLLM: results.summarization.porLLM },
        qaProbe: { pass: results.qaProbe.pass, retencao: results.qaProbe.retencao, pares: results.qaProbe.pares, skip: !!results.qaProbe.skip, mock: !!results.qaProbe.mock, porLLM: results.qaProbe.porLLM },
        syntheticEdits: { pass: results.syntheticEdits.pass, accuracy: results.syntheticEdits.accuracy, mock: !!results.syntheticEdits.mock },
      },
      costEstimate: results.costEstimate,
      regime: results.regime || thresholds.regime,
      thresholds,
      mode: FLAGS.mock ? "mock" : "llm",
      nota: "cross-language v1 (PATCH-SONDA-CALIBRACAO-CROSSLANG-20260930): âncoras determinísticas + cosseno multilingual + Q+A resposta-vs-resposta; thresholds PROVISÓRIOS até calibração no corpus rotulado (aprovação humana)",
    };

    console.log(JSON.stringify(report, null, 2));
    console.log(
      "\nAI-Readability-Docs nota " + report.score + "/100 — " + (report.pass ? "PASS ✅" : "FAIL ❌ [" + failed.join(", ") + "]") +
      " | modo " + report.mode + " | regime " + report.regime
    );

    if (FLAGS.exitOnFail && !report.pass) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("ai-readability-docs: " + err.message);
    if (FLAGS.exitOnFail) process.exit(1);
    process.exit(0);
  }
}

if (require.main === module) main();
