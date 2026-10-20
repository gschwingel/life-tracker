#!/usr/bin/env node
/**
 * validar-referencias-grafo.cjs — FR-GRAFO-T2 (achados A2, A3, A6)
 *
 * Valida as referências do universo consolidado (grafo ativo + grafo-historico,
 * ordem dual-universe do acharNo). Fase de lint de schema (--schema) é adicionada
 * no FR-GRAFO-T3 — mesmo script, saída separada.
 *
 * Campos resolvidos por nó: pai, depende_de, desbloqueia, frames_negocio,
 * substituido_por, superseded_by.
 *
 * Classificação (gradiente por estado do nó DONO — resolução P1 2026-08-31):
 *  - id resolvível no universo consolidado → OK (não listado);
 *  - frames_negocio com id sem prefixo FR- → "sem-prefixo-FR";
 *  - id não resolvível → "nao-resolvivel";
 *  - campo com formato inválido → "formato-invalido";
 *  - histórico → sempre WARNING (fóssil);
 *  - ativo, dono 🟢 → ERRO (bloqueia push);
 *  - ativo, dono não-🟢 → WARNING "pendente-materializacao" (não bloqueia).
 *
 * Saída: lista legível "GRAFO | coleção | nó | campo | id | classificação",
 * ordenada por grafo → coleção → nó → campo. Exit code: 1 se houver ERRO do
 * ativo; 0 caso contrário (warnings do histórico não bloqueiam — fóssil).
 *
 * IA-first (R-IAFIRST-50-10): explícito > inteligente, saída em lista, exit
 * code determinístico. Env overrides (mesmos nomes do lila-grafo-mcp):
 * LILA_GRAFO_PATH, LILA_GRAFO_HISTORICO.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const CAMPOS = ["pai", "depende_de", "desbloqueia", "frames_negocio", "substituido_por", "superseded_by"];
const COLECOES = ["keyframes", "sprints", "frames"];

function caminhos() {
  return {
    atual: process.env.LILA_GRAFO_PATH || path.resolve(__dirname, "..", "LILA-DEV", "planejamento", "grafo.json"),
    historico: process.env.LILA_GRAFO_HISTORICO || path.resolve(__dirname, "..", "LILA-DEV", "planejamento", "grafo-historico.json")
  };
}

function carregarGrafo(caminho) {
  const g = JSON.parse(fs.readFileSync(caminho, "utf8"));
  return { keyframes: g.keyframes || [], sprints: g.sprints || [], frames: g.frames || [] };
}

function idsDoCampo(valor) {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor;
  return null; // formato inválido
}

/**
 * Severidade por estado do nó DONO da referência (resolução P1 2026-08-31):
 *  - histórico → sempre WARNING (fóssil por design, A2/A3);
 *  - ativo, dono 🟢 (executado e finalizado — régua canônica do farol, evento 2026-09-06) → ERRO (corrupção real — bloqueia push);
 *  - ativo, dono 🔴/🟡/🟣 (ainda não executado/finalizado) → WARNING pendente-materializacao
 *    (forward reference legítima do FDV-PLAN: frames só viram nós ao
 *    estabilizar; listado, não bloqueia).
 */
function severidadePara(grafoNome, no) {
  if (grafoNome === "historico") {
    return { nivel: "WARNING", motivo: "fóssil — grafo-historico não é corrigido" };
  }
  if (no && no.estado === "🟢") {
    return { nivel: "ERRO", motivo: null };
  }
  return { nivel: "WARNING", motivo: "pendente-materializacao — nó ainda não executado/finalizado (estado " + ((no && no.estado) || "indefinido") + ")" };
}

