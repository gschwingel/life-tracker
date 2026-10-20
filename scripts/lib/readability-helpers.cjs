#!/usr/bin/env node
// scripts/lib/readability-helpers.cjs
// ORIGEM: extraído VERBATIM de scripts/ai-readability.cjs (tokenize, jaccardSets,
//   SYMBOL_STOPWORDS, extractSymbols, applySyntheticEdits) no FRAME
//   PATCH-SONDA-JUIZ-DEEPSEEK-20261020 — o harness ai-readability.cjs era CLI
//   MORTO (zero npm script, zero workflow, zero hook, zero teste dedicado) e saiu
//   do disco; só os helpers sobreviviam, consumidos pela sonda viva
//   scripts/ai-readability-docs.cjs (linhas 41-46) e pela suíte dela.
// PROPÓSITO: helpers PUROS da família da sonda de AI-readability — tokenização,
//   Jaccard de conjuntos, extração de símbolos e edição sintética determinística.
//   Sem CLI, sem I/O, sem rede, sem custo: lógica byte-idêntica à extraída
//   (zero refactor). Não carrega PRICE_TABLE/estimateCost/FLAGS/LLM/provas —
//   THRESHOLDS ficou no CLI morto e não tem consumidor (verificado no frame).
"use strict";

function tokenize(text) {
  return new Set(String(text).toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
}

// Jaccard entre conjuntos de tokens: 1 = identico, 0 = disjunto.
function jaccardSets(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  const union = new Set([...a, ...b]);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return union.size === 0 ? 1 : inter / union.size;
}

// Palavras genericas (nao identificam codigo) filtradas da extracao de simbolos.
const SYMBOL_STOPWORDS = new Set([
  // pt-BR comuns
  "o","a","os","as","de","da","do","dos","das","em","para","por","com","que","e","ou","se","no","na","um","uma","ser","est","nao","mais","menos","entre","apos","antes","este","esta","isso","isto","esse","essa","qual","quais","como","quando","onde","mas","ja","so","sem","ate","sobre","segundo","tambem","nenhum","nenhuma","algum","alguma",
  // descritores genericos de diff/dados
  "diff","arquivo","arquivos","linha","linhas","codigo","codigos","base64","hex","hexadecimal","binario","binarios","dados","texto","textos","string","strings","funcao","funcoes","classe","classes","variavel","variaveis","muda","mudanca","mudancas","altera","alteracao","alteracoes","adiciona","adicionar","adicionadas","remove","remover","removidas","cria","criar","criado","criada","novo","nova","novos","parte","partes","exemplo","exemplos","uso","usos","marcacao","marcacoes","comentario","comentarios","trecho","trechos","bloco","blocos","nomes","nome","lista","listas","identificadores","identificador",
  // ingles
  "the","and","or","of","in","to","for","with","on","at","by","is","are","was","were","file","files","line","lines","code","function","functions","class","classes","variable","variables","change","changes","add","adds","added","remove","removes","removed","create","creates","created","new","part","example","examples","none",
]);

// Extrai a lista de simbolos tecnicos que cada LLM reportou na linha 'SIMBOLOS:'.
function extractSymbols(text) {
  const m = String(text).match(/SIMBOLOS\s*:\s*(.+)/i);
  if (!m) return new Set();
  return new Set([...tokenize(m[1])].filter((t) => !SYMBOL_STOPWORDS.has(t)));
}

function applySyntheticEdits(code) {
  const lines = code.split("\n");
  const edits = [];
  const count = Math.min(5, lines.length);
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let idx = (i * 37 + 11) % lines.length;
    while (used.has(idx)) idx = (idx + 1) % lines.length;
    used.add(idx);
    lines[idx] = lines[idx] + " // SYNTH_EDIT_" + i;
    edits.push({ op: "replace", line: idx + 1 });
  }
  return { modified: lines.join("\n"), edits };
}

module.exports = {
  tokenize,
  jaccardSets,
  extractSymbols,
  applySyntheticEdits,
  SYMBOL_STOPWORDS,
};
