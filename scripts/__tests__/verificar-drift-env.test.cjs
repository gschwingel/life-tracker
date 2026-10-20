"use strict";
// scripts/__tests__/verificar-drift-env.test.cjs
// FR-HOMEOSTASE-N01: teste do verificador de drift de env (node:test).
// Fixtures temporarias (nao dependem do repo real — DRIFT_ENV_ROOT).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { analisar, chavesUsadas, chavesDocumentadas, chavesSchemaCentral } = require("../verificar-drift-env.cjs");

function fixture(raiz, arquivos) {
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const abs = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, conteudo);
  }
}

test("chavesUsadas: cobre process.env.dot, colchetes e import.meta.env", () => {
  const k = chavesUsadas("const a = process.env.FOO_BAR; const b = process.env['BAZ_QUX']; const c = import.meta.env.VITE_X;");
  assert.ok(k.has("FOO_BAR") && k.has("BAZ_QUX") && k.has("VITE_X"));
  assert.equal(k.size, 3);
});

test("chavesDocumentadas: comentário # KEY= conta (contrato novo, Igor 2026-10-01); linha sem = não conta", () => {
  const k = chavesDocumentadas("# comentario\nFOO=1\n\n#BAR=2\n# BAZ=3\nQUX=4\n");
  assert.ok(k.has("FOO") && k.has("BAR") && k.has("BAZ") && k.has("QUX"));
  assert.ok(!k.has("COMENTARIO"));
});

test("analisar: sem drift = listas vazias", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "drift-env-"));
  fixture(raiz, {
    "src/a.ts": "process.env.FOO_BAR;",
    ".env.example": "FOO_BAR=x\n",
  });
  const r = analisar(raiz);
  assert.equal(r.usadasNaoDocumentadas.length, 0);
  assert.equal(r.documentadasMortas.length, 0);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("analisar: usada-nao-documentada e documentada-morta classificadas", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "drift-env-"));
  fixture(raiz, {
    "src/a.ts": "process.env.FOO_BAR; process.env['SO_CODIGO'];",
    "backend/src/b.ts": "process.env.BACKEND_ONLY;",
    ".env.example": "FOO_BAR=x\nMORTA=y\n",
    "backend/.env.example": "BACKEND_ONLY=z\n",
  });
  const r = analisar(raiz);
  assert.deepEqual(r.usadasNaoDocumentadas.map((x) => x.chave), ["SO_CODIGO"]);
  assert.deepEqual(r.documentadasMortas.map((x) => x.chave), ["MORTA"]);
  assert.equal(r.usadasNaoDocumentadas[0].usadaEm, "src/a.ts");
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("chavesSchemaCentral: extrai chaves de envSchema zod", () => {
  const k = chavesSchemaCentral("const envSchema = z.object({\n  PORT: z.coerce.number().default(4000),\n  MAX_USERS: z.coerce.number().default(20),\n});");
  assert.deepEqual([...k].sort(), ["MAX_USERS", "PORT"]);
});

test("analisar: chave do schema central nao gera drift mesmo sem .env.example", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "drift-env-"));
  fixture(raiz, {
    "backend/src/config.ts": "const envSchema = z.object({\n  TTS_ENABLED: z.coerce.boolean().default(false),\n});",
    ".env.example": "",
  });
  const r = analisar(raiz);
  assert.equal(r.usadasNaoDocumentadas.length, 0);
  assert.equal(r.documentadasMortas.length, 0);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("analisar: isencoes de runtime/plataforma nao viram drift", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "drift-env-"));
  fixture(raiz, {
    "src/a.ts": "process.env.NODE_ENV; process.env.PORT; process.env.RAILWAY_STATIC_URL; process.env.SEM_DOC_MESMO_ASSIM;",
    ".env.example": "",
  });
  const r = analisar(raiz);
  assert.deepEqual(r.usadasNaoDocumentadas.map((x) => x.chave), ["SEM_DOC_MESMO_ASSIM"]);
  fs.rmSync(raiz, { recursive: true, force: true });
});
