// scripts/__tests__/ai-readability-docs.test.cjs
// Sonda semântica de docs AI-facing (PATCH-20260926-003) — testes OFFLINE:
// núcleo puro (retenção/parse/thresholds) + CLI em --mock (sem rede, sem custo).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  THRESHOLDS_DOCS,
  THRESHOLDS_CROSS,
  retencaoSumario,
  parseQAPairs,
  retencaoQA,
  extrairAncoras,
  retencaoAncoras,
  cosseno,
  mediana,
  detectarCrossLang,
  applySyntheticEdits,
} = require("../ai-readability-docs.cjs");

const REPO = path.resolve(__dirname, "..", "..");

test("retencaoSumario — retenção completa = 1, parcial proporcional, baseline sem símbolos = null", () => {
  const base = " bullets de fatos.\nSIMBOLOS: sleep_daily, pinned, FDV_PATCH, lila_readonly";
  // fold reteve 3 de 4 símbolos (FDV_PATCH sumiu)
  const fold = " bullets.\nSIMBOLOS: sleep_daily, pinned, lila_readonly";
  const r = retencaoSumario(base, fold);
  assert.strictEqual(r, 3 / 4);
  // sem SIMBOLOS no baseline → inconclusivo (null), nunca 0 fingido
  assert.strictEqual(retencaoSumario("resumo sem linha de símbolos", "outro resumo"), null);
});

test("retencaoSumario — stopwords e caixa não contam como símbolo", () => {
  const base = "x\nSIMBOLOS: Sleep-Daily.ts, A_FUNCAO, de, para";
  const fold = "y\nSIMBOLOS: sleep-daily.ts, a_funcao";
  // símbolos reais: sleep-daily.ts, a_funcao (stopwords filtradas; case-insensitive)
  assert.strictEqual(retencaoSumario(base, fold), 1);
});

test("parseQAPairs — extrai pares P:/R: em formato estrito", () => {
  const bruto = [
    "Aqui vão os pares:",
    "P: Qual a janela da varredura diária?",
    "R: 72 horas.",
    "",
    "P: Quem autoriza retry failed?",
    "R: O clique humano no botão Rodar Sono.",
    "P: terceira",
    "R: com texto em\n duas linhas",
  ].join("\n");
  const pares = parseQAPairs(bruto);
  assert.strictEqual(pares.length, 3);
  assert.strictEqual(pares[0].p, "Qual a janela da varredura diária?");
  assert.strictEqual(pares[0].r, "72 horas.");
  assert.strictEqual(pares[2].r, "com texto em\n duas linhas");
});

test("parseQAPairs — texto sem pares = array vazio (extrator falhou loud no chamador)", () => {
  assert.deepStrictEqual(parseQAPairs("nada de par aqui"), []);
});

test("retencaoQA — fração de respostas acima do limiar Jaccard; fold sem resposta = 0 no par", () => {
  const base = ["janela de 72 horas", "guarde pinned: nunca dorme"];
  const fold = ["a janela é de 72 horas sim", "sem resposta aqui"];
  // par 1: jaccard alto → ok; par 2: disjunto → não
  const r = retencaoQA(base, fold, 0.5);
  assert.strictEqual(r, 0.5);
  // fold mais curto que baseline → índice ausente vira "" (jaccard 0)
  assert.strictEqual(retencaoQA(base, [base[0]], 0.5), 0.5);
  // baseline vazio → inconclusivo
  assert.strictEqual(retencaoQA([], [], 0.5), null);
});

test("applySyntheticEdits — 5 marcadores em linhas distintas e deterministicamente escolhidas", () => {
  const doc = Array.from({ length: 50 }, (_, i) => "linha " + i).join("\n");
  const { modified, edits } = applySyntheticEdits(doc);
  assert.strictEqual(edits.length, 5);
  const linhasMarcadas = modified.split("\n").filter((l) => l.includes("SYNTH_EDIT_"));
  assert.strictEqual(linhasMarcadas.length, 5);
  const set = new Set(edits.map((e) => e.line));
  assert.strictEqual(set.size, 5);
  // determinismo: segunda chamada = mesmas linhas
  const again = applySyntheticEdits(doc);
  assert.deepStrictEqual(again.edits, edits);
});

