// scripts/__tests__/verificar-frescor-manifest.test.cjs
// Testes do validador de frescor do manifesto v3.0 (nucleo puro de diff).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { buildSections, compara, normalizaVolatil } = require("../verificar-frescor-manifest.cjs");

function doc(extra) {
  return [
    "#0 RUNTIME CONTEXT",
    "",
    "  entry: A",
    "#4 MODULE MAP (SRC/LIB/)",
    "",
    "  alpha.ts | ref: A | purpose: x",
    "  beta.ts | purpose: y",
    "#8 TEST MAP",
    "",
    "  src/__tests__/lib/ | 3",
  ].join("\n") + (extra || "");
}

// insere `linha` logo antes do header `header` (dentro da secao anterior)
function insertBefore(texto, header, linha) {
  return texto.replace(header, linha + "\n" + header);
}

test("verde: documento identico nao gera achados", () => {
  const t = doc();
  assert.deepStrictEqual(compara(t, t), []);
});

test("ghost: arquivo so no commitado e apontado com caminho", () => {
  const a = insertBefore(doc(), "#8 TEST MAP", "  ghost.ts | ref: none | purpose: morto");
  const b = doc();
  const achados = compara(a, b);
  const g = achados.find((x) => x.tipo === "ghost");
  assert.ok(g, "deveria apontar ghost: " + JSON.stringify(achados));
  assert.strictEqual(g.secao, "4");
  assert.strictEqual(g.caminho, "ghost.ts");
});

test("omissao: arquivo novo na arvore (so no render) e apontado", () => {
  const a = doc();
  const b = insertBefore(doc(), "#8 TEST MAP", "  novo.ts | purpose: recem-nascido");
  const achados = compara(a, b);
  const o = achados.find((x) => x.tipo === "omissao");
  assert.ok(o, "deveria apontar omissao: " + JSON.stringify(achados));
  assert.strictEqual(o.secao, "4");
  assert.strictEqual(o.caminho, "novo.ts");
});

test("contagem: divergencia na secao 8 e classificada como contagem", () => {
  const a = doc();
  const b = doc().replace("src/__tests__/lib/ | 3", "src/__tests__/lib/ | 5");
  const achados = compara(a, b);
  const c = achados.find((x) => x.tipo === "contagem");
  assert.ok(c, "deveria apontar contagem na secao 8: " + JSON.stringify(achados));
  assert.strictEqual(c.secao, "8");
});

test("conteudo: alteracao de anotacao em linha existente e conteudo", () => {
  const a = doc();
  const b = doc().replace("purpose: x", "purpose: x alterado");
  const achados = compara(a, b);
  const c = achados.find((x) => x.tipo === "conteudo");
  assert.ok(c, "deveria apontar conteudo divergente: " + JSON.stringify(achados));
  assert.strictEqual(c.caminho, "alpha.ts");
});

test("buildSections: quebra por headers e acumula linhas", () => {
  const s = buildSections(doc());
  assert.strictEqual(s.length, 3);
  assert.strictEqual(s[0].numero, "0");
  assert.ok(s[1].linhas.has("  alpha.ts | ref: A | purpose: x"));
});

// ── Timestamp volátil do rodapé (emenda A1 — determinismo de timestamp) ───────
// O `gerado:` passou a derivar do último commit: muda ao commitar e NÃO é conteúdo.
// O gate normaliza só esse valor; o resto da linha segue conteúdo comparável.
const RODAPE = (ts, hash) =>
  "\n<!-- gerado: " + ts + " | arvore_hash: " + hash + " | arquivos: 777 | fonte: docs/manifest-fonte.yaml -->\n";

test("volatil: diferenca APENAS no timestamp do rodape nao gera achados", () => {
  const a = doc() + RODAPE("2026-09-13T22:26:57-03:00", "861df02e433845e7");
  const b = doc() + RODAPE("2026-09-13T22:48:29-03:00", "861df02e433845e7");
  assert.deepStrictEqual(compara(a, b), []);
});

test("volatil: arvore_hash/arquivos do rodape SEGUEM comparados", () => {
  const a = doc() + RODAPE("2026-09-13T22:26:57-03:00", "861df02e433845e7");
  const b = doc() + RODAPE("2026-09-13T22:26:57-03:00", "zzz9999999999999");
  const achados = compara(a, b);
  assert.ok(achados.length > 0, "arvore_hash divergente deve gerar achado: " + JSON.stringify(achados));
});

test("normalizaVolatil: troca so o valor do timestamp e preserva o resto", () => {
  const linha = "<!-- gerado: 2026-09-13T22:26:57-03:00 | arvore_hash: abc | arquivos: 777 | fonte: x.yaml -->";
  const out = normalizaVolatil(linha);
  assert.match(out, /<!-- gerado: <volatil> \| arvore_hash: abc \| arquivos: 777 \| fonte: x\.yaml -->/);
  assert.doesNotMatch(out, /2026-09-13T22:26:57-03:00/);
});

