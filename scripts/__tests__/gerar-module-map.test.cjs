#!/usr/bin/env node
// scripts/__tests__/gerar-module-map.test.cjs
// WO-2026-09-30-TOOLCONFUSION — ITEM B3: testes do gerador + gate de frescor do
// mapa de módulos. Runner canônico: node --test (P08 — scripts/ não vão ao vitest).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const gerador = require("../gerar-module-map.cjs");
const verificador = require("../verificar-frescor-module-map.cjs");

const { montarMapa, agrupar, hashArvore, renderArtefato, medirArvore, ALVO, CAP_LINHAS } = gerador;

/** Fixture: árvore pequena com registros de tools. */
const ARVORE = [
  { rel: "index.ts", tools: false },
  { rel: "config.ts", tools: false },
  { rel: "lib/module-map.generated.ts", tools: false },
  { rel: "lib/tool-capabilities.ts", tools: true },
  { rel: "services/memory-tools.ts", tools: true },
  { rel: "services/google.ts", tools: false },
  { rel: "routes/chat.ts", tools: false },
];

test("CAP_LINHAS declarado em 150 e dominio backend/src (sizing guard do WO)", () => {
  assert.equal(CAP_LINHAS, 150);
  assert.equal(ALVO, "backend/src");
});

test("agrupar: conta por diretorio e coleta os arquivos de registro de tools", () => {
  const g = agrupar(ARVORE);
  const porDir = new Map(g.map((x) => [x.dir, x]));
  assert.equal(porDir.get("")?.total, 2);
  assert.equal(porDir.get("lib")?.total, 2);
  assert.deepEqual(porDir.get("lib")?.tools, ["tool-capabilities.ts"]);
  assert.deepEqual(porDir.get("services")?.tools, ["memory-tools.ts"]);
  assert.deepEqual(g.map((x) => x.dir), ["", "lib", "routes", "services"]);
});

test("montarMapa: modo PER-PATH quando cabe no cap (marca [tools])", () => {
  const mapa = montarMapa(ARVORE, 150);
  assert.equal(mapa.modo, "per-path");
  assert.equal(mapa.truncado, false);
  assert.deepEqual(mapa.linhas, [
    "backend/src/",
    "  config.ts",
    "  index.ts",
    "backend/src/lib/",
    "  module-map.generated.ts",
    "  tool-capabilities.ts [tools]",
    "backend/src/routes/",
    "  chat.ts",
    "backend/src/services/",
    "  google.ts",
    "  memory-tools.ts [tools]",
  ]);
});

test("montarMapa: modo CONTAGEM com marcador TRUNCATED explicito quando estoura o cap", () => {
  const grande = Array.from({ length: 200 }, (_, i) => ({
    rel: `dir${String(i % 3)}/f${String(i)}.ts`,
    tools: i === 0,
  }));
  const mapa = montarMapa(grande, 150);
  assert.equal(mapa.modo, "contagem");
  assert.equal(mapa.truncado, true);
  assert.equal(mapa.totalPaths, 200);
  assert.equal(mapa.totalDirs, 3);
  assert.deepEqual(mapa.linhas.slice(0, 3), [
    "backend/src/dir0/ — 67 arquivos | tools: f0.ts",
    "backend/src/dir1/ — 67 arquivos",
    "backend/src/dir2/ — 66 arquivos",
  ]);
  assert.match(
    mapa.linhas[mapa.linhas.length - 1],
    /^TRUNCATED — 200 paths em 3 diretorios: nenhum path individual listado \(cap 150 linhas\)/,
  );
  assert.ok(mapa.linhas.length <= 150, "modo contagem precisa respeitar o cap");
});

test("montarMapa: abaixo do cap nao existe marcador (sem corte silencioso)", () => {
  const noLimite = Array.from({ length: 140 }, (_, i) => ({ rel: `d/f${String(i)}.ts`, tools: false }));
  const mapa = montarMapa(noLimite, 150);
  assert.equal(mapa.modo, "per-path");
  assert.equal(mapa.truncado, false);
  assert.ok(!mapa.linhas.some((l) => l.startsWith("TRUNCATED")));
});

