"use strict";
// scripts/__tests__/gerar-docs-derivados.test.cjs
// REPARO ETAPA 5b (FRAME-DOCS-MECANIZACAO-P1a-20261002): a medicao do gerador de docs
// derivados e funcao do ESTADO DO REPO, nunca do estado de smudge do LFS. O defeito
// original (PR #1031) media o tamanho on-disk de `indice-vetorial.bin`: ~39 MB numa
// maquina smudged e ~134 B num runner sem smudge -> o gate quebrava por construcao.
// REPARO 5c (mesma doutrina, defeito irmao): a contagem de BYTES tambem e funcao do
// ambiente quando medida on-disk — checkout CRLF infla 1 byte por linha, entao a maquina
// (CRLF) e o runner (LF) mediam diferente e o gate acusava falso-stale. Agora a medicao
// usa o conteudo NORMALIZADO (LF): CRLF == LF por construcao.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { medir, ROOT, renderTestsPathGate, RULE3_FONTES } = require("../gerar-docs-derivados.cjs");

const PONTEIRO =
  "version https://git-lfs.github.com/spec/v1\n" +
  "oid sha256:552f5131d1a14b3357f5b54971e9edd2fceea2d3850376070bb26bf41219726e\n" +
  "size 41140224\n";

/** Cria um diretorio temporario FORA do repo com as fixtures dadas. */
function tmpdir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1a-medir-"));
  for (const [nome, conteudo] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, nome), conteudo);
  }
  return dir;
}

test("medir: PONTEIRO LFS usa o tamanho do campo `size` (estado do repo, nao do smudge)", () => {
  const dir = tmpdir({ "bin.pointer": PONTEIRO });
  const m = medir("bin.pointer", dir);
  assert.equal(m.bytes, 41140224);
  assert.equal(m.lfs, true);
  assert.equal(m.lines, 0);
  // prova de que NAO e o tamanho on-disk do arquivo fixture (~134 B)
  assert.notEqual(m.bytes, fs.statSync(path.join(dir, "bin.pointer")).size);
});

test("medir: arquivo comum usa bytes do conteudo NORMALIZADO + contagem de newlines", () => {
  const dir = tmpdir({ "texto.txt": "a\nb\nc\n" });
  const m = medir("texto.txt", dir);
  assert.equal(m.bytes, 6);
  assert.equal(m.lines, 3);
  assert.equal(m.lfs, false);
});

test("medir: bytes/linhas NAO dependem do EOL do checkout (CRLF == LF)", () => {
  const lf = tmpdir({ "a.txt": "a\nb\nc\n" });
  const crlf = tmpdir({ "b.txt": "a\r\nb\r\nc\r\n" });
  const m1 = medir("a.txt", lf);
  const m2 = medir("b.txt", crlf);
  assert.equal(m1.bytes, 6);
  assert.equal(m1.lines, 3);
  // REPARO 5c: a medicao do checkout CRLF (disco maior) tem de igualar a do LF
  assert.equal(m2.bytes, m1.bytes);
  assert.equal(m2.lines, m1.lines);
  assert.notEqual(fs.statSync(path.join(crlf, "b.txt")).size, m2.bytes);
});

test("medir: ponteiro LFS malformado (sem `size`) falha alto, sem fallback", () => {
  const dir = tmpdir({ "ruim.pointer": "version https://git-lfs.github.com/spec/v1\noid sha256:abc\n" });
  assert.throws(() => medir("ruim.pointer", dir), /ponteiro LFS sem campo 'size'/);
});

test("medir: arquivo do repo mede o BLOB DO COMMIT (CRLF ou drift do disco nao afeta)", () => {
  const rel = "LILA-DEV/indice-rastreabilidade.json";
  const blobBytes = Number(
    execFileSync("git", ["--no-pager", "cat-file", "-s", "HEAD:" + rel], { cwd: ROOT, encoding: "utf8" }).trim()
  );
  const m = medir(rel);
  assert.equal(m.lfs, false);
  assert.equal(m.bytes, blobBytes);
  const disco = fs.statSync(path.join(ROOT, rel)).size;
  assert.ok(disco >= m.bytes, "disco (CRLF) nunca menor que o blob");
  if (disco !== m.bytes) assert.notEqual(m.bytes, disco);
});

test("medir: o ponteiro do PROPRIO repo reproduz o tamanho do binario smudged (sem-smudge == smudged)", () => {
  const ponteiro = execFileSync("git", ["--no-pager", "show", "HEAD:indice-vetorial.bin"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.ok(ponteiro.startsWith("version https://git-lfs.github.com/spec/v1"), "blob do .bin deve ser ponteiro LFS");
  const dir = tmpdir({ "indice-vetorial.bin": ponteiro });
  const semSmudge = medir("indice-vetorial.bin", dir);
  assert.equal(semSmudge.lfs, true);
  assert.equal(semSmudge.lines, 0);
  const comSmudge = medir("indice-vetorial.bin");
  if (!comSmudge.lfs) {
    // maquina smudged: o numero derivado do ponteiro deve ser IDENTICO ao do binario real
    assert.equal(semSmudge.bytes, comSmudge.bytes);
    assert.ok(comSmudge.bytes > 1000000, "binario real deve ter MBs");
  }
});

// PATCH-HOMEOSTASE-DOCS-20261004: a tabela PATH-GATE era gerada com as chaves do
// thresholds VERBATIM — para backend, relativas a backend/, e a régua C de pontos
// cegos (que resolve refs de docs da raiz) as derrubava como ref morta. Invariante:
// todo path renderizado pela tabela resolve da raiz do repo.
test("renderTestsPathGate: todo path crítico da tabela resolve da raiz do repo", () => {
  const tabela = renderTestsPathGate();

test("REGRESSAO 2026-10-11: grafo.json FORA das fontes medidas do RULE 3 (arquivo quente)", () => {
  // Medir o grafo tornava o par instavel entre o branch e o merge-ref do CI: toda
  // PR mergeada reescreve `LILA-DEV/planejamento/grafo.json`, entao qualquer PR em
  // voo media um grafo diferente do que o CI resolve e o par virava `stale` sem
  // fonte autoral alterada — a corrida reprovou docs-einv-frescor + pr-gate +
  // gates-grafo em serie (PR #1307). O grafo segue FONTE DE CONSUMO (a nota do
  // bloco publica a regra de paginacao/script), nunca fonte de medicao.
  assert.ok(!("grafo" in RULE3_FONTES), "grafo.json nao pode voltar as fontes medidas");
  const caminhos = Object.values(RULE3_FONTES);
  assert.ok(
    !caminhos.some((p) => p.includes("grafo.json")),
    "nenhum path de grafo pode ser medido pelo RULE 3",
  );
  assert.deepEqual(caminhos, [
    "LILA-DEV/indice-rastreabilidade.json",
    "indice-vetorial.json",
    "indice-vetorial.bin",
  ]);
});

  const linhas = tabela.split("\n").filter((l) => /^\| (frontend|backend) /.test(l));
  assert.ok(linhas.length >= 5, "tabela PATH-GATE menor que o esperado: " + linhas.length);
  for (const linha of linhas) {
    const m = /`([A-Za-z0-9._/-]+)`/.exec(linha);
    assert.ok(m, "linha da tabela sem path backtickado: " + linha);
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), "path morto na tabela gerada: " + m[1]);
    if (linha.startsWith("| backend")) {
      assert.ok(m[1].startsWith("backend/"), "path de backend sem prefixo de raiz: " + m[1]);
    }
  }
});