test("thresholds declarados no contrato do módulo — ambos os regimes com campos de cosseno", () => {
  // mesmo idioma: instrumento unificado (cosseno) — migrado do Jaccard N=4
  for (const k of ["summarizationCosine", "qaCosine", "syntheticEditAccuracy"]) {
    assert.strictEqual(typeof THRESHOLDS_DOCS[k], "number");
    assert.ok(THRESHOLDS_DOCS[k] > 0 && THRESHOLDS_DOCS[k] < 1);
  }
  assert.strictEqual(THRESHOLDS_DOCS.QA_PAIRS, 5);
  // cross-language: campos próprios + âncora hard 1.0
  for (const k of ["summarizationCosine", "qaCosine", "qaAnswerCosine", "syntheticEditAccuracy"]) {
    assert.strictEqual(typeof THRESHOLDS_CROSS[k], "number");
    assert.ok(THRESHOLDS_CROSS[k] > 0 && THRESHOLDS_CROSS[k] < 1);
  }
});

test("CLI --mock: roda ponta a ponta sem rede, report PASS e modo mock", () => {
  const doc = path.join(REPO, "docs", "ANTI-STALL.md");
  const out = execFileSync("node", [path.join(REPO, "scripts", "ai-readability-docs.cjs"), "--doc", doc, "--mock"], {
    encoding: "utf8",
    cwd: REPO,
  });
  const json = JSON.parse(out.slice(0, out.lastIndexOf("}") + 1));
  assert.strictEqual(json.mode, "mock");
  assert.strictEqual(json.pass, true);
  assert.strictEqual(json.checks.summarization.mock, true);
  assert.strictEqual(json.checks.syntheticEdits.pass, true);
});

test("CLI sem --doc: exit 2 e usage (validação de entrada loud)", () => {
  assert.throws(
    () => execFileSync("node", [path.join(REPO, "scripts", "ai-readability-docs.cjs")], { encoding: "utf8", cwd: REPO }),
    (err) => err.status === 2
  );
});

test("CLI sem --baseline: provas 1-2 SKIPPED declaradas, prova 3 roda (mock)", () => {
  const doc = path.join(REPO, "docs", "MSG-FORMAT-BLOCKS.md");
  const out = execFileSync("node", [path.join(REPO, "scripts", "ai-readability-docs.cjs"), "--doc", doc, "--mock"], {
    encoding: "utf8",
    cwd: REPO,
  });
  const json = JSON.parse(out.slice(0, out.lastIndexOf("}") + 1));
  assert.strictEqual(json.checks.summarization.skip, false); // mock preenche valores determinísticos
  // e o modo real (não-mock) sem baseline skipa — coberto pelo contrato do script;
  // aqui garante que o mock nunca skipa (valores presentes).
  assert.strictEqual(typeof json.checks.summarization.retencao, "number");
});

// -------------------------------------------------------------------------
// Modo cross-language (PATCH-SONDA-CALIBRACAO-CROSSLANG-20260930)
// -------------------------------------------------------------------------

test("extrairAncoras — hard = números/IDs com dígito ou prefixo de família/backtick; soft = citados/snake_case sem dígito", () => {
  const { hard, soft } = extrairAncoras(
    "caps identity 1500 | rules 2400 | total 6000; ver E-INV-15 e FR-18-PATCH-03; use l1_breach_events e `sleep_status`; " +
      'gatilho "Finalizar Sessão" e enum CLASSIFICAÇÃO_DE_PENDÊNCIAS'
  );
  for (const esperado of ["1500", "2400", "6000", "E-INV-15", "FR-18-PATCH-03", "l1_breach_events"]) {
    assert.ok(hard.includes(esperado), "hard anchor ausente: " + esperado);
  }
  assert.ok(soft.includes("sleep_status"), "snake_case sem dígito deveria ser soft");
  assert.ok(soft.some((s) => s.includes("Finalizar Sessão")), "citado deveria ser soft");
  // ALL-CAPS de ênfase sem dígito/prefixo não é hard (traduz legitimamente)
  assert.ok(!hard.includes("CLASSIFICAÇÃO_DE_PENDÊNCIAS"));
});

