// scripts/__tests__/gerar-indice-vetorial.test.cjs
// FR-SEM-03: Teste de integração do gerador do índice vetorial (node:test).
// Mocka a OpenRouter API (embedBatch) via require.cache — sem rede, determinístico.
// Verifica sidecar + binário Float32Array, 1536d, fileHash, .gitattributes LFS e
// incremental (P2): arquivo inalterado não é re-embedado.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

function makeVector() {
  const v = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    v[i] = (i % 10) / 10;
  }
  return v;
}

// Injeta mock do embedding-client via require.cache ANTES de requerir o gerador
// (o gerador desestrutura embedBatch na carga — mock por propriedade não funcionaria).
const realEmbeddingPath = require.resolve("../lib/embedding-client.cjs");
let embedCalls = 0;
const mockEmbedBatch = async (texts) => {
  embedCalls += 1;
  return texts.map(() => makeVector());
};
require.cache[realEmbeddingPath] = {
  id: realEmbeddingPath,
  filename: realEmbeddingPath,
  loaded: true,
  exports: {
    embedBatch: mockEmbedBatch,
    embedQuery: async () => makeVector(),
    EmbeddingApiError: class EmbeddingApiError extends Error {},
  },
};

// FR-SEM-06 (auditoria 2026-08-19): os testes do gerador NUNCA tocam os índices
// reais (corriam com os mocks e corrompiam indice-vetorial.json/.bin). Agora cada
// execução escreve em temp-dir via env VETORIAL_INDEX_JSON/VETORIAL_INDEX_BIN —
// mesmo padrão do buscar-vetorial.cjs. Zero efeito colateral no repo.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vetorial-gen-"));
const INDEX_JSON = path.join(TMP_DIR, "indice-vetorial.json");
const INDEX_BIN = path.join(TMP_DIR, "indice-vetorial.bin");
const ATTRS_FILE = path.join(__dirname, "..", "..", ".gitattributes");

function withTempIndex(fn) {
  process.env.VETORIAL_INDEX_JSON = INDEX_JSON;
  process.env.VETORIAL_INDEX_BIN = INDEX_BIN;
  try {
    return fn();
  } finally {
    delete process.env.VETORIAL_INDEX_JSON;
    delete process.env.VETORIAL_INDEX_BIN;
  }
}

const gerador = require("../gerar-indice-vetorial.cjs");

test("gerador produz sidecar + binário Float32Array com 1536d, fileHash e .gitattributes LFS", async () => {
  // Remove índice pré-existente (determinístico — independente de execuções anteriores)
  if (fs.existsSync(INDEX_JSON)) {
    fs.unlinkSync(INDEX_JSON);
  }
  if (fs.existsSync(INDEX_BIN)) {
    fs.unlinkSync(INDEX_BIN);
  }
  embedCalls = 0;
  await withTempIndex(() => gerador.main());

  assert.ok(fs.existsSync(INDEX_JSON), "sidecar criado");
  assert.ok(fs.existsSync(INDEX_BIN), "binário criado");

  const sidecar = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
  assert.equal(sidecar.model, "openai/text-embedding-3-small");
  assert.equal(sidecar.dimensions, 1536);
  assert.ok(sidecar.generatedAt);
  // P7 rev3: o sidecar publica o contrato de cobertura (classe+glob+justificativa).
  assert.ok(Array.isArray(sidecar.exclusoes) && sidecar.exclusoes.length > 0, "sidecar.exclusoes presente");
  for (const e of sidecar.exclusoes) {
    assert.ok(e.classe && e.glob && e.justificativa, `exclusão sem classe/glob/justificativa: ${JSON.stringify(e)}`);
  }
  assert.ok(sidecar.chunks.length > 100, `corpus deve ter >100 chunks (got ${sidecar.chunks.length})`);
  for (const c of sidecar.chunks.slice(0, 10)) {
    assert.ok(c.path, "path presente");
    assert.ok(c.exportName, "exportName presente");
    assert.ok(c.fileHash, "fileHash presente");
    assert.equal(typeof c.offset, "number", "offset numérico");
    assert.equal(c.length, 1536, "length = 1536");
  }

  const bin = fs.readFileSync(INDEX_BIN);
  assert.ok(bin.length > 0, "bin não vazio");
  const firstVector = new Float32Array(bin.buffer, 0, 1536);
  assert.equal(firstVector.length, 1536, "primeiro vetor tem 1536 floats");

  const attrs = fs.readFileSync(ATTRS_FILE, "utf8");
  assert.ok(attrs.includes("indice-vetorial.bin filter=lfs"), ".gitattributes com LFS");

  assert.ok(embedCalls >= 1, "embedBatch foi chamado na 1ª execução");
});

