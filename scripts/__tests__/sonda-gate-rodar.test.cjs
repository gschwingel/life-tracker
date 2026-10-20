// scripts/__tests__/sonda-gate-rodar.test.cjs
// Gate assíncrono da sonda de docs (gatilho do fold) — testes OFFLINE do núcleo
// puro + caminho CLI sem LLM (--skip-probe e no-op).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  escopoGramatica,
  docsAlcancados,
  detectarFold,
  parseSaidaSonda,
  linhaSummary,
} = require("../sonda-gate-rodar.cjs");

const REPO = path.resolve(__dirname, "..", "..");

test("docsAlcancados — interseção com o escopo; fora do escopo não vira alvo", () => {
  const alterados = [
    "docs/ANTI-STALL.md",
    "docs/sub/ANINHADO.md",                 // listarEscopo não é recursivo
    "LILA-DEV/planejamento/prompts/X.md",   // subdiretório de LILA-DEV, fora do §7
    "docs/MCP-GRAFO.md",
    "src/lib/qualquer.ts",
  ];
  assert.deepStrictEqual(docsAlcancados(alterados), ["docs/ANTI-STALL.md", "docs/MCP-GRAFO.md"]);
});

// PATCH-SONDA-GRAMMAR-SCOPE-20261004 (dívida PATCH-20261004-001): a lista WET de
// 9 docs deixava docs novos fora do gatilho — FLUXO-LANES.md nasceu (#1066) sem
// a chave human_readable e nenhum gate de PR viu. Fonte ÚNICA do escopo agora é
// a sentinela (§7 − isenções); o teste fixa a PARIDADE, não uma contagem.
test("escopoGramatica — derivado do mecanismo da sentinela, nunca cópia WET", () => {
  const sentinela = require("../verificar-pontos-cegos.cjs");
  assert.deepStrictEqual([...escopoGramatica()].sort(), [...sentinela.arquivosGovernados()].sort());
  // continuidade B-3: os 9 docs do antigo GRAMMAR_SCOPE WET permanecem no gatilho
  const antigos = [
    "docs/AI-IAIA-GRAMMAR.md",
    "docs/AI-PROJECT-MANIFEST.md",
    "docs/TOOLUSE-PHASING.md",
    "docs/MCP-GRAFO.md",
    "docs/MCP-AUDITORIA.md",
    "docs/FLUXO-SESSAO-ISOLADA.md",
    "docs/ANTI-STALL.md",
    "docs/AI-ENV-PREREQUISITES.md",
    "docs/MSG-FORMAT-BLOCKS.md",
  ];
  for (const d of antigos) {
    assert.ok(escopoGramatica().includes(d), "doc do escopo histórico saiu do gatilho: " + d);
  }
  // regressão que motivou o patch: docs novos do escopo governado nascem cobertos
  assert.ok(escopoGramatica().includes("docs/FLUXO-LANES.md"));
});

test("detectarFold — conta linhas de prosa removidas; bullets/tabelas/heading não contam", () => {
  const diff = [
    "diff --git a/docs/X.md b/docs/X.md",
    "--- a/docs/X.md",
    "+++ b/docs/X.md",
    "@@ -1,6 +1,3 @@",
    "-Parágrafo de prosa longo o suficiente para ser considerado prosa real do documento e ter mais de sessenta caracteres.",
    "-- bullet removido que também é longo mas é um bullet de lista e não prosa de parágrafo corrido.",
    "+- bullet novo adicionado no lugar, também longo o suficiente para passar do limite de sessenta caracteres.",
    "-| tabela | removida | com colunas | suficientes |",
    "-# Heading removido",
    "+Parágrafo novo.",
  ].join("\n");
  // 1 prosa removida (a 1ª); o "bullet removido" começa com "-" após o marker de diff → corpo vira "-bullet…" → estrutural.
  assert.strictEqual(detectarFold(diff), 1);
});

test("detectarFold — fence fechado não vira prosa", () => {
  const diff = [
    "-```",
    "-linha dentro de fence removida, longa o suficiente para ultrapassar o limite de sessenta caracteres facilmente.",
    "-```",
  ].join("\n");
  assert.strictEqual(detectarFold(diff), 0);
});

test("parseSaidaSonda — extrai o JSON do stdout da sonda (JSON + linha-resumo)", () => {
  const stdout = [
    "{",
    '  "score": 100,',
    '  "pass": true,',
    '  "checks": {"summarization": {"pass": true}}',
    "}",
    "",
    "AI-Readability-Docs nota 100/100 — PASS ✅ | modo llm",
  ].join("\n");
  const rel = parseSaidaSonda(stdout);
  assert.strictEqual(rel.score, 100);
  assert.strictEqual(rel.pass, true);
});

test("linhaSummary — linha de tabela markdown com veredito estrito e provas formatadas", () => {
  const linha = linhaSummary({
    doc: "docs/X.md",
    score: 60,
    pass: false,
    veredito: "REPROVA",
    checks: { summarization: { retencao: 0.69 }, qaProbe: { retencao: 0.4 }, syntheticEdits: { accuracy: 1 } },
  });
  assert.ok(linha.startsWith("| docs/X.md | 60/100 | ❌ REPROVA"));
  assert.ok(linha.includes("0.69"));
  assert.ok(linha.includes("1.00"));
  const aviso = linhaSummary({
    doc: "docs/Y.md",
    score: 100,
    pass: true,
    veredito: "AVISO",
    checks: { summarization: { retencao: 0.4 }, qaProbe: { retencao: 0.9 }, syntheticEdits: { accuracy: 1 } },
  });
  assert.ok(aviso.includes("⚠️ AVISO"));
});

test("CLI --skip-probe com --doc: 1 doc alcançado sem LLM, exit 0 (CI seco)", () => {
  const out = execFileSync("node", [path.join(REPO, "scripts", "sonda-gate-rodar.cjs"), "--doc", "docs/ANTI-STALL.md", "--skip-probe"], {
    encoding: "utf8", cwd: REPO,
  });
  const json = JSON.parse(out.slice(0, out.lastIndexOf("}") + 1));
  assert.strictEqual(json.skipProbe, true);
  assert.strictEqual(json.docs.length, 1);
  assert.strictEqual(json.docs[0].doc, "docs/ANTI-STALL.md");
});

test("CLI --base-sha HEAD: diff vazio → no-op declarado, exit 0", () => {
  const out = execFileSync("node", [path.join(REPO, "scripts", "sonda-gate-rodar.cjs"), "--base-sha", "HEAD", "--skip-probe"], {
    encoding: "utf8", cwd: REPO,
  });
  const json = JSON.parse(out.slice(0, out.lastIndexOf("}") + 1));
  assert.strictEqual(json.noOp, true);
});

test("CLI sem --base-sha e sem --doc: exit 2 com usage (validação loud)", () => {
  assert.throws(
    () => execFileSync("node", [path.join(REPO, "scripts", "sonda-gate-rodar.cjs")], { encoding: "utf8", cwd: REPO }),
    (err) => err.status === 2
  );
});
