// scripts/__tests__/verificar-flips-pendentes.test.cjs
// Self-test da guarda flips-pendentes (scripts/verificar-flips-pendentes.cjs).
// FR-GUARDA-FLIPS-PENDENTES-20260920 — decisão Igor 2026-09-20.
//
// Cobre os 4 casos exigidos pelo prompt-fonte (tarefa 4.5), sobre fixture
// TEMPORÁRIA de grafo+log (mesmo padrão da suíte do lila-grafo-mcp):
//   1. achado detectado           (log executado + nó 🟡 sem justificativa)
//   2. nó 🟢 não-achado           (flip feito — regra não dispara)
//   3. exceção estruturada         (campo deprecated / "⚫" / "aguardando veredito")
//   4. exit 0 com achados         (guarda NÃO-bloqueante por design)
// Casos complementares: id sem traço de execução não vira achado; id sem nó no
// grafo ativo vira achado com estado "(sem nó no grafo ativo)"; heurística de
// entrada por cabeçalho markdown; relatório nunca silencioso; REGRESSÃO do
// falso positivo de 2026-10-06: nota com "deprecated" em CONTEXTO DE FEATURE
// (caso real SP/FRAME-LACO-ESTADO-20261002, #1017/#1022) NÃO isenta.
// Roda em CI como parte de `npm run test:scripts` (run-test-scripts.cjs).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "verificar-flips-pendentes.cjs"));
const {
  extrairEntradas,
  limparRuidoFormato,
  apararId,
  temMarcadorExcecao,
  coletarEvidencias,
  indexarGrafo,
  coletarAchados,
  formatarRelatorio,
  main,
} = mod;

// ── Fixture temporária (env overrides lidos LAZY no main) ────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-flips-pendentes-"));
const logDir = path.join(tmp, "logs");
fs.mkdirSync(logDir);

const LOG_FIXTURE = [
  "# Log de execucao — fixture",
  "",
  "Preambulo sem ids relevantes.",
  "",
  "## Entrada executora (achado)",
  "",
  "Frame FR-TEST-ACHADO entregue em clone isolado.",
  "PR #123 merged na main apos gate verde.",
  "",
  "## Entrada do no verde",
  "",
  "FR-TEST-VERDE: PR #55 merged. No ja esta 🟢 no grafo.",
  "",
  "## Entrada com excecao deprecated",
  "",
  "FR-TEST-DEPRECATED: PR #7 merged, mas o no morreu por decisao posterior.",
  "",
  "## Entrada com excecao aguardando veredito",
  "",
  "FR-TEST-VEREDITO: merged via PR #8; flip aguarda tribunal.",
  "",
  "## Entrada com campo deprecated estruturado",
  "",
  "FR-TEST-CAMPO: PR #11 merged; no com morte estruturada.",
  "",
  "## Entrada com deprecated em contexto de feature (nao isenta)",
  "",
  "FR-TEST-FEATURE: entrega com validacao de status deprecated no decisoes-ledger. PR #99 merged.",
  "",
  "## Entrada sem evidencia de execucao",
  "",
  "FR-TEST-MENCIONADO aparece aqui so como contexto, sem rastro de pull request nem de merge.",
  "",
  "## Entrada com referencia a arquivo (nao é id)",
  "",
  "Veja LILA-DEV/execucao/logs/FR-TEST-VERDE-log.md e FR-TEST-ACHADO.md; PR #77 merged.",
  "",
  "## Entrada sem no no grafo",
  "",
  "SP-TEST-SEMNO: PR #10 merged.",
  "",
].join("\n");

const GRAFO_FIXTURE = {
  keyframes: [],
  sprints: [],
  frames: [
    { id: "FR-TEST-ACHADO", estado: "🟡", nota: "Executor aceito; flip pendente." },
    { id: "FR-TEST-VERDE", estado: "🟢", nota: "Flip 2026-09-20: executado e merged." },
    { id: "FR-TEST-DEPRECATED", estado: "🟡", nota: "⚫ DEPRECADO (veredito humano): frame morreu por decisao." },
    { id: "FR-TEST-VEREDITO", estado: "🟡", nota: "Aguardando veredito do tribunal de valor." },
    { id: "FR-TEST-CAMPO", estado: "🔴", nota: "nota viva qualquer, sem glifo de morte.", deprecated: { em: "2026-10-01", motivo: "remocao" } },
    { id: "FR-TEST-FEATURE", estado: "🟡", nota: "Entrega: gate com validacao de existencia/status deprecated no decisoes-ledger (contexto de feature, nao morte)." },
  ],
};

const grafoPath = path.join(tmp, "grafo.json");
fs.writeFileSync(grafoPath, JSON.stringify(GRAFO_FIXTURE, null, 2));
fs.writeFileSync(path.join(logDir, "2026-09-21-fixture-log.md"), LOG_FIXTURE);

