// scripts/__tests__/buscar-vetorial-staleness.test.cjs
// SP-INDICES-VETORIAL-01 (D4/D6): staleness declarada no query-time (node:test).
// Sem rede, determinístico: sidecar+bin de fixture em temp-dir via env
// VETORIAL_INDEX_JSON/VETORIAL_INDEX_BIN + queryVector congelado.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buscarVetorial, STALE_PREFIX } = require("../buscar-vetorial.cjs");
const { fileHash } = require("../lib/file-hash.cjs");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vetorial-stale-"));

function vetorBase() {
  return [1, 0.5, 0.25, 0.125, 0, 0, 0, 0];
}

function gravarFixture({ chunks, generatedAt }) {
  const dir = fs.mkdtempSync(path.join(TMP, "idx-"));
  const jsonPath = path.join(dir, "indice-vetorial.json");
  const binPath = path.join(dir, "indice-vetorial.bin");
  const floats = [];
  const sidecarChunks = chunks.map((c, i) => {
    const v = c.vector || vetorBase();
    const sidecar = {
      path: c.path,
      exportName: c.exportName || `exp${i}`,
      content: c.content || `conteudo ${i}`,
      startLine: 1,
      fileHash: c.fileHash,
      offset: floats.length,
      length: v.length,
    };
    floats.push(...v);
    return sidecar;
  });
  fs.writeFileSync(binPath, Buffer.from(new Float32Array(floats).buffer));
  const sidecar = { version: 1, model: "test", dimensions: 8, chunks: sidecarChunks };
  if (generatedAt !== undefined) {
    sidecar.generatedAt = generatedAt;
  }
  fs.writeFileSync(jsonPath, JSON.stringify(sidecar));
  return { jsonPath, binPath };
}

function comIndice(jsonPath, binPath, fn) {
  process.env.VETORIAL_INDEX_JSON = jsonPath;
  process.env.VETORIAL_INDEX_BIN = binPath;
  try {
    return fn();
  } finally {
    delete process.env.VETORIAL_INDEX_JSON;
    delete process.env.VETORIAL_INDEX_BIN;
  }
}

function capturarStderr(fn) {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      process.stderr.write = orig;
    })
    .then((ret) => ({ ret, stderr: chunks.join("") }));
}

function relTmp(file) {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}
test("hash divergente -> stale:true + prefixo no snippet", async () => {
  const src = fs.mkdtempSync(path.join(TMP, "src-"));
  const file = path.join(src, "a.ts");
  fs.writeFileSync(file, "export const a = 2;", "utf8");
  const fix = gravarFixture({
    generatedAt: new Date().toISOString(),
    chunks: [{ path: relTmp(file), content: "conteudo antigo", fileHash: "0".repeat(64) }],
  });
  const { ret: results, stderr } = await capturarStderr(() =>
    comIndice(fix.jsonPath, fix.binPath, () => buscarVetorial("q", { queryVector: vetorBase(), threshold: 0 })),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].stale, true);
  assert.ok(results[0].snippet.startsWith(STALE_PREFIX));
  assert.ok(stderr.includes("AVISO"));
});

test("arquivo deletado -> stale:true", async () => {
  const src = fs.mkdtempSync(path.join(TMP, "src2-"));
  const file = path.join(src, "b.ts");
  fs.writeFileSync(file, "export const b = 1;", "utf8");
  const hash = fileHash(file);
  fs.unlinkSync(file);
  const fix = gravarFixture({
    generatedAt: new Date().toISOString(),
    chunks: [{ path: relTmp(file), content: "conteudo b", fileHash: hash }],
  });
  const { ret: results } = await capturarStderr(() =>
    comIndice(fix.jsonPath, fix.binPath, () => buscarVetorial("q", { queryVector: vetorBase(), threshold: 0 })),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].stale, true);
  assert.ok(results[0].snippet.startsWith(STALE_PREFIX));
});

test("hash consistente -> stale:false (campo sempre presente)", async () => {
  const src = fs.mkdtempSync(path.join(TMP, "src3-"));
  const file = path.join(src, "c.ts");
  fs.writeFileSync(file, "export const c = 3;", "utf8");
  const fix = gravarFixture({
    generatedAt: new Date().toISOString(),
    chunks: [{ path: relTmp(file), content: "conteudo c", fileHash: fileHash(file) }],
  });
  const { ret: results } = await capturarStderr(() =>
    comIndice(fix.jsonPath, fix.binPath, () => buscarVetorial("q", { queryVector: vetorBase(), threshold: 0 })),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].stale, false);
  assert.ok(!results[0].snippet.startsWith(STALE_PREFIX));
});

test("sidecar sem generatedAt -> aviso degradado no stderr", async () => {
  const src = fs.mkdtempSync(path.join(TMP, "src4-"));
  const file = path.join(src, "d.ts");
  fs.writeFileSync(file, "export const d = 4;", "utf8");
  const fix = gravarFixture({
    generatedAt: undefined,
    chunks: [{ path: relTmp(file), content: "conteudo d", fileHash: fileHash(file) }],
  });
  const { ret: results, stderr } = await capturarStderr(() =>
    comIndice(fix.jsonPath, fix.binPath, () => buscarVetorial("q", { queryVector: vetorBase(), threshold: 0 })),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].stale, false);
  assert.ok(stderr.includes("sem timestamp de build"));
});

test("staleness nao reordena: ranking por score preservado", async () => {
  const src = fs.mkdtempSync(path.join(TMP, "src5-"));
  const f1 = path.join(src, "e1.ts");
  const f2 = path.join(src, "e2.ts");
  fs.writeFileSync(f1, "alto", "utf8");
  fs.writeFileSync(f2, "baixo", "utf8");
  const fix = gravarFixture({
    generatedAt: new Date().toISOString(),
    chunks: [
      { path: relTmp(f2), content: "stale score maior", fileHash: "0".repeat(64), vector: [1, 1, 1, 1, 0, 0, 0, 0] },
      { path: relTmp(f1), content: "fresco score menor", fileHash: fileHash(f1), vector: [1, 0, 0, 0, 0, 0, 0, 0] },
    ],
  });
  const { ret: results } = await capturarStderr(() =>
    comIndice(fix.jsonPath, fix.binPath, () => buscarVetorial("q", { queryVector: [1, 1, 1, 1, 0, 0, 0, 0], threshold: 0 })),
  );
  assert.equal(results.length, 2);
  assert.ok(results[0].score >= results[1].score);
  assert.equal(results[0].stale, true);
  assert.equal(results[1].stale, false);
});

