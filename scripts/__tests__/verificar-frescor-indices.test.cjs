"use strict";
// Suite: verificar-frescor-indices v2 — comparação por CONTEÚDO (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905).
// v1 testava timestamps em repo sintético; v2 regenera em tmp e compara conteúdo, então
// os testes cobrem as helpers puras + a TAXONOMIA do verificador num repo SINTÉTICO.
//
// FRONTEIRA (FRAME-GATES-ROTINAS-DIARIAS-20261015 D1/D2 + PATCH-FRESCOR-SUITE-FIXTURE-20261016):
// o frescor dos derivados no REPO REAL é dos watchdogs DIÁRIOS (indices-textual-watchdog
// 05:20 UTC entrega por PR; vetorial 04:30). `npm run test:scripts` NÃO afirma mais que o
// repo está fresco — a suíte não paga regen nem reprova PR por staleness (era o custo que o
// frame matou). O verificador segue vivo como COMANDO on-demand (`npm run indices:check`) e
// como DETECÇÃO do watchdog; o que se testa aqui é o seu comportamento, não o estado do repo.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { conteudosIguais, stripVolatile, listarRel } = require("../verificar-frescor-indices.cjs");

const SCRIPT = path.join(__dirname, "..", "verificar-frescor-indices.cjs");

function tmpArquivo(nome, conteudo) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "frescor-t-"));
  const f = path.join(d, nome);
  fs.writeFileSync(f, conteudo);
  return f;
}

test("stripVolatile remove geradoEm/generatedAt/data_geracao em qualquer nível", () => {
  const obj = { a: 1, geradoEm: "x", generatedAt: "y", data_geracao: "z", nos: { b: 2, geradoEm: "w" } };
  const out = stripVolatile(obj);
  assert.equal(out.geradoEm, undefined);
  assert.equal(out.generatedAt, undefined);
  assert.equal(out.data_geracao, undefined);
  assert.equal(out.a, 1);
  assert.equal(out.nos.b, 2);
  assert.equal(out.nos.geradoEm, undefined);
});

test("conteudosIguais: JSON ignora só metadados voláteis; diferença real → false", () => {
  const base = JSON.stringify({ geradoEm: "2026-09-05T00:00:00Z", total: 3, nos: { a: { x: 1 } } });
  const igual = JSON.stringify({ geradoEm: "2026-09-05T01:00:00Z", total: 3, nos: { a: { x: 1 } } });
  const diferente = JSON.stringify({ geradoEm: "2026-09-05T00:00:00Z", total: 4, nos: { a: { x: 1 } } });
  assert.equal(conteudosIguais(tmpArquivo("a.json", base), tmpArquivo("b.json", igual)), true);
  assert.equal(conteudosIguais(tmpArquivo("a.json", base), tmpArquivo("b.json", diferente)), false);
});

test("conteudosIguais: markdown compara texto com CRLF/EOF normalizados", () => {
  assert.equal(
    conteudosIguais(tmpArquivo("a.md", "linha 1\r\nlinha 2\r\n"), tmpArquivo("b.md", "linha 1\nlinha 2")),
    true
  );
  assert.equal(conteudosIguais(tmpArquivo("a.md", "A"), tmpArquivo("b.md", "B")), false);
});

test("listarRel lista arquivos recursivamente em rel path", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "frescor-rel-"));
  fs.mkdirSync(path.join(d, "sub"), { recursive: true });
  fs.writeFileSync(path.join(d, "a.json"), "{}");
  fs.writeFileSync(path.join(d, "sub", "b.json"), "{}");
  assert.deepEqual(listarRel(d, d).sort(), ["a.json", "sub/b.json"]);
});