function rodarGuarda() {
  return coletarAchados({
    nos: indexarGrafo(GRAFO_FIXTURE),
    evidencias: coletarEvidencias([logDir]).evidencias,
  });
}

// ── Caso 1: achado detectado ─────────────────────────────────────────────────

test("caso 1 — achado detectado: log executado + nó 🟡 sem justificativa", () => {
  const { achados } = rodarGuarda();
  const achado = achados.find((a) => a.id === "FR-TEST-ACHADO");
  assert.ok(achado, "FR-TEST-ACHADO deve virar achado");
  assert.strictEqual(achado.estado, "🟡");
  assert.ok(achado.arquivo.endsWith("2026-09-21-fixture-log.md"), "evidência aponta o arquivo de log");
  assert.strictEqual(achado.linha, 8, "linha do traço de execução (PR #123 merged), 1-based");
});

// ── Caso 2: nó 🟢 não-achado ─────────────────────────────────────────────────

test("caso 2 — nó 🟢 com log executado NÃO vira achado", () => {
  const { achados } = rodarGuarda();
  assert.ok(!achados.some((a) => a.id === "FR-TEST-VERDE"), "flip feito não dispara a regra");
});

// ── Caso 3: exceção por marcador de justificativa ────────────────────────────

test("caso 3 — exceção estruturada: campo deprecated / ⚫ / aguardando veredito isentam", () => {
  assert.ok(temMarcadorExcecao("⚫ DEPRECADO (veredito humano): frame morreu por decisao."));
  assert.ok(temMarcadorExcecao("Aguardando veredito do tribunal de valor."));
  assert.ok(!temMarcadorExcecao("Executor aceito; flip pendente."));
  assert.ok(!temMarcadorExcecao(""));
  const { achados, excecoes } = rodarGuarda();
  assert.ok(!achados.some((a) => a.id === "FR-TEST-DEPRECATED"), "⚫ na nota isenta");
  assert.ok(!achados.some((a) => a.id === "FR-TEST-VEREDITO"), "aguardando veredito isenta");
  assert.ok(!achados.some((a) => a.id === "FR-TEST-CAMPO"), "campo deprecated estruturado isenta");
  const isentos = excecoes.map((e) => e.id).sort();
  assert.deepStrictEqual(isentos, ["FR-TEST-CAMPO", "FR-TEST-DEPRECATED", "FR-TEST-VEREDITO"]);
  const motivos = Object.fromEntries(excecoes.map((e) => [e.id, e.motivo]));
  assert.strictEqual(motivos["FR-TEST-DEPRECATED"], "⚫", "motivo reflete o marcador casado");
  assert.strictEqual(motivos["FR-TEST-CAMPO"], "campo deprecated", "motivo da morte estruturada");
});

// ── Caso 3b: regressão do falso positivo de 2026-10-06 (LACO-ESTADO) ────────

test("caso 3b — nota com 'deprecated' em CONTEXTO DE FEATURE NÃO isenta (regressão #1017/#1022)", () => {
  const noLaco = { id: "FR-TEST-FEATURE", estado: "🟡", nota: "Entrega: gate com validacao de existencia/status deprecated no decisoes-ledger." };
  assert.strictEqual(temMarcadorExcecao(noLaco), null, "substring avulsa não é morte — é descrição de feature");
  assert.ok(temMarcadorExcecao({ id: "X", deprecated: { motivo: "remocao" }, nota: "menciona deprecated em prosa" }), "campo estruturado isenta mesmo com nota viva");
  const { achados } = rodarGuarda();
  assert.ok(achados.some((a) => a.id === "FR-TEST-FEATURE"), "o flip pendente real aparece como ACHADO (não mais escondido)");
});

// ── Caso 4: exit 0 com achados (não-bloqueante) ──────────────────────────────

test("caso 4 — main() sai com exit 0 MESMO com achados (guarda não-bloqueante)", () => {
  const stdoutAntes = process.stdout.write;
  const saida = [];
  process.stdout.write = (chunk) => { saida.push(String(chunk)); return true; };
  const envAntes = {
    LILA_GRAFO_PATH: process.env.LILA_GRAFO_PATH,
    LILA_FLIPS_LOG_DIR: process.env.LILA_FLIPS_LOG_DIR,
  };
  process.env.LILA_GRAFO_PATH = grafoPath;
  process.env.LILA_FLIPS_LOG_DIR = logDir;
  let codigo;
  try {
    codigo = main();
  } finally {
    process.stdout.write = stdoutAntes;
    if (envAntes.LILA_GRAFO_PATH === undefined) delete process.env.LILA_GRAFO_PATH;
    else process.env.LILA_GRAFO_PATH = envAntes.LILA_GRAFO_PATH;
    if (envAntes.LILA_FLIPS_LOG_DIR === undefined) delete process.env.LILA_FLIPS_LOG_DIR;
    else process.env.LILA_FLIPS_LOG_DIR = envAntes.LILA_FLIPS_LOG_DIR;
  }
  const texto = saida.join("");
  assert.strictEqual(codigo, 0, "exit 0 SEMPRE quando a varredura rodou");
  assert.ok(texto.includes("ACHADO | FR-TEST-ACHADO"), "achado visível no stdout (alerta nunca silencioso)");
  assert.ok(texto.includes("NÃO-bloqueante"), "natureza não-bloqueante declarada na saída");
});

