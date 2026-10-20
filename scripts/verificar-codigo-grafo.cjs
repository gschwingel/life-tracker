#!/usr/bin/env node
/**
 * verificar-codigo-grafo.cjs — FR-GRAFO-T5 (achado A8)
 *
 * Checker código→grafo: valida a declaração opcional `codigo: string[]` dos
 * frames do grafo ATIVO contra o source real. Desenho explícito (R-IAFIRST-50-10):
 *  - frame 🟢 sem `codigo` → WARNING "frame 🟢 sem declaração de código" (não erro);
 *  - item de `codigo` = "caminho" ou "caminho#simbolo";
 *    - caminho inexistente no source → ERRO "frame verde sobre código morto" (dono 🟢)
 *      ou WARNING (dono não-🟢);
 *
 * Régua canônica do farol (evento deliberado 2026-09-06): 🟢 = executado e finalizado, com rastro — código declarado em `codigo` precisa estar vivo no source (código morto sobre 🟢 = ERRO).
 *    - símbolo ausente no arquivo (grep simples, sem AST na v1) → ERRO/WARNING idem;
 *  - ERRO → exit 1.
 *
 * Semente de depreciação (regra 0.1.2): ERROs de código morto geram candidato
 * em DRY-RUN na seção `checker` de normalizacao-candidatos.json e o processo
 * PARA — veredito é humano, NUNCA deprecação automática.
 *
 * Env overrides (mesmos nomes do lila-grafo-mcp): LILA_GRAFO_PATH,
 * LILA_GRAFO_CANDIDATOS.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const GRAFO_PATH = process.env.LILA_GRAFO_PATH || path.join(REPO_ROOT, "LILA-DEV", "planejamento", "grafo.json");
const CANDIDATOS_PATH = process.env.LILA_GRAFO_CANDIDATOS || path.join(REPO_ROOT, "LILA-DEV", "planejamento", "normalizacao-candidatos.json");

function candidatosRegistrados() {
  try {
    const c = JSON.parse(fs.readFileSync(CANDIDATOS_PATH, "utf8"));
    return new Set(((c && c.checker && c.checker.candidatos) || []).map((x) => x.node));
  } catch {
    return new Set();
  }
}

function verificar() {
  const g = JSON.parse(fs.readFileSync(GRAFO_PATH, "utf8"));
  const frames = g.frames || [];
  const pendentes = candidatosRegistrados();
  const achados = [];
  for (const fr of frames) {
    if (!fr || !fr.id) continue;
    // nó deprecated (morte de documento aplicada) está resolvido — fora do escopo
    if (fr.deprecated && typeof fr.deprecated === "object") continue;
    const verde = fr.estado === "🟢";
    const aguardandoVeredito = pendentes.has(fr.id);
    const nivelMorto = verde ? (aguardandoVeredito ? "WARNING" : "ERRO") : "WARNING";
    if (!Array.isArray(fr.codigo) || fr.codigo.length === 0) {
      if (verde) achados.push({ nivel: "WARNING", no: fr.id, tipo: "sem-declaracao-codigo", item: null, verde });
      continue;
    }
    for (const decl of fr.codigo) {
      if (typeof decl !== "string" || !decl.trim()) {
        achados.push({ nivel: nivelMorto, no: fr.id, tipo: "codigo-invalido", item: String(decl), verde, aguardandoVeredito });
        continue;
      }
      const [caminho, simbolo] = decl.split("#");
      const abs = path.resolve(REPO_ROOT, caminho);
      if (!fs.existsSync(abs)) {
        achados.push({ nivel: nivelMorto, no: fr.id, tipo: "codigo-morto", item: decl, verde, aguardandoVeredito });
        continue;
      }
      if (simbolo) {
        const conteudo = fs.readFileSync(abs, "utf8");
        const re = new RegExp("\\b" + simbolo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
        if (!re.test(conteudo)) {
          achados.push({ nivel: nivelMorto, no: fr.id, tipo: "simbolo-ausente", item: decl, verde, aguardandoVeredito });
        }
      }
    }
  }
  achados.sort((a, b) =>
    a.no.localeCompare(b.no) ||
    a.tipo.localeCompare(b.tipo) ||
    String(a.item).localeCompare(String(b.item))
  );
  return achados;
}

/** Semente de depreciação em DRY-RUN — grava e PARA (veredito humano, 0.1.2). */
function gravarCandidatos(erros) {
  let anterior;
  try { anterior = JSON.parse(fs.readFileSync(CANDIDATOS_PATH, "utf8")); } catch { anterior = {}; }
  const alvoErros = erros.filter((e) => e.tipo === "codigo-morto" || e.tipo === "simbolo-ausente");
  const nos = [...new Set(alvoErros.map((e) => e.no))].sort();
  const checker = {
    origem: "verificar-codigo-grafo",
    geradoEm: new Date().toISOString(),
    instrucao: "DRY-RUN — veredito humano OBRIGATÓRIO (regra 0.1.2): NÃO aplicar automaticamente. Veredito favorável registra a depreciação via MCP (deprecate_unit) em fluxo posterior.",
    candidatos: nos.map((no) => ({
      node: no, tipo: "remocao", alvo: null, motivo: "contradicao",
      evidencia: "frame \uD83D\uDFE2 sobre código morto — declarado em `codigo` e removido do source (achado A8)",
      veredito: null
    }))
  };
  const artefato = { ...anterior, checker };
  fs.mkdirSync(path.dirname(CANDIDATOS_PATH), { recursive: true });
  fs.writeFileSync(CANDIDATOS_PATH, JSON.stringify(artefato, null, 2) + "\n", "utf8");
  console.log("Candidato(s) de depreciação em DRY-RUN gravados em " + path.relative(REPO_ROOT, CANDIDATOS_PATH)
    + " (seção checker: " + nos.join(", ") + ") — PARANDO: veredito é humano.");
  return nos;
}

function main() {
  const achados = verificar();
  const erros = achados.filter((a) => a.nivel === "ERRO");
  const warnings = achados.filter((a) => a.nivel === "WARNING");

  console.log("=== verificar-codigo-grafo (A8) — frames do grafo ativo ===");
  console.log("");
  if (achados.length === 0) {
    console.log("OK — nenhuma divergência código↔grafo.");
  }
  const linha = (a) => a.nivel.padEnd(7) + " | " + a.no + " | " + a.tipo + (a.item ? " | " + a.item : "") +
    (a.tipo === "codigo-morto" ? (a.verde ? (a.aguardandoVeredito ? " — código morto AGUARDANDO VEREDITO HUMANO (candidato registrado em dry-run)" : " — frame verde sobre código morto") : " — código morto (nó ainda não executado/finalizado)")
      : a.tipo === "sem-declaracao-codigo" ? " — frame 🟢 sem declaração de código" : "");
  for (const a of erros) console.log(linha(a));
  for (const a of warnings) console.log(linha(a));
  const porTipo = {};
  for (const a of achados) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
  console.log("");
  for (const [t, n] of Object.entries(porTipo).sort()) console.log("  " + t + ": " + n);
  console.log("Resumo: " + erros.length + " ERRO(s), " + warnings.length + " WARNING(s).");

  if (erros.some((e) => e.tipo === "codigo-morto" || e.tipo === "simbolo-ausente")) {
    gravarCandidatos(erros);
  }
  if (erros.length > 0) {
    console.log("Exit 1 — frame 🟢 sobre código morto no ativo.");
    process.exitCode = 1;
  } else {
    console.log("Exit 0 — sem ERROs.");
  }
}

main();

module.exports = { verificar, gravarCandidatos };
