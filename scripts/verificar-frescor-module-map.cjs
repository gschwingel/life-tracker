#!/usr/bin/env node
// scripts/verificar-frescor-module-map.cjs
// WO-2026-09-30-TOOLCONFUSION — ITEM B3: gate de frescor do mapa de módulos.
//
// Re-gera o mapa a partir da árvore real (memória, `--dry-run` do gerador) e
// compara com o artefato COMITADO em backend/src/lib/module-map.generated.ts.
// Divergência = exit 1 + relatório JSON (drift de árvore, edição manual do
// artefato gerado, ou gerador alterado sem regeneração).
//
// Sem timestamp no artefato ⇒ comparação byte a byte (determinística, idempotente):
// a mesma árvore produz o mesmo texto, então a única causa de falha é drift real.
//
// Uso: node scripts/verificar-frescor-module-map.cjs [--json]
// Saída: relatório legível (default) ou JSON (--json) | exit 0 = fresco | exit 1 = drift | exit 2 = erro de execução
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const gerador = require("./gerar-module-map.cjs");

const ROOT = path.resolve(__dirname, "..");
const ARTEFATO = gerador.OUT_DEFAULT;

/** Núcleo puro: compara o esperado (recém-gerado) com o comitado.
 *
 * NORMALIZAÇÃO DE FIM DE LINHA (aprendida na prática — ver o log E3 §11 A7): o
 * checkout pode materializar o arquivo com CRLF (git `core.autocrlf=true` no
 * runner Windows do self-hosted), enquanto o gerador escreve sempre LF. Comparar
 * byte a byte sem normalizar dava "STALE" falso no CI com o conteúdo idêntico.
 * Precedente da casa: `verificar-frescor-manifest.cjs` faz `replace(/\r\n/g,"\n")`
 * antes de comparar. CRLF aqui é artefato de CHECKOUT, não conteúdo do mapa.
 */
function normalizar(texto) {
  return texto.replace(/\r\n/g, "\n");
}

function comparar(esperado, comitado) {
  if (comitado === null) {
    return { ok: false, achados: [{ tipo: "ausente", detalhe: `artefato nao encontrado em ${path.relative(ROOT, ARTEFATO)}` }] };
  }
  const a = normalizar(esperado);
  const b = normalizar(comitado);
  if (a === b) {
    return { ok: true, achados: [] };
  }
  const achados = [];
  const esperadoLinhas = a.split("\n");
  const comitadoLinhas = b.split("\n");
  achados.push({
    tipo: "conteudo",
    detalhe: `artefato stale: ${String(comitadoLinhas.length)} linhas comitadas vs ${String(esperadoLinhas.length)} esperadas (arvore mudou OU o artefato foi editado a mao)`,
  });
  const setComitado = new Set(comitadoLinhas);
  const setEsperado = new Set(esperadoLinhas);
  for (const l of esperadoLinhas) {
    if (!setComitado.has(l)) achados.push({ tipo: "omissao", caminho: l });
  }
  for (const l of comitadoLinhas) {
    if (!setEsperado.has(l)) achados.push({ tipo: "ghost", caminho: l });
  }
  return { ok: false, achados: achados.slice(0, 20) };
}

function executar({ json = false } = {}) {
  let esperado;
  try {
    esperado = gerador.gerar({ dryRun: true });
  } catch (err) {
    const erro = { ok: false, exitCode: 2, erro: err instanceof Error ? err.message : String(err) };
    console.log(json ? JSON.stringify(erro, null, 2) : `erro ao gerar o mapa: ${erro.erro}`);
    return 2;
  }

  let comitado;
  try {
    comitado = fs.readFileSync(ARTEFATO, "utf8");
  } catch {
    comitado = null;
  }

  const resultado = comparar(esperado, comitado);
  const relatorio = {
    ok: resultado.ok,
    comando: "node scripts/verificar-frescor-module-map.cjs",
    artefato: path.relative(ROOT, ARTEFATO).split(path.sep).join("/"),
    cobertura: `${gerador.ALVO}/**`,
    capLinhas: gerador.CAP_LINHAS,
    exitCode: resultado.ok ? 0 : 1,
    achados: resultado.achados,
  };
  if (json) {
    console.log(JSON.stringify(relatorio, null, 2));
  } else if (resultado.ok) {
    console.log("✅ module-map:check — mapa de modulos fresco (arvore == artefato comitado).");
  } else {
    console.log("❌ module-map:check — mapa de modulos STALE:");
    for (const a of resultado.achados) console.log(`  [${a.tipo}] ${a.caminho ?? a.detalhe}`);
    console.log("  correcao: node scripts/gerar-module-map.cjs");
  }
  return relatorio.exitCode;
}

module.exports = { comparar, executar, ARTEFATO };

if (require.main === module) {
  process.exit(executar({ json: process.argv.includes("--json") }));
}