// ── Casos complementares ─────────────────────────────────────────────────────

test("id em log sem traço de execução (PR #/merged) não vira achado", () => {
  const { achados } = rodarGuarda();
  assert.ok(!achados.some((a) => a.id === "FR-TEST-MENCIONADO"), "menção sem evidência não dispara");
});

test("referência a arquivo de log não é id: strip de .md remove o falso alvo", () => {
  const limpo = limparRuidoFormato("Veja LILA-DEV/execucao/logs/FR-TEST-VERDE-log.md e FR-TEST-ACHADO.md; PR #77 merged.");
  assert.ok(!/\bFR-TEST-VERDE-log\b/.test(limpo), "token de arquivo removido");
  assert.ok(!/\bFR-TEST-ACHADO\.md\b/.test(limpo), "token .md removido");
  assert.ok(/PR #77/.test(limpo), "evidência preservada");
  const { achados } = rodarGuarda();
  assert.ok(achados.every((a) => !a.id.endsWith(".md") && !a.id.includes("-log")), "nenhum achado é um arquivo");
});

test("id evidenciado sem nó no grafo ativo NÃO vira achado (contado como menção sem nó)", () => {
  const { achados, mencoesSemNo } = rodarGuarda();
  assert.ok(!achados.some((a) => a.id === "SP-TEST-SEMNO"), "a regra é sobre NÓS não-🟢 — a guarda não inventa alvo");
  assert.strictEqual(mencoesSemNo, 1, "menção sem nó visível no resumo");
});

test("apararId: pontuação final de enumeração não contamina o id", () => {
  assert.strictEqual(apararId("FR-TEST-ACHADO."), "FR-TEST-ACHADO");
  assert.strictEqual(apararId("FR-TEST-ACHADO-"), "FR-TEST-ACHADO");
  assert.strictEqual(apararId("FR-TEST-ACHADO"), "FR-TEST-ACHADO");
});

test("extrairEntradas: quebra por cabeçalho markdown e numera linhas 1-based", () => {
  const entradas = extrairEntradas(LOG_FIXTURE);
  assert.ok(entradas.length >= 7, "cada '## Entrada ...' é uma entrada");
  const executora = entradas.find((e) => e.texto.includes("FR-TEST-ACHADO"));
  assert.ok(executora, "entrada executora isolada");
  assert.ok(!executora.texto.includes("FR-TEST-VERDE"), "não mistura com outras entradas");
  const idx = executora.linhas.findIndex((l) => /PR #\d+/.test(l));
  assert.strictEqual(executora.linhaInicio + idx, 8, "linha absoluta da evidência");
});

test("formatarRelatorio: nunca silencioso — lista isentos e declara a natureza", () => {
  const { achados, excecoes, mencoesSemNo } = rodarGuarda();
  const texto = formatarRelatorio({ achados, excecoes, mencoesSemNo, arquivosLidos: 1 });
  for (const a of achados) assert.ok(texto.includes("ACHADO | " + a.id), "achado listado: " + a.id);
  for (const e of excecoes) assert.ok(texto.includes("ISENTO  | " + e.id), "isento visível: " + e.id);
  assert.ok(texto.includes("menção(ões) a id sem nó"), "menções sem nó contadas no resumo");
  assert.ok(texto.includes("exit 0"), "exit code declarado na saída");
});

test("marcadores de exceção: contrato estruturado é ['campo deprecated', '⚫', 'aguardando veredito']", () => {
  assert.deepStrictEqual(mod.MARCADORES_EXCECAO, ["campo deprecated", "⚫", "aguardando veredito"]);
});

test("main(): grafo ilegível sai com exit 2 (falha explícita, nunca silenciosa)", () => {
  const stderrAntes = process.stderr.write;
  process.stderr.write = () => true;
  const envAntes = process.env.LILA_GRAFO_PATH;
  process.env.LILA_GRAFO_PATH = path.join(tmp, "inexistente.json");
  process.env.LILA_FLIPS_LOG_DIR = logDir;
  let codigo;
  try {
    codigo = main();
  } finally {
    process.stderr.write = stderrAntes;
    if (envAntes === undefined) delete process.env.LILA_GRAFO_PATH;
    else process.env.LILA_GRAFO_PATH = envAntes;
  }
  assert.strictEqual(codigo, 2);
});
