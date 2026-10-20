"use strict";
// scripts/__tests__/verificar-alinhamento-vetorial.test.cjs
// PATCH-ANTI-CORRUPCAO-INDICE-20260923 — testes do verificador de alinhamento
// vetor↔chunk (as funções puras; a camada semântica é exercitada com embedFn injetada,
// sem rede e sem chave).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  cosine,
  selecionarAmostras,
  lerVetor,
  verificarEstrutural,
  verificarAlinhamento,
} = require("../verificar-alinhamento-vetorial.cjs");

function binDe(vetores, dim) {
  const buf = Buffer.alloc(vetores.length * dim * 4);
  vetores.forEach((v, i) => v.forEach((x, k) => buf.writeFloatLE(x, i * dim * 4 + k * 4)));
  return buf;
}

test("cosine: identicos=1, ortogonais=0, zero-magnitude=0, menor comprimento", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [0, 0]), 0);
  assert.ok(Math.abs(cosine([1, 0, 0], [1, 0]) - 1) < 1e-12);
});

test("selecionarAmostras: uniforme, cobre o intervalo, n>total usa todos", () => {
  assert.deepEqual(selecionarAmostras(0, 5), []);
  assert.deepEqual(selecionarAmostras(4, 4), [0, 1, 2, 3]);
  const s = selecionarAmostras(100, 5);
  assert.equal(s.length, 5);
  assert.equal(s[0], 0);
  assert.ok(s[4] >= 75);
  assert.deepEqual(selecionarAmostras(3, 10), [0, 1, 2]);
});

test("lerVetor: offset em FLOATS (convencao medida do sidecar) le o Float32 certo", () => {
  const buf = binDe([[1, 2], [3, 4]], 2);
  assert.deepEqual(lerVetor(buf, 0, 2), [1, 2]);
  assert.deepEqual(lerVetor(buf, 2, 2), [3, 4]);
});

test("verificarEstrutural: par integro (offsets canonicos + tamanho) -> ok", () => {
  const chunks = [
    { path: "a.ts", offset: 0, length: 2, content: "x" },
    { path: "b.ts", offset: 2, length: 2, content: "y" },
  ];
  const res = verificarEstrutural({ chunks, dimensions: 2, binBuf: binDe([[1, 0], [0, 1]], 2) });
  assert.equal(res.ok, true);
});

test("verificarEstrutural: tamanho do bin errado -> falha", () => {
  const chunks = [{ path: "a.ts", offset: 0, length: 2, content: "x" }];
  const res = verificarEstrutural({ chunks, dimensions: 2, binBuf: Buffer.alloc(4) });
  assert.equal(res.ok, false);
  assert.match(res.problemas[0], /bin com 4 bytes/);
});

test("verificarEstrutural: offset fora do canonico -> falha e aponta o chunk", () => {
  const chunks = [
    { path: "a.ts", offset: 0, length: 2, content: "x" },
    { path: "b.ts", offset: 99, length: 2, content: "y" },
  ];
  const res = verificarEstrutural({ chunks, dimensions: 2, binBuf: binDe([[1, 0], [0, 1]], 2) });
  assert.equal(res.ok, false);
  assert.ok(res.problemas.some((p) => p.includes("b.ts")));
});

test("verificarAlinhamento: embedFn fiel aos vetores armazenados -> ALINHADO", async () => {
  const dim = 2;
  const vetores = [
    [1, 0],
    [0, 1],
  ];
  const chunks = [
    { path: "a.ts", offset: 0, length: 2, content: "texto de a" },
    { path: "b.ts", offset: 2, length: 2, content: "texto de b" },
  ];
  const res = await verificarAlinhamento({
    chunks,
    dimensions: dim,
    binBuf: binDe(vetores, dim),
    embedFn: async (textos) => textos.map((_t, i) => vetores[i]),
    n: 2,
    limiar: 0.9,
  });
  assert.equal(res.ok, true);
  assert.equal(res.ruins.length, 0);
});

test("verificarAlinhamento: vetores TROCADOS entre chunks (line-merge) -> DESALINHADO e aponta", async () => {
  const dim = 2;
  const vetores = [
    [1, 0],
    [0, 1],
  ];
  const chunks = [
    { path: "a.ts", offset: 0, length: 2, content: "texto de a" },
    { path: "b.ts", offset: 2, length: 2, content: "texto de b" },
  ];
  // embedFn devolve os vetores na ordem INVERSA — simula o par corrompido do
  // incidente 2026-09-23 (sidecar line-merged + bin de um lado só).
  const res = await verificarAlinhamento({
    chunks,
    dimensions: dim,
    binBuf: binDe(vetores, dim),
    embedFn: async (textos) => textos.map((_t, i) => vetores[1 - i]),
    n: 2,
    limiar: 0.9,
  });
  assert.equal(res.ok, false);
  assert.equal(res.ruins.length, 2);
  assert.ok(res.ruins.some((r) => r.path === "a.ts"));
});