function validar() {
  const c = caminhos();
  const grafos = [
    { nome: "ativo", caminho: c.atual, grafo: carregarGrafo(c.atual) },
    { nome: "historico", caminho: c.historico, grafo: carregarGrafo(c.historico) }
  ];
  // Universo consolidado: ids de AMBOS os grafos resolvem em qualquer grafo.
  const universo = new Set();
  for (const { grafo } of grafos) {
    for (const colecao of COLECOES) {
      for (const n of grafo[colecao]) if (n && n.id) universo.add(n.id);
    }
  }

  const achados = [];
  for (const { nome, grafo } of grafos) {
    for (const colecao of COLECOES) {
      for (const no of grafo[colecao]) {
        if (!no || !no.id) continue;
        const sev = severidadePara(nome, no);
        const registrar = (campo, id, tipo) => achados.push({ grafo: nome, colecao, no: no.id, campo, id, tipo, nivel: sev.nivel, motivo: sev.motivo });
        for (const campo of CAMPOS) {
          if (no[campo] === undefined || no[campo] === null) continue;
          const ids = idsDoCampo(no[campo]);
          if (ids === null) {
            registrar(campo, JSON.stringify(no[campo]).slice(0, 60), "formato-invalido");
            continue;
          }
          for (const id of ids) {
            if (typeof id !== "string" || !id) {
              registrar(campo, String(id), "formato-invalido");
              continue;
            }
            if (universo.has(id)) continue; // resolvível — OK
            if (campo === "frames_negocio" && !id.startsWith("FR-")) {
              registrar(campo, id, "sem-prefixo-FR");
            } else {
              registrar(campo, id, "nao-resolvivel");
            }
          }
        }
        // A3: o batch grava substituido_por/superseded_by aninhados em
        // node.deprecated (snake_case) — validação no mesmo nível do nó.
        if (no.deprecated && typeof no.deprecated === "object") {
          for (const campo of ["substituido_por", "superseded_by"]) {
            const alvo = no.deprecated[campo];
            if (alvo === undefined || alvo === null) continue;
            const campoLegivel = "deprecated." + campo;
            if (typeof alvo !== "string" || !alvo) {
              registrar(campoLegivel, JSON.stringify(alvo).slice(0, 60), "formato-invalido");
              continue;
            }
            if (universo.has(alvo)) continue;
            registrar(campoLegivel, alvo, "nao-resolvivel");
          }
        }
      }
    }
  }

  // Ordenação determinística: grafo → coleção → nó → campo → id.
  const ordemCampos = CAMPOS.concat(["deprecated.substituido_por", "deprecated.superseded_by"]);
  achados.sort((a, b) =>
    a.grafo.localeCompare(b.grafo) ||
    COLECOES.indexOf(a.colecao) - COLECOES.indexOf(b.colecao) ||
    a.no.localeCompare(b.no) ||
    ordemCampos.indexOf(a.campo) - ordemCampos.indexOf(b.campo) ||
    a.id.localeCompare(b.id)
  );
  return { achados, universoSize: universo.size };
}

// ── Fase --schema (FR-GRAFO-T3, achados A4/A5) ───────────────────────────────
// MESMO script, saída separada: roda com `--schema` e executa apenas o lint de
// schema de campos. Regras:
//  1 (A4): sprint com frames_negocio: [] que possui ids FR-* em
//     delegacoes_tecnicas cujo prefixo casa com o id da sprint → tipo
//     "frames-deslocados-de-campo".
//  2 (A5): desbloqueia contendo id FR-* → tipo "desbloqueia-frame"
//     ("desbloqueia deve apontar para sprint/keyframe, não frame").
//  3 (exceção): sprint com nota explícita no nó → uso legítimo declarado, sem
//     achado na regra 2.
//  4 (FR-ESTADO-EFETIVO-IA-20260921, decisão Igor "foco total: leitura de IA"):
//     coesão do marcador de morte — nota do nó começa com "⚫" ⟺ nó tem campo
//     `deprecated`. Morte canônica é o CAMPO (veredito 2026-08-31); o ⚫ na nota
//     é o sinal de leitura rápida. Drift em QUALQUER direção engana a leitura de
//     IA (verde-morto silencioso OU morte fantasma) → ERRO no ATIVO, todas as
//     coleções, independente do farol de execução. Histórico: fora (fóssil,
//     nunca corrigido — mesma isenção das demais regras).
// Gradiente por estado do dono (resolução P1 2026-08-31): histórico → WARNING;
// ativo dono 🟢 → ERRO; ativo dono não-🟢 → WARNING pendente-materializacao.

