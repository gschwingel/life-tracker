// gera-fixtures-calibracao.cjs — corpus NEGATIVO da calibração cross-language da
// sonda (PATCH-SONDA-CALIBRACAO-CROSSLANG-20260930). Gera variantes degradadas
// ROTULADAS do FDV-Sono EN em scripts/__tests__/fixtures/sonda-calibracao/.
// Cada fixture DEVE reprovar na sonda (thresholds finais só saem de PROVISÓRIO
// com separação 100% entre positivos e este corpus).
// Uso: node scripts/gera-fixtures-calibracao.cjs   (idempotente, roda 1x)
"use strict";
const fs = require("fs");
const path = require("path");

const FONTE = path.resolve(__dirname, "..", "backend", "src", "prompts", "sleep", "FDV-Sono.md");
const SAIDA = path.resolve(__dirname, "__tests__", "fixtures", "sonda-calibracao");
const texto = fs.readFileSync(FONTE, "utf8");

const degradacoes = [
  {
    nome: "NEG01-drop-secao-12.md",
    rotulo: "§12 BLOCKING_CONDITIONS removida inteira",
    aplicar: (t) => t.slice(0, t.indexOf("§12 BLOCKING_CONDITIONS")) + t.slice(t.indexOf("§13 AUDITABILITY")),
  },
  {
    nome: "NEG02-cap-alterado.md",
    rotulo: "cap de rules alterado em TODAS as ocorrências (número de decisão alterado)",
    aplicar: (t) => t.split("2400").join("4200"),
  },
  {
    nome: "NEG03-excecao-removida.md",
    rotulo: "exceção declarada 2 (v0.9 salience ticker) removida",
    aplicar: (t) => t.replace(/- DECLARED EXCEPTION 2 \(v0\.9 — SP-L1-BUDGET\):[^\n]+\n/, ""),
  },
  {
    nome: "NEG04-condicao-enfraquecida.md",
    rotulo: "'sleep NEVER: resolves ambiguity by inference' enfraquecido para 'should avoid'",
    aplicar: (t) => t.replace("- sleep NEVER: resolves ambiguity by inference", "- sleep SHOULD generally avoid: resolving ambiguity by inference"),
  },
  {
    nome: "NEG05-janela-trocada.md",
    rotulo: "janela 20 → 5 e top 10 → top 3 em TODAS as ocorrências",
    aplicar: (t) => t.split("20-rule").join("5-rule").split("rolling window 20").join("rolling window 5").split("top 10").join("top 3"),
  },
];

fs.mkdirSync(SAIDA, { recursive: true });
let n = 0;
for (const d of degradacoes) {
  const resultado = d.aplicar(texto);
  if (resultado === texto) throw new Error("mutação não aplicou: " + d.nome);
  const cabecalho = "<!-- FIXTURE DE CALIBRACAO — NEGATIVO ROTULADO — nao e prompt real -->\n<!-- rotulo: " + d.rotulo + " -->\n";
  fs.writeFileSync(path.join(SAIDA, d.nome), cabecalho + resultado);
  n++;
}
console.log("fixtures geradas:", n, "em", path.relative(process.cwd(), SAIDA));
