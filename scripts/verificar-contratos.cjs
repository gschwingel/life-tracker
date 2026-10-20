#!/usr/bin/env node
/**
 * scripts/verificar-contratos.cjs
 * Proposito: verificador MECANICO de elegibilidade do fluxo PATCH (F1 do
 * EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922). Cruza os arquivos citados no
 * patch contra o registry machine-readable de contratos por area
 * (LILA-DEV/execucao/contratos-afetados.json, schema contratos-afetados/v1):
 * o agente nunca precisa "acreditar" que o patch nao toca contrato — roda o script.
 * Entrada: LILA-DEV/execucao/contratos-afetados.json (env CONTRATOS_JSON sobrepoe p/ testes)
 * Saida:   contratos afetados por arquivo citado (stdout) + exit code
 * Erros:   exit 1 = arquivo citado casa contrato registrado (INELEGIVEL -> ESTRUTURAL)
 *          exit 2 = uso invalido OU registry ausente/ilegivel (falha FECHADA —
 *                   registry ausente NUNCA e exit 0 silencioso)
 * Flags:
 *   --files <p1,p2,...>  arquivos citados no patch (relativos a raiz; aceita globs simples:
 *                        backend/src/services/github-*.ts) — caminho absoluto dentro do repo
 *                        e normalizado para relativo
 *   --area <area>        SEM --files: modo consulta (lista os contratos registrados da area,
 *                        exit 0 sempre) | COM --files: nao filtra (avisa) — o cruzamento e
 *                        sempre contra o registry inteiro (fail-closed)
 *   --verbose            exibe cada arquivo verificado e o resultado do cruzamento
 * Testes: scripts/__tests__/verificar-contratos.test.cjs (node --test)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

function caminhoRegistry() {
  return process.env.CONTRATOS_JSON || path.join(REPO_ROOT, "LILA-DEV", "execucao", "contratos-afetados.json");
}

function imprimeUso() {
  console.log("Uso: node scripts/verificar-contratos.cjs --files <p1,p2,...> [--area <area>] [--verbose]");
  console.log("     node scripts/verificar-contratos.cjs --area <area>   (modo consulta)");
  console.log("  --files <p1,p2,...>  arquivos citados no patch (aceita globs simples)");
  console.log("  --area <area>        sem --files: lista os contratos da area (consulta)");
  console.log("  --verbose            detalha o cruzamento arquivo a arquivo");
  console.log("Exit: 0 = nenhum contrato registrado afetado (ELEGIVEL) | 1 = contrato afetado (INELEGIVEL)");
  console.log("      2 = uso invalido ou registry ausente/ilegivel (falha fechada)");
}

/** Normaliza caminho para comparacao (barras, sem "./" e sem "/" inicial). */
function normalizarPath(valor) {
  return String(valor == null ? "" : valor).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

/** Caminho absoluto dentro do repo -> relativo a raiz; demais caminhos passam como estao. */
function relativoAoRepo(arquivo) {
  const bruto = String(arquivo == null ? "" : arquivo).trim().replace(/\\/g, "/");
  const raiz = REPO_ROOT.replace(/\\/g, "/") + "/";
  if (bruto.toLowerCase().startsWith(raiz.toLowerCase())) return normalizarPath(bruto.slice(raiz.length));
  return normalizarPath(bruto);
}

/** Globo simples -> RegExp: "**" atravessa diretorios, "*" fica no segmento, "?" e' 1 caractere. */
function globToRegExp(globo) {
  const alvo = normalizarPath(globo);
  let out = "";
  for (let i = 0; i < alvo.length; i += 1) {
    const c = alvo[i];
    if (c === "*") {
      if (alvo[i + 1] === "*") {
        i += 1;
        if (alvo[i + 1] === "/") {
          i += 1;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + out + "$");
}

/** Um padrao do registry casa o arquivo? (exato quando nao ha curinga) */
function casarPadrao(padrao, arquivo) {
  const p = normalizarPath(padrao);
  if (!p) return false;
  const alvo = relativoAoRepo(arquivo);
  if (!/[*?]/.test(p)) return alvo === p;
  return globToRegExp(p).test(alvo);
}

/** Le o registry. Nunca lanca: devolve { ok, motivo, detalhe, entradas }. */
function carregarRegistry(caminho) {
  const alvo = caminho || caminhoRegistry();
  if (!fs.existsSync(alvo)) {
    return { ok: false, motivo: "registry ausente", detalhe: alvo, entradas: [], caminho: alvo };
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(alvo, "utf8"));
  } catch (e) {
    return { ok: false, motivo: "registry ilegivel", detalhe: e.message, entradas: [], caminho: alvo };
  }
  if (!json || !Array.isArray(json.entradas)) {
    return {
      ok: false,
      motivo: "registry sem campo 'entradas' (schema contratos-afetados/v1)",
      detalhe: alvo,
      entradas: [],
      caminho: alvo,
    };
  }
  return {
    ok: true,
    schema: json.schema || null,
    entradas: json.entradas.filter((e) => e && e.padrao),
    caminho: alvo,
  };
}

/** Cruza os arquivos citados contra as entradas do registry. Puro. */
function avaliar(arquivos, entradas) {
  const matches = [];
  for (const arquivo of arquivos) {
    for (const entrada of entradas) {
      if (casarPadrao(entrada.padrao, arquivo)) {
        matches.push({ arquivo: relativoAoRepo(arquivo), entrada });
      }
    }
  }
  return matches;
}

/** Parse dos argumentos. Devolve { help } | { erro } | { arquivos, area, verbose }. */
function lerArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes("--help") || args.includes("-h")) return { help: true, erro: null };
  const valor = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] && !String(args[i + 1]).startsWith("--") ? args[i + 1] : null;
  };
  const verbose = args.includes("--verbose");
  const area = valor("--area");
  const bruto = valor("--files");
  let arquivos = null;
  if (bruto !== null) {
    arquivos = bruto
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    if (arquivos.length === 0) return { erro: "--files recebido sem caminho (lista vazia)" };
  }
  if (arquivos === null && area === null) {
    return { erro: "informe --files <p1,p2,...> (verificacao) ou --area <area> (consulta)" };
  }
  return { help: false, erro: null, arquivos, area, verbose };
}