function extrairIdsDelegacoes(valor) {
  if (!Array.isArray(valor)) return [];
  const ids = [];
  for (const item of valor) {
    if (typeof item === "string") ids.push(item);
    else if (item && typeof item === "object" && typeof item.id === "string") ids.push(item.id);
  }
  return ids;
}

function prefixoCasa(sprintId, frameId) {
  // Semântica de FAMÍLIA (A4 real): sprint SP-SEM-01..04 ↔ frames FR-SEM-01..07
  // compartilham a família "SEM" (prefixo da sprint sem o sufixo numérico).
  // Ex.: SP-SEM-02 → família "SEM" → FR-SEM-04 casa; FR-18-HARD-N01 não casa
  // com SP-18-Hardening ("18-HARD" ≠ "18-Hardening").
  if (!frameId.startsWith("FR-")) return false;
  const familia = sprintId.replace(/^SP-/, "").replace(/-\d+$/, "");
  if (!familia) return false;
  return frameId.slice("FR-".length).startsWith(familia + "-");
}

function schemaLint() {
  const c = caminhos();
  const grafos = [
    { nome: "ativo", grafo: carregarGrafo(c.atual) },
    { nome: "historico", grafo: carregarGrafo(c.historico) }
  ];
  const achados = [];
  for (const { nome, grafo } of grafos) {
    for (const sprint of grafo.sprints) {
      if (!sprint || !sprint.id) continue;
      const sev = severidadePara(nome, sprint);
      const registrar = (campo, id, tipo) => achados.push({ grafo: nome, no: sprint.id, campo, id, tipo, nivel: sev.nivel, motivo: sev.motivo });

      // Regra 1 (A4): frames deslocados de campo.
      const framesNegocio = Array.isArray(sprint.frames_negocio) ? sprint.frames_negocio : [];
      const delegIds = extrairIdsDelegacoes(sprint.delegacoes_tecnicas);
      if (framesNegocio.length === 0) {
        const deslocados = delegIds.filter((id) => id.startsWith("FR-") && prefixoCasa(sprint.id, id));
        for (const id of deslocados) registrar("delegacoes_tecnicas", id, "frames-deslocados-de-campo");
      }

      // Regra 2 (A5): desbloqueia deve apontar para sprint/keyframe, não frame.
      // Exceção 3: nota explícita no nó declara uso legítimo.
      const temNota = typeof sprint.nota === "string" && sprint.nota.trim().length > 0;
      const desbloqueia = Array.isArray(sprint.desbloqueia) ? sprint.desbloqueia : [];
      if (!temNota) {
        for (const id of desbloqueia) {
          if (typeof id === "string" && id.startsWith("FR-")) registrar("desbloqueia", id, "desbloqueia-frame");
        }
      }
    }
  }

  // Regra 4 (FR-ESTADO-EFETIVO-IA): coesão ⚫⟺deprecated — SÓ no grafo ativo
  // (histórico é fóssil). ERRO fixo nas duas direções: o drift mente para a IA.
  const ativo = grafos.find((g) => g.nome === "ativo");
  if (ativo) {
    for (const colecao of COLECOES) {
      for (const no of ativo.grafo[colecao]) {
        if (!no || !no.id) continue;
        const nota = typeof no.nota === "string" ? no.nota.trim() : "";
        const morto = no.deprecated && typeof no.deprecated === "object";
        const marcado = nota.startsWith("⚫");
        if (morto && !marcado) {
          achados.push({ grafo: "ativo", colecao, no: no.id, campo: "nota", id: no.id, tipo: "deprecated-sem-marcador", nivel: "ERRO", motivo: "morte canônica sem ⚫ na nota — leitura de IA vê nó vivo" });
        } else if (marcado && !morto) {
          achados.push({ grafo: "ativo", colecao, no: no.id, campo: "nota", id: no.id, tipo: "marcador-sem-deprecated", nivel: "ERRO", motivo: "⚫ na nota sem campo deprecated — morte fantasma para leitura de IA" });
        }
      }
    }
  }
  // Ordenação determinística.
  const ordemTipo = ["frames-deslocados-de-campo", "desbloqueia-frame", "deprecated-sem-marcador", "marcador-sem-deprecated"];
  achados.sort((a, b) =>
    a.grafo.localeCompare(b.grafo) ||
    a.no.localeCompare(b.no) ||
    ordemTipo.indexOf(a.tipo) - ordemTipo.indexOf(b.tipo) ||
    a.id.localeCompare(b.id)
  );
  return achados;
}