test("subdivisão: nenhum chunk excede 8000 chars e texto integral é preservado (P1)", () => {
  const chunks = gerador.buildChunks();
  const MAX = 8000;

  const oversized = chunks.filter((c) => c.content.length > MAX);
  assert.equal(oversized.length, 0, `nenhum chunk > ${MAX} chars (got ${oversized.length})`);

  // O MANIFEST (docs gigante) deve estar paginado com sufixo [i/N]
  const manifestChunks = chunks.filter((c) => c.path.endsWith("AI-PROJECT-MANIFEST.md"));
  assert.ok(manifestChunks.length > 1, `MANIFEST paginado em ${manifestChunks.length} chunks`);
  // A paginacao [i/N] aplica-se apenas a secoes que excedem MAX_SAFE_CHARS (ex.:
  // cauda meta_*); secoes pequenas nao precisam de sufixo (CORRECAO 2026-08-31:
  // antes o manifest inteiro virava 1 chunk e o corpo era descartado).
  const paginated = manifestChunks.filter((c) => /\[\d+\/\d+\]$/.test(c.exportName));
  assert.ok(paginated.length > 0, `manifest tem secoes paginadas [i/N] (got ${manifestChunks.length} chunks)`);

  // P7 rev3 (2026-10-03, FR-P7REV3-SEM-01) — default-include: a árvore rastreada
  // entra no corpus (scripts/, Method/ etc. passam a ser visíveis).
  const scriptsChunks = chunks.filter((c) => c.path.startsWith("scripts/"));
  assert.ok(scriptsChunks.length > 0, `scripts/ incluído no corpus (got ${scriptsChunks.length})`);
  const agentsChunks = chunks.filter((c) => c.path.startsWith("Method/"));
  assert.ok(agentsChunks.length > 0, `Method/ incluído no corpus (got ${agentsChunks.length})`);
  const governados = chunks.filter((c) =>
    /LILA-DEV[/\\](planejamento[/\\](snapshots|hardening|discovery)|kfs|hardening|execucao[/\\]auditorias)[/\\]/.test(c.path),
  );
  assert.ok(governados.length > 0, `LILA-DEV governado incluído no corpus (got ${governados.length})`);
  // Exclusões declaradas (3 classes) NUNCA entram no corpus.
  const excluidos = chunks.filter((c) =>
    /LILA-DEV[/\\](historico|Canonical)[/\\]/.test(c.path) ||
    /LILA-DEV[/\\]execucao[/\\](logs|logs-arquivo|evidencias)[/\\]/.test(c.path) ||
    c.path === "indice-vetorial.json" ||
    c.path === "indice-vetorial.bin" ||
    c.path === "LILA-DEV/indice-rastreabilidade.json" ||
    /LILA-DEV[/\\]planejamento[/\\](grafo|decisoes-ledger)\.json$/.test(c.path),
  );
  assert.equal(excluidos.length, 0, `excluídos das 3 classes fora do corpus (got ${excluidos.length})`);

  // Integralidade: soma dos fragmentos do MANIFEST = soma dos chars originais somados.
  // Piso ajustado 2026-09-08 (MANIFEST-V3-ESTADO-PURO-N3): a v3.0 (~55KB) nao tem a
  // cauda meta_* da v2.x (164KB) — o invariante e o conteudo integral preservado em
  // chunks, nao o tamanho historico do documento.
  const totalManifestChars = manifestChunks.reduce((sum, c) => sum + c.content.length, 0);
  assert.ok(totalManifestChars > 40000, `MANIFEST integral preservado (>40K chars): ${totalManifestChars}`);
});