function formatarConsulta(entradas, area) {
  if (entradas.length === 0) {
    console.log(`✅ verificar-contratos — nenhum contrato registrado para a area '${area}'`);
    return;
  }
  console.log(`verificar-contratos — consulta do registry (${entradas.length} contrato(s) da area '${area}')`);
  for (const e of entradas) {
    console.log(`  - [${e.id}] ${e.tipo} | ${e.padrao}`);
    console.log(`      ${e.descricao || "-"}`);
  }
}

function main(argv) {
  const args = lerArgs(argv === undefined ? process.argv.slice(2) : argv);
  if (args.help) {
    imprimeUso();
    return 0;
  }
  if (args.erro) {
    console.error(`🔴 verificar-contratos — uso invalido: ${args.erro}`);
    imprimeUso();
    return 2;
  }

  const registry = carregarRegistry();
  if (!registry.ok) {
    console.error(`🔴 verificar-contratos — ${registry.motivo}: ${registry.detalhe}`);
    console.error("Falha FECHADA: sem registry nao existe verificacao de elegibilidade — nunca trate como elegivel.");
    return 2;
  }

  if (args.arquivos === null) {
    formatarConsulta(
      registry.entradas.filter((e) => e.area === args.area),
      args.area,
    );
    console.log("exit 0 (modo consulta — nao decide elegibilidade)");
    return 0;
  }

  if (args.area !== null) {
    console.log(
      `⚠️  --area ${args.area} ignorado no cruzamento: a verificacao e' sempre contra o registry inteiro (fail-closed).`,
    );
  }

  const matches = avaliar(args.arquivos, registry.entradas);
  if (args.verbose) {
    for (const arquivo of args.arquivos) {
      const achou = matches.filter((m) => m.arquivo === relativoAoRepo(arquivo));
      console.log(
        `  - ${relativoAoRepo(arquivo)}: ${achou.length > 0 ? achou.map((m) => m.entrada.id).join(", ") : "sem match"}`,
      );
    }
  }

  if (matches.length === 0) {
    console.log(
      `✅ verificar-contratos — ELEGIVEL: ${args.arquivos.length} arquivo(s) verificado(s) contra ${registry.entradas.length} contrato(s) registrado(s); nenhum match.`,
    );
    return 0;
  }

  console.log(`🔴 verificar-contratos — INELEGIVEL: ${matches.length} match(es) de contrato(s) registrado(s) no patch.`);
  console.log("");
  for (const m of matches) {
    console.log(`  arquivo citado: ${m.arquivo}`);
    console.log(`    - [${m.entrada.id}] area ${m.entrada.area} | tipo ${m.entrada.tipo} | padrao ${m.entrada.padrao}`);
    console.log(`      descricao: ${m.entrada.descricao || "-"}`);
  }
  console.log("");
  console.error("INELEGIVEL — escalar para ESTRUTURAL (FDV-PATCH ELEGIBILIDADE, criterios 2 e 3).");
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  REPO_ROOT,
  caminhoRegistry,
  normalizarPath,
  relativoAoRepo,
  globToRegExp,
  casarPadrao,
  carregarRegistry,
  avaliar,
  lerArgs,
  main,
};