test("retencaoAncoras — hard ausente rebaixa retenção; soft faltante reporta sem pontuar", () => {
  const { hard, soft } = extrairAncoras('cap 2400; ver E-INV-15; use `sleep_status`; literal "muito citado aqui" e valor snake_case_x');
  assert.ok(hard.length >= 2);
  const tudo = retencaoAncoras({ hard, soft }, "cap 2400 e E-INV-15 com sleep_status");
  assert.strictEqual(tudo.retencao, 1);
  assert.ok(tudo.faltandoSoft.length >= 1);
  const faltando = retencaoAncoras({ hard, soft }, "só E-INV-15");
  assert.ok(faltando.retencao < 1);
  assert.ok(faltando.faltandoHard.includes("2400"));
});

test("cosseno — vetores idênticos = 1, ortogonais = 0, tamanhos diferentes = null", () => {
  assert.ok(Math.abs(cosseno([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosseno([1, 0], [0, 1])) < 1e-9);
  assert.strictEqual(cosseno([1], [1, 2]), null);
});

test("mediana — ímpar pega o meio, par faz média, vazia = null", () => {
  assert.strictEqual(mediana([3, 1, 2]), 2);
  assert.strictEqual(mediana([4, 1, 2, 3]), 2.5);
  assert.strictEqual(mediana([]), null);
});

test("detectarCrossLang — baseline PT denso + doc EN = true; ambos PT = false; ambos EN = false", () => {
  const pt = "A revisão das regras de consolidação é feita para que o sistema não perca as decisões sobre o processo do sono quando ele roda sem as pessoas.";
  const en = "The sleep review process consolidates decisions so the runtime never loses governance state while operating without supervision.";
  assert.strictEqual(detectarCrossLang(pt, en), true);
  assert.strictEqual(detectarCrossLang(pt, pt), false);
  assert.strictEqual(detectarCrossLang(en, en), false);
});

test("THRESHOLDS_CROSS — regime declarado, âncora hard = 1.0, QA_PAIRS = 10, thresholds PROVISÓRIOS racionais", () => {
  assert.strictEqual(THRESHOLDS_CROSS.regime, "cross-language");
  assert.strictEqual(THRESHOLDS_CROSS.anchorRetention, 1.0);
  assert.strictEqual(THRESHOLDS_CROSS.QA_PAIRS, 10);
  for (const k of ["summarizationCosine", "qaCosine", "qaAnswerCosine", "syntheticEditAccuracy"]) {
    assert.strictEqual(typeof THRESHOLDS_CROSS[k], "number");
    assert.ok(THRESHOLDS_CROSS[k] > 0 && THRESHOLDS_CROSS[k] < 1);
  }
});

test("CLI --mock com baseline cross-language: prova 0 (âncoras) roda no report", () => {
  const doc = path.join(REPO, "docs", "ANTI-STALL.md");
  const out = execFileSync(
    "node", [path.join(REPO, "scripts", "ai-readability-docs.cjs"), "--doc", doc, "--baseline", doc, "--mock"],
    { encoding: "utf8", cwd: REPO }
  );
  const json = JSON.parse(out.slice(0, out.lastIndexOf("}") + 1));
  assert.strictEqual(json.checks.anchors.mock, true);
  assert.strictEqual(json.checks.anchors.pass, true); // baseline == doc → retenção 1
  assert.strictEqual(json.checks.anchors.retencao, 1);
});