test("incremental: segunda execução com hash inalterado NÃO re-embedda (P2)", async () => {
  // Remove índice para garantir 1ª execução embedda (índice do teste 1 não interfere)
  if (fs.existsSync(INDEX_JSON)) {
    fs.unlinkSync(INDEX_JSON);
  }
  if (fs.existsSync(INDEX_BIN)) {
    fs.unlinkSync(INDEX_BIN);
  }
  embedCalls = 0;
  await withTempIndex(() => gerador.main());
  const firstCalls = embedCalls;
  assert.ok(firstCalls > 0, "1ª execução embeddou");

  await withTempIndex(() => gerador.main());
  assert.equal(embedCalls, firstCalls, "2ª execução não chamou embedBatch (hash inalterado)");

  const sidecar = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
  assert.ok(sidecar.chunks.length > 100, "chunks mantidos após re-execução");
});

test("P7 rev3 — recorte: EXCLUSIONS (3 classes, com justificativa) e isExcluded", () => {
  const classes = [...new Set(gerador.EXCLUSIONS.map((e) => e.classe))].sort();
  assert.deepEqual(classes, ["DELIBERATE", "DERIVED/ECHO", "SECRET"], "exatamente as 3 classes congeladas");
  for (const e of gerador.EXCLUSIONS) {
    assert.equal(typeof e.glob, "string");
    assert.ok(e.glob.length > 0, "glob não vazio");
    assert.ok(e.justificativa && e.justificativa.length > 0, `glob sem justificativa: ${e.glob}`);
  }
  // Excluídos (por classe)
  assert.equal(gerador.isExcluded("LILA-DEV/Canonical/FDV-PLAN.md"), true, "Canonical (DELIBERATE)");
  assert.equal(gerador.isExcluded("LILA-DEV/historico/keyframes/KF-01.md"), true, "historico (DELIBERATE)");
  assert.equal(gerador.isExcluded("LILA-DEV/execucao/logs/x-log.md"), true, "logs (DERIVED/ECHO)");
  assert.equal(gerador.isExcluded("LILA-DEV/execucao/logs-arquivo/y-log.md"), true, "logs-arquivo (DERIVED/ECHO)");
  assert.equal(gerador.isExcluded("LILA-DEV/execucao/evidencias/e.md"), true, "evidencias (DERIVED/ECHO)");
  assert.equal(gerador.isExcluded("indice-vetorial.json"), true, "sidecar do índice (DERIVED/ECHO)");
  assert.equal(gerador.isExcluded("LILA-DEV/planejamento/grafo.json"), true, "grafo gerado (DERIVED/ECHO)");
  assert.equal(gerador.isExcluded(".env"), true, "env (SECRET)");
  assert.equal(gerador.isExcluded("backend/.env.test"), true, "env variant (SECRET)");
  assert.equal(gerador.isExcluded("infra/keys/server.pem"), true, "chave (SECRET)");
  // Incluídos (default-include)
  assert.equal(gerador.isExcluded("scripts/verificar-frescor-indice-vetorial.cjs"), false, "scripts (default-include)");
  assert.equal(gerador.isExcluded("Method/agente-de-planejamento-v2.md"), false, "Method (default-include)");
  assert.equal(gerador.isExcluded("LILA-DEV/execucao/auditorias/a.md"), false, "auditorias (default-include)");
  assert.equal(gerador.isExcluded("LILA-DEV/planejamento/migracao/frs-retroativos/FR-P7REV3-SEM-01.md"), false, "migracao (default-include)");
  assert.equal(gerador.isExcluded("CHANGELOG.md"), true, "CHANGELOG (aposentado 2026-10-06 — exclusão defensiva DERIVED/ECHO; OPEN POINT resolvido)");
});