function mainSchema() {
  const achados = schemaLint();
  const erros = achados.filter((a) => a.nivel === "ERRO");
  const warnings = achados.filter((a) => a.nivel === "WARNING");

  console.log("=== validar-referencias-grafo --schema (lint de campos, A4/A5) ===");
  console.log("");
  if (achados.length === 0) {
    console.log("OK — nenhum desvio de schema.");
  }
  const linha = (a) => {
    const sufixo = a.motivo ? " (" + a.motivo + ")" : "";
    const colecao = a.colecao || "sprints";
    return a.nivel.padEnd(7) + " | " + a.grafo + " | " + colecao + " | " + a.no + " | " + a.campo + " | " + a.id + " | " + a.tipo + sufixo;
  };
  for (const a of erros) console.log(linha(a));
  for (const a of warnings) console.log(linha(a));
  const porTipo = {};
  for (const a of achados) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
  console.log("");
  for (const [t, n] of Object.entries(porTipo).sort()) console.log("  " + t + ": " + n);
  console.log("Resumo: " + erros.length + " ERRO(s), " + warnings.length + " WARNING(s).");
  if (erros.length > 0) {
    console.log("Exit 1 — desvios de schema em nó 🟢 do ativo bloqueiam.");
    process.exitCode = 1;
  } else {
    console.log("Exit 0 — sem ERROs de schema.");
  }
}

function main() {
  const { achados, universoSize } = validar();
  const erros = achados.filter((a) => a.nivel === "ERRO");
  const warnings = achados.filter((a) => a.nivel === "WARNING");

  console.log("=== validar-referencias-grafo — universo consolidado (" + universoSize + " ids) ===");
  console.log("");
  if (erros.length === 0 && warnings.length === 0) {
    console.log("OK — todas as referências resolvem.");
  }
  const linha = (a) => {
    const sufixo = a.tipo === "sem-prefixo-FR"
      ? " (frames_negocio exige prefixo FR-)"
      : a.tipo === "nao-resolvivel"
        ? a.motivo ? " (" + a.motivo + ")" : " (id não existe no universo consolidado)"
        : "";
    return a.nivel.padEnd(7) + " | " + a.grafo + " | " + a.colecao + " | " + a.no + " | " + a.campo + " | " + a.id + " | " + a.tipo + sufixo;
  };
  for (const a of erros) console.log(linha(a));
  for (const a of warnings) console.log(linha(a));
  console.log("");
  console.log("Resumo: " + erros.length + " ERRO(s), " + warnings.length + " WARNING(s) (fósseis + pendente-materializacao).");

  // Contagens por tipo (para gates de aceite).
  const porTipo = {};
  for (const a of achados) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
  for (const [t, n] of Object.entries(porTipo).sort()) console.log("  " + t + ": " + n);

  if (erros.length > 0) {
    console.log("Exit 1 — ERROs (nó 🟢 do ativo com referência quebrada) bloqueiam; WARNINGs (fósseis e pendente-materializacao) não bloqueiam.");
    process.exitCode = 1;
  } else {
    console.log("Exit 0 — sem ERROs.");
  }
}

if (process.argv.includes("--schema")) {
  mainSchema();
} else {
  main();
}

module.exports = { validar, schemaLint, caminhos, CAMPOS, COLECOES };
