#!/usr/bin/env node
// scripts/buscar-vetorial.cjs
// FR-SEM-04: busca vetorial em memória — cosine similarity contra o índice vetorial.
// Carrega indice-vetorial.json (sidecar) + indice-vetorial.bin (Float32Array), embedeia
// a query via embedding-client.cjs (embedQuery), computa cosine similarity contra todos
// os chunks, filtra por threshold <DEFAULT_THRESHOLD>, ordena por score descendente e
// retorna top-K (default 5). Output: JSON [{path, exportName, snippet, score}].
// Cobertura (P7 rev3, FR-P7REV3-SEM-01): o índice é DEFAULT-INCLUDE do repositório
// (árvore rastreada; extensões .md .ts .tsx .cjs .js .mjs .py .yaml .yml .ps1 .sh .sql)
// menos as EXCLUSÕES DECLARADAS em três classes — SECRET (env/keys/credentials),
// DERIVED/ECHO (JSONs gerados: grafo/ledgers/rastreabilidade, o próprio índice, dist/,
// execucao/logs*, execucao/evidencias/) e DELIBERATE (LILA-DEV/Canonical/, LILA-DEV/historico/).
// A lista vive no campo `exclusoes` do sidecar — ver header de gerar-indice-vetorial.cjs.
// Uso: node scripts/buscar-vetorial.cjs "query"
// Env de teste: VETORIAL_INDEX_JSON / VETORIAL_INDEX_BIN sobrepõem os caminhos dos índices
// (usado pelos testes com sidecar+bin de fixture — sem API, sem tocar os índices reais).
// Fonte da key (N2): o CLI roda com cwd na raiz onde não existe OPENROUTER_API_KEY;
// carrega backend/.env explicitamente (mesmo padrão do gerar-indice-vetorial.cjs, FR-SEM-02).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { embedQuery } = require("./lib/embedding-client.cjs");
const { fileHash, resolveSource } = require("./lib/file-hash.cjs");

const DEFAULT_INDEX_JSON = path.join(__dirname, "..", "indice-vetorial.json");
const DEFAULT_INDEX_BIN = path.join(__dirname, "..", "indice-vetorial.bin");
const DEFAULT_TOP_K = 5;
// Calibração empírica 2026-08-17 (P1 FR-SEM-04): com text-embedding-3-small sobre o
// corpus real (1082 chunks), a banda de cosine comprime em 0.25-0.55 (máx 0.52).
// Cotovelo da varredura = 0.40 (mantém recall@5 no teto de 83%; 0.45 custa 17 pontos;
// 0.70 = 0% de recall). Evidência completa no snapshot-patch FR-SEM-04-patch.md.
const DEFAULT_THRESHOLD = 0.4;
const SNIPPET_CHARS = 200;

// P7 rev2 (PATCH-VETORIAL-CORPUS-GOVERNADO 2026-10-01) — cap de diversidade
// LILA-DEV no top-K: a prosa de snapshots/auditorias casa semanticamente com
// quase qualquer query em linguagem natural; sem cap, o corpus governado
// expandido desbanca código e docs (recall@5 do fixture de código caiu
// 83%→61%, medido 2026-10-01). Máximo 2 chunks de LILA-DEV no top-K — os 2
// melhores permanecem visíveis (contexto de decisão útil mesmo em queries de
// código). Paridade com backend/src/services/github-read.ts (comCapLila).
const LILA_TOP_K_CAP = 2;
function comCapLila(ordenados, topK) {
  const top = [];
  let lila = 0;
  for (const r of ordenados) {
    if (top.length >= topK) break;
    if (r.path.startsWith("LILA-DEV/")) {
      if (lila >= LILA_TOP_K_CAP) continue;
      lila++;
    }
    top.push(r);
  }
  return top;
}