test("hashArvore: determinístico, insensível à ordem de entrada e sensível à árvore", () => {
  const h1 = hashArvore(ARVORE);
  assert.equal(h1, hashArvore([...ARVORE].reverse()));
  assert.match(h1, /^[0-9a-f]{12}$/);
  assert.notEqual(h1, hashArvore([...ARVORE, { rel: "lib/novo.ts", tools: false }]));
  const comFlag = ARVORE.map((e) => (e.rel === "services/google.ts" ? { ...e, tools: true } : e));
  assert.notEqual(h1, hashArvore(comFlag));
});

test("renderArtefato: modulo TS gerado com aviso de nao-edicao e escape defensivo", () => {
  const texto = renderArtefato(montarMapa(ARVORE), hashArvore(ARVORE));
  assert.match(texto, /^\/\/ GERADO — NAO EDITAR A MAO\./);
  assert.match(texto, /export const MODULE_MAP_TEXT = `/);
  assert.ok(texto.trimEnd().endsWith("`;"));
  const comCrase = renderArtefato({ ...montarMapa(ARVORE), linhas: ["a`b ${c}"] }, "0".repeat(12));
  assert.ok(comCrase.includes("\\`"), "crase precisa ser escapada");
  assert.ok(comCrase.includes("\\${"), "interpolacao precisa ser escapada");
});

test("idempotencia: gerar duas vezes o mesmo texto (dry-run puro, sem escrita)", () => {
  assert.equal(gerador.gerar({ dryRun: true }), gerador.gerar({ dryRun: true }));
});

test("medirArvore: o proprio artefato NAO entra na contagem (sem auto-referencia)", () => {
  const entradas = medirArvore();
  assert.ok(entradas.length > 100, "arvore real muito pequena — medicao suspeita");
  assert.ok(!entradas.some((e) => e.rel === "lib/module-map.generated.ts"));
  assert.ok(entradas.every((e) => !e.rel.includes("\\")), "paths relativos com separador /");
});

test("medirArvore: marca os registros de tools derivados do CONTEUDO (13 arquivos hoje)", () => {
  const comFlag = medirArvore()
    .filter((e) => e.tools)
    .map((e) => e.rel);
  assert.deepEqual(comFlag, [
    "lib/tool-capabilities.ts",
    "services/artista-tools.ts",
    "services/attachment-tools.ts",
    // FRAME-BRACOS-ARM-MCP-20261014 (F4 — dispatch slim): host da ÚNICA tool do
    // braço (`braco_queue_prompt`) — entra na lista por derivar tools do conteúdo.
    "services/braco-tools.ts",
    "services/db-tools.ts",
    "services/github-tools.ts",
    "services/l1-tools.ts",
    "services/l4-tools.ts",
    "services/manifest-tools.ts",
    "services/memory-tools.ts",
    "services/poseidon-tools.ts",
    "services/ritual-tools.ts",
    "services/websearch-tools.ts",
  ]);
});

test("verificador: CRLF no checkout NAO e' drift (A7 — runner Windows/materializacao CRLF)", () => {
  // Causa raiz medida: o runner self-hosted materializa o .ts com CRLF; sem
  // normalizacao o gate dava STALE falso com conteudo identico (merge-gate #951).
  const lf = "a\nb\n";
  const crlf = "a\r\nb\r\n";
  assert.deepEqual(verificador.comparar(lf, crlf), { ok: true, achados: [] });
  assert.deepEqual(verificador.comparar(crlf, lf), { ok: true, achados: [] });
  // drift REAL continua reprovando mesmo com CRLF de um dos lados
  const drift = verificador.comparar(crlf, "a\r\nc\r\n");
  assert.equal(drift.ok, false);
  assert.ok(drift.achados.map((x) => x.tipo).includes("conteudo"));
});

test("verificador: igual = fresco; divergente = conteudo+omissao+ghost; ausente = ausente", () => {
  assert.deepEqual(verificador.comparar("a\nb\n", "a\nb\n"), { ok: true, achados: [] });

  const drift = verificador.comparar("a\nb\n", "a\nc\n");
  assert.equal(drift.ok, false);
  const tipos = drift.achados.map((x) => x.tipo);
  assert.ok(tipos.includes("conteudo"));
  assert.ok(tipos.includes("omissao"));
  assert.ok(tipos.includes("ghost"));

  const semArtefato = verificador.comparar("a\n", null);
  assert.equal(semArtefato.ok, false);
  assert.equal(semArtefato.achados[0].tipo, "ausente");
});

test("verificador: artefato comitado do repo esta fresco (gate verde no estado atual)", () => {
  assert.equal(verificador.executar({ json: true }), 0);
});