// ── integração em SANDBOX: o verificador roda num repo SINTÉTICO (nunca no real) ──
// Monta <tmp>/scripts/{verificar-frescor-indices.cjs + stubs dos 2 geradores vivos} e
// semeia os artefatos "commitados". Cobre a taxonomia inteira do verificador
// (fresco/stale/ausente/erro) sem tocar no repo e sem assumir repo regenerado.
const STUB_RASTREABILIDADE = [
  '"use strict";',
  'const fs = require("node:fs"), path = require("node:path");',
  'if (Number(process.env.STUB_EXIT || 0) !== 0) { process.stderr.write("stub falhou\\n"); process.exit(Number(process.env.STUB_EXIT)); }',
  'const alvo = path.join(process.env.INDICES_OUT_DIR, "LILA-DEV", "indice-rastreabilidade.json");',
  "fs.mkdirSync(path.dirname(alvo), { recursive: true });",
  'fs.writeFileSync(alvo, \'{\\n  "geradoEm": "STUB",\\n  "totalNos": 1\\n}\\n\');',
  "",
].join("\n");
const STUB_MANIFEST_INDEX = [
  '"use strict";',
  'const fs = require("node:fs"), path = require("node:path");',
  'if (Number(process.env.STUB_EXIT || 0) !== 0) { process.stderr.write("stub falhou\\n"); process.exit(Number(process.env.STUB_EXIT)); }',
  'const alvo = process.env.MANIFEST_INDEX_PATH || path.join(process.env.INDICES_OUT_DIR, "docs", "AI-PROJECT-MANIFEST-INDEX.md");',
  "fs.mkdirSync(path.dirname(alvo), { recursive: true });",
  'fs.writeFileSync(alvo, "# STUB INDEX\\n");',
  "",
].join("\n");

function sandbox({ commitadoRastreabilidade = '{\n  "geradoEm": "OUTRO",\n  "totalNos": 1\n}\n', comManifestIndex = true, stubExit = 0 } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "frescor-sandbox-"));
  fs.mkdirSync(path.join(raiz, "scripts"), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(raiz, "scripts", "verificar-frescor-indices.cjs"));
  fs.writeFileSync(path.join(raiz, "scripts", "gerar-indice-rastreabilidade.cjs"), STUB_RASTREABILIDADE);
  fs.writeFileSync(path.join(raiz, "scripts", "gerar-indice-manifest.cjs"), STUB_MANIFEST_INDEX);
  fs.mkdirSync(path.join(raiz, "LILA-DEV"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "LILA-DEV", "indice-rastreabilidade.json"), commitadoRastreabilidade);
  if (comManifestIndex) {
    fs.mkdirSync(path.join(raiz, "docs"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "docs", "AI-PROJECT-MANIFEST-INDEX.md"), "# STUB INDEX\n");
  }
  const r = spawnSync(process.execPath, [path.join(raiz, "scripts", "verificar-frescor-indices.cjs")], {
    cwd: raiz,
    encoding: "utf8",
    env: { ...process.env, STUB_EXIT: String(stubExit) },
  });
  fs.rmSync(raiz, { recursive: true, force: true });
  return r;
}

test("sandbox: conteúdo igual (só o volátil difere) → exit 0 e os 2 índices frescos", () => {
  const r = sandbox();
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /✅ Todos os índices estão frescos/);
  assert.equal((r.stdout.match(/— fresco/g) || []).length, 2, r.stdout);
});

test("sandbox: conteúdo real difere do regen → exit 1 com DESATUALIZADO e o comando de cura", () => {
  const r = sandbox({ commitadoRastreabilidade: '{\n  "geradoEm": "STUB",\n  "totalNos": 2\n}\n' });
  assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /DESATUALIZADO/);
  assert.match(r.stdout, /npm run indices/);
});

test("sandbox: índice commitado ausente → exit 1 com ÍNDICE AUSENTE", () => {
  const r = sandbox({ comManifestIndex: false });
  assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /ÍNDICE AUSENTE/);
});

test("sandbox: gerador com exit != 0 → exit 1 com erro de verificação (nunca verde)", () => {
  const r = sandbox({ stubExit: 3 });
  assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /erro ao verificar/);
  assert.doesNotMatch(r.stdout, /Todos os índices estão frescos/);
});