function loadEnvironment() {
  if (process.env.OPENROUTER_API_KEY) {
    return;
  }
  const envFile = path.join(__dirname, "..", "backend", ".env");
  if (!fs.existsSync(envFile)) {
    return;
  }
  // Parse manual do backend/.env (formato KEY=value) — sem dependência nova de dotenv
  const raw = fs.readFileSync(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function indexJsonPath(opts) {
  return (opts && opts.indexJson) || process.env.VETORIAL_INDEX_JSON || DEFAULT_INDEX_JSON;
}

function indexBinPath(opts) {
  return (opts && opts.indexBin) || process.env.VETORIAL_INDEX_BIN || DEFAULT_INDEX_BIN;
}

/**
 * Cosine similarity entre dois vetores numéricos.
 * Retorna 0 se qualquer magnitude for zero. Usa o menor comprimento (defensivo).
 */
function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function snippetOf(content) {
  const clean = String(content || "").replace(/\s+/g, " ").trim();
  return clean.length > SNIPPET_CHARS ? clean.slice(0, SNIPPET_CHARS) + "…" : clean;
}

const STALE_PREFIX = "[STALE: regen pendente] ";

// SP-INDICES-VETORIAL-01 (segurança epistêmica no query-time): classifica o
// frescor de um chunk comparando o fileHash do sidecar com o hash atual do
// arquivo fonte. Arquivo ausente ou hash divergente = stale. Chunk sem
// fileHash comparável = fresco (não há como afirmar staleness — D3 do sprint).
function stalenessOf(chunk) {
  if (!chunk || typeof chunk.path !== "string" || typeof chunk.fileHash !== "string") {
    return { stale: false, motivo: null };
  }
  const resolved = resolveSource(chunk.path);
  if (!fs.existsSync(resolved)) {
    return { stale: true, motivo: "ausente" };
  }
  try {
    if (fileHash(resolved) === chunk.fileHash) {
      return { stale: false, motivo: null };
    }
    return { stale: true, motivo: "divergente" };
  } catch {
    return { stale: true, motivo: "ilegivel" };
  }
}

// Conta arquivos rastreados pelo git criados/modificados APÓS o generatedAt do
// sidecar (aviso global de cobertura — stderr, nunca stdout). Retorna
// { mudados } ou { erro } quando o git falha (fora de repo, sem git, etc.).
function arquivosMudadosApos(generatedAt) {
  const desde = new Date(generatedAt).getTime();
  if (!Number.isFinite(desde)) {
    return { erro: "timestamp invalido" };
  }
  let nomes;
  try {
    nomes = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer", timeout: 10000 });
  } catch (err) {
    return { erro: String((err && err.message) || err).split("\n")[0] };
  }
  const paths = String(nomes)
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
  let mudados = 0;
  for (const rel of paths) {
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(path.join(process.cwd(), rel)).mtimeMs;
    } catch {
      mudados += 1; // arquivo listado mas ilegível = conta como possivelmente novo
      continue;
    }
    if (Number.isFinite(mtimeMs) && mtimeMs > desde) {
      mudados += 1;
    }
  }
  return { mudados };
}

// Emite o aviso global de cobertura no stderr (nunca polui o stdout JSON).
// Com generatedAt válido: timestamp + idade + contagem de rastreados mudados.
// Sem generatedAt ou com falha de git: aviso degradado explícito — nunca silêncio.
function avisarCobertura(sidecar) {
  const generatedAt = sidecar && sidecar.generatedAt;
  if (typeof generatedAt !== "string" || !generatedAt) {
    process.stderr.write("AVISO: sidecar sem timestamp de build — staleness não verificável.\n");
    return;
  }
  const idadeMs = Date.now() - new Date(generatedAt).getTime();
  const idadeH = Number.isFinite(idadeMs) ? Math.max(0, Math.floor(idadeMs / 3600000)) : null;
  const idadeTxt = idadeH === null ? "idade desconhecida" : `${idadeH}h atrás`;
  const res = arquivosMudadosApos(generatedAt);
  if (res.erro) {
    process.stderr.write(
      `AVISO: índice construído em ${generatedAt} (${idadeTxt}); verificação de cobertura indisponível (${res.erro}) — resultados podem não refletir o estado atual.\n`,
    );
    return;
  }
  process.stderr.write(
    `AVISO: índice construído em ${generatedAt} (${idadeTxt}); ${res.mudados} arquivo(s) rastreados mudaram desde então — resultados podem não refletir o estado atual; arquivos novos podem estar ausentes do índice.\n`,
  );
}

/**
 * Busca vetorial em memória: carrega sidecar + binário, embedeia a query
 * (ou usa queryVector congelado de teste), computa cosine contra todos os chunks,
 * filtra por threshold, ordena por score descendente e retorna top-K.
 *
 * @param {string} query
 * @param {{topK?:number, threshold?:number, queryVector?:number[], indexJson?:string, indexBin?:string, avisar?:boolean}} [opts]
 *   queryVector: vetor congelado (testes cross-runtime/sem API) — quando ausente, embedeia via embedQuery.
 *   avisar: quando false, suprime o aviso global de cobertura no stderr (testes que capturam stderr).
 * @returns {Promise<Array<{path:string, exportName:string, snippet:string, score:number, stale:boolean}>>}
 *   stale: sempre presente — true quando o arquivo fonte está ausente ou com hash
 *   divergente; false caso contrário. O ranking/ordenacao NÃO muda por staleness
 *   (campo aditivo — golden recall@5 intocado).
 */
async function buscarVetorial(query, opts = {}) {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  const sidecar = JSON.parse(fs.readFileSync(indexJsonPath(opts), "utf8"));
  const bin = fs.readFileSync(indexBinPath(opts));
  const queryVector = opts.queryVector || (await embedQuery(query));

  const results = [];
  const scope = opts.scope || "all";
  for (const c of sidecar.chunks || []) {
    // P7 rev2 — dial de escopo: "code" exclui o corpus governado (precisão de
    // código igual ao corpus pré-rev2), "governance" é o recorte inverso.
    // Paridade com github-read.ts (githubSemanticSearch).
    if (scope === "code" && c.path.startsWith("LILA-DEV/")) continue;
    if (scope === "governance" && !c.path.startsWith("LILA-DEV/")) continue;
    if (!c.length || typeof c.offset !== "number") {
      continue;
    }
    const startByte = c.offset * 4;
    const vector = new Float32Array(bin.buffer, startByte, c.length);
    const score = cosine(queryVector, vector);
    if (score >= threshold) {
      const { stale } = stalenessOf(c);
      const snippet = snippetOf(c.content);
      results.push({
        path: c.path,
        exportName: c.exportName,
        snippet: stale ? STALE_PREFIX + snippet : snippet,
        score: Math.round(score * 10000) / 10000,
        stale,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top = comCapLila(results, topK);
  if (opts.avisar !== false) {
    avisarCobertura(sidecar);
  }
  return top;
}

async function main() {
  loadEnvironment();
  const query = process.argv[2];
  if (!query) {
    process.stderr.write('Uso: node scripts/buscar-vetorial.cjs "query" [--scope=all|code|governance]\n');
    process.exit(2);
  }
  const scopeArg = process.argv.find((a) => a.startsWith("--scope="));
  const scopeVal = scopeArg ? scopeArg.split("=")[1] : "all";
  if (!["all", "code", "governance"].includes(scopeVal)) {
    process.stderr.write(`Escopo inválido: ${scopeVal} (use all|code|governance)\n`);
    process.exit(2);
  }
  try {
    const results = await buscarVetorial(query, { scope: scopeVal });
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`Erro: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { buscarVetorial, cosine, main, stalenessOf, avisarCobertura, arquivosMudadosApos, STALE_PREFIX, DEFAULT_TOP_K, DEFAULT_THRESHOLD };

if (require.main === module) {
  main();
}