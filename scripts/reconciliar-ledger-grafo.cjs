#!/usr/bin/env node
/**
 * scripts/reconciliar-ledger-grafo.cjs
 * Proposito: reconciliador mecanico read-only entre o grafo (grafo.json +
 * grafo_historico) e o ledger de decisões (decisoes-ledger.json) — KF-HOMEOSTASE,
 * FR-HOMEOSTASE-N02, decisão D5 do sprint (Igor, item 5): script no gates-grafo
 * semanal, não automation. Fundamento: o MCP valida na ESCRITA (ID alinhado à
 * extração do snapshot); nada detecta divergência POSTERIOR (update_node edita
 * snapshot; deprecate_unit muda ledger; extração canônica pode re-produzir
 * unidades já registradas manualmente) — split-brain degrada E-INV-13/14 na raiz.
 *
 * O que faz: cruza unidades ativas do ledger ↔ nós do grafo ↔ arquivos snapshot:
 *   (i)   unidade ativa cujo node não existe em nenhum grafo (atual/histórico)
 *   (ii)  texto da unidade fora do snapshot do nó, em duas camadas
 *         (FRAME-RECON-LEDGER-GRAFO-20261006/D4): substring exata pós-
 *         normalização (whitespace, ênfase markdown, glifos ≥ ≤ → × —, caixa)
 *         detecta verbatim; falhando, cobertura de tokens classifica
 *         (ii.b) paráfrase — >= COBERTURA_OK (0.85) não reporta, entre 0.85 e
 *         0.6 = parafreseSnapshot (🟡, mesmo conteúdo re-escrito); abaixo de
 *         COBERTURA_DRIFT (0.6) = textoForaSnapshot (🔴, conteúdo ausente =
 *         drift real). snapshot ausente no disco = nao-verificado, não drift —
 *         padrão do campo snapshot: existência no disco é job de validador,
 *         FR-GRAFO veredito 2026-09-06
 *   (iii) nó com unidades ativas mas campo `deprecated` preenchido (órfãs)
 *   (iv)  unidades do MESMO nó com texto normalizado idêntico e IDs distintos
 *         (duplicata — ex.: registro manual prévio + extração canônica posterior)
 *
 * Principio homeostatico (SP-HOMEOSTASE-01): observação ≠ inferência — o script
 * REPORTA fatos; classificação e correção são humanas (padrão D-DIR-01).
 *
 * Entrada: LILA-DEV/planejamento/{grafo.json,decisoes-ledger.json}
 *          (env RECON_GRAFO / RECON_LEDGER sobrepõem, p/ testes)
 * Saida:   relatório legível (stdout) + exit 0 SEMPRE em divergência (report-only)
 * Flags:   --json     emite APENAS JSON estruturado (máquina-legível; texto
 *                     legível vai para stderr)
 *          --strict   exit 1 quando houver divergência (reservado p/ futuro gate)
 * Erros:   exit 2 = problema de leitura/infraestrutura (nunca divergência)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");
const RAIZ = path.join(__dirname, "..");

const CAMINHO_GRAFO = process.env.RECON_GRAFO || path.join(RAIZ, "LILA-DEV/planejamento/grafo.json");
const CAMINHO_LEDGER = process.env.RECON_LEDGER || path.join(RAIZ, "LILA-DEV/planejamento/decisoes-ledger.json");

function normalizar(t) {
  // colapsa whitespace, elimina ênfase markdown (**, `) e canoniza glifos
  // matemáticos/typográficos + caixa — unidades registradas à mão divergem do
  // snapshot em GRAFIA ("≥ 0.85" vs ">= 0.85", travessão, maiúsculas), não em
  // conteúdo; a comparação é semântica, não de formatação
  // (FRAME-RECON-LEDGER-GRAFO-20261006/D4)
  return String(t || "")
    .replace(/[*`]/g, "")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[→⇒]/g, "->")
    .replace(/[×⨯]/g, "x")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Critério (ii) em duas camadas (FRAME-RECON-LEDGER-GRAFO-20261006/D4): substring
// exata pós-normalização detecta verbatim; falhando, cobertura de tokens separa
// PARÁFRASE (mesmo conteúdo, palavras diferentes — registro manual destilado)
// de DRIFT real (conteúdo ausente do snapshot em lugar nenhum).
const COBERTURA_OK = 0.85; // >= COBERTURA_OK: conteúdo presente — não reporta
const COBERTURA_DRIFT = 0.6; // < COBERTURA_DRIFT: conteúdo ausente — drift (🔴)

function tokens(t) {
  return new Set(
    String(t || "")
      .toLowerCase()
      .split(/[^a-zà-ú0-9._/%&+:-]+/)
      .filter((w) => w.length >= 3)
  );
}

function cobertura(textoUnidade, tokensSnapshot) {
  const ut = tokens(textoUnidade);
  if (!ut.size) return 1;
  let hit = 0;
  for (const t of ut) if (tokensSnapshot.has(t)) hit++;
  return hit / ut.size;
}

function coletarNos(grafo) {
  const nos = new Map(); // id -> {node, colecao}
  for (const colecao of ["keyframes", "sprints", "frames"]) {
    for (const n of grafo[colecao] || []) nos.set(n.id, { node: n, colecao });
  }
  return nos;
}

function analisar({ grafoPath = CAMINHO_GRAFO, ledgerPath = CAMINHO_LEDGER, raiz = RAIZ } = {}) {
  const grafo = JSON.parse(fs.readFileSync(grafoPath, "utf8"));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const nosAtual = coletarNos(grafo);
  const nosHistorico = coletarNos(grafo.grafo_historico || {});

  const divergencias = { nosAusentes: [], textoForaSnapshot: [], parafreseSnapshot: [], snapshotsNaoVerificados: [], orfasDeNoMorto: [], duplicatas: [] };

  const porNo = new Map();
  for (const u of ledger.unidades || []) {
    if (!porNo.has(u.node)) porNo.set(u.node, []);
    porNo.get(u.node).push(u);
  }

  for (const [nodeId, unidades] of porNo) {
    const noAtual = nosAtual.get(nodeId);
    const noHist = nosHistorico.get(nodeId);

    // (i) unidade ativa sem nó em lugar nenhum
    for (const u of unidades.filter((x) => x.status === "ativa")) {
      if (!noAtual && !noHist) divergencias.nosAusentes.push({ unidade: u.id, node: nodeId });
    }

    // (iii) nó morto/deprecado com unidades ativas
    const no = noAtual || noHist;
    if (no && (noHist || (no.node.deprecated && no.node.deprecated.evidencia !== undefined))) {
      const ativas = unidades.filter((x) => x.status === "ativa");
      if (ativas.length) {
        const mortoEm = noHist ? "grafo_historico" : "deprecated no grafo atual";
        divergencias.orfasDeNoMorto.push({ node: nodeId, mortoEm, unidades: ativas.map((x) => x.id) });
      }
    }

    // (ii) texto da unidade fora do snapshot do nó — duas camadas (D4):
    // verbatim pós-normalização -> sincronizado; senão cobertura de tokens:
    //   >= COBERTURA_OK    -> não reporta (grafia/paráfrase leve)
    //   >= COBERTURA_DRIFT -> parafreseSnapshot (🟡, mesmo conteúdo re-escrito)
    //   <  COBERTURA_DRIFT -> textoForaSnapshot (🔴, conteúdo ausente = drift)
    if (no && no.node.snapshot) {
      const abs = path.isAbsolute(no.node.snapshot) ? no.node.snapshot : path.join(raiz, no.node.snapshot);
      if (!fs.existsSync(abs)) {
        divergencias.snapshotsNaoVerificados.push({ node: nodeId, snapshot: no.node.snapshot });
      } else {
        const conteudo = normalizar(fs.readFileSync(abs, "utf8"));
        const st = tokens(conteudo);
        for (const u of unidades.filter((x) => x.status === "ativa")) {
          const tn = normalizar(u.texto);
          if (conteudo.includes(tn)) continue;
          const cov = cobertura(tn, st);
          const reg = { unidade: u.id, node: nodeId, cobertura: Math.round(cov * 100) / 100 };
          if (cov >= COBERTURA_OK) continue;
          if (cov >= COBERTURA_DRIFT) divergencias.parafreseSnapshot.push(reg);
          else divergencias.textoForaSnapshot.push(reg);
        }
      }
    }

    // (iv) duplicatas de texto no mesmo nó
    const vistos = new Map();
    for (const u of unidades) {
      const t = normalizar(u.texto);
      if (vistos.has(t)) divergencias.duplicatas.push({ par: [vistos.get(t), u.id], node: nodeId });
      else vistos.set(t, u.id);
    }
  }

  const total = Object.values(divergencias).reduce((s, arr) => s + arr.length, 0);
  return { total, divergencias, escopo: { unidades: (ledger.unidades || []).length, nos: nosAtual.size + nosHistorico.size } };
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Uso: node scripts/reconciliar-ledger-grafo.cjs [--json] [--strict]");
    console.log("  --json    saída APENAS JSON (máquina-legível; texto vai para stderr)");
    console.log("  --strict  exit 1 em divergência (default: report-only, exit 0 — D5)");
    return 0;
  }
  let r;
  try {
    r = analisar();
  } catch (e) {
    console.error("ERRO de leitura (infraestrutura, não divergência):", e.message);
    return 2;
  }
  const out = JSON_OUT ? console.error : console.log;
  out(`escopo: ${r.escopo.unidades} unidades | ${r.escopo.nos} nós (atual+histórico)`);
  const rotulos = {
    nosAusentes: ["(i) unidade ativa sem nó", "🔴"],
    textoForaSnapshot: ["(ii.a) texto ausente do snapshot (drift)", "🔴"],
    parafreseSnapshot: ["(ii.b) paráfrase do snapshot (mesmo conteúdo, re-escrito)", "🟡"],
    snapshotsNaoVerificados: ["(?) snapshot não verificado (ausente no disco)", "⚠️ "],
    orfasDeNoMorto: ["(iii) unidades ativas em nó morto", "🔴"],
    duplicatas: ["(iv) duplicata de texto no mesmo nó", "🟡"],
  };
  for (const [chave, [rotulo, icone]] of Object.entries(rotulos)) {
    const lista = r.divergencias[chave];
    if (!lista.length) continue;
    out(`\n${rotulo} (${lista.length}):`);
    for (const it of lista) out(`  ${icone} ${JSON.stringify(it)}`);
  }
  if (!r.total) console.error("🟢 grafo e ledger sincronizados — nenhuma divergência");
  else console.error(`\ndivergências: ${r.total} — report-only (D5); classificação é humana (D-DIR-01); --strict para bloquear`);
  if (JSON_OUT) console.log(JSON.stringify(r, null, 2));
  return r.total && STRICT ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { analisar, normalizar };
