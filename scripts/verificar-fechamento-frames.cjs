#!/usr/bin/env node
/**
 * scripts/verificar-fechamento-frames.cjs
 * FRAME-RECON-LEDGER-GRAFO-20261006 (D3) — gate anti-recorrência do furo de
 * fechamento canônico detectado em 2026-10-06: FRAME-CI-LANE-LIGHT-RESILIENCIA-
 * 20261006 foi fechado nos PRs #1148/#1153 com snapshot + log + unidades no
 * ledger, mas o nó NUNCA foi criado no grafo — o frame ficou invisível ao
 * índice de rastreabilidade (que só enxerga nós) e ao reconciliador
 * ledger↔grafo (só cruza unidades com nó existente). Segundo caso do mesmo
 * PR (#1153 podou nó colateral restaurado em #1164); o dano é silencioso
 * porque nenhum gate olhava essa costura.
 *
 * O que faz: para TODO log/snapshot de execução ADICIONADO no diff do PR
 * (padrões abaixo), exige que o ID derivado do nome de arquivo seja nó em
 * grafo.json ou grafo-historico.json (coleções keyframes/sprints/frames).
 *
 *   LILA-DEV/execucao/logs/<ID>-log.md
 *   LILA-DEV/planejamento/snapshots/{frames,sprints,keyframes}/<ID>.md
 *
 * Uso: node scripts/verificar-fechamento-frames.cjs [--base <ref>]
 *   --base <ref>  ref git do início do diff. No CI (pull_request): HEAD^1 —
 *                 o primeiro pai do merge ref é a tip do branch base, logo o
 *                 diff HEAD^1..HEAD é exatamente o delta do PR (mesma técnica
 *                 de scripts/detectar-escopo-ci.cjs).
 *                 SEM --base, ou base não-resolvível (workflow_dispatch sobre
 *                 branch com 1 commit): FAIL-OPEN DECLARADO — exit 0 com
 *                 aviso. A checagem global (todos os logs do repo) pegaria
 *                 dívida histórica fora do escopo do PR e bloquearia PRs
 *                 alheios; o escopo deste gate é o delta, nunca o estoque.
 *
 * Exit codes: 0 = delta limpo (ou fail-open avisado) | 1 = ID(s) sem nó |
 *             2 = erro de infraestrutura (leitura/parse), nunca divergência
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");

function argBase() {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : null;
}

function git(args) {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" }).trim();
}

function coletarNos(grafo) {
  const ids = new Set();
  for (const colecao of ["keyframes", "sprints", "frames"]) {
    for (const n of grafo[colecao] || []) ids.add(n.id);
  }
  return ids;
}

const LOG_RE = /^LILA-DEV\/execucao\/logs\/([A-Za-z0-9][A-Za-z0-9._-]*)-log\.md$/;
const SNAP_RE = /^LILA-DEV\/planejamento\/snapshots\/(?:frames|sprints|keyframes)\/([A-Za-z0-9][A-Za-z0-9._-]*)\.md$/;

/**
 * Normaliza o ID derivado do nome do arquivo de execução.
 *
 * O sufixo `-E3` é marca do CANAL do log (`<ID>-E3-log.md` é o log E3 do frame
 * `<ID>`), não parte da identidade do nó: sem esta normalização o gate compararia
 * `<ID>-E3` com o grafo e reprovaria TODO PR que adiciona o log E3 de um frame
 * legítimo (falso positivo — o dente do gate é o fechamento canônico do FRAME,
 * conforme a docstring deste arquivo). Caso concreto: o primeiro PR a adicionar
 * um `FRAME-*-E3-log.md` depois da introdução do gate (2026-10-07) foi
 * reprovado com "FRAME-REMOCAO-STEPUP-AUTOMERGE-20261011-E3" sem nó.
 */
function normalizarIdLog(id) {
  return typeof id === "string" ? id.replace(/-E3$/, "") : id;
}

// D3 exige nó onde a IDENTIDADE mora: prefixos das coleções do grafo
// (KF/FR/SP/FRAME) + âncoras de lane (LANE-* — nós permanentes). Logs-
// evidência de patch/lane livre (PATCH-*, FIX-*, AUDITORIA-*, nomes livres)
// NÃO cunham identidade (FLUXO-LANES §1/§2: "patch não cunha nó; entrega =
// log E3") e ficam ISENTOS — o gate não pode proibir o que o FLUXO-LANES
// manda fazer (colisão constatada em 2026-10-07; correção ordenada por
// Igor: "mudar o gate agora"). O dente permanece inteiro para fechamento
// de frames/sprints/kfs — o furo que motivou o D3.
const IDENTIDADE_RE = /^(KF|FR|SP|FRAME|LANE)-/;

function exigeNo(id) {
  return IDENTIDADE_RE.test(id);
}

function main() {
  const base = argBase();
  if (!base) {
    console.log("verificar-fechamento-frames: sem --base — fail-open declarado (escopo do gate é o delta do PR); nada verificado");
    return 0;
  }
  let adicionados;
  try {
    git(["rev-parse", "--verify", base]);
    adicionados = git(["diff", "--diff-filter=A", "--name-only", base, "HEAD"])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    console.log("verificar-fechamento-frames: base '" + base + "' não resolvível — fail-open declarado (aviso, não divergência)");
    return 0;
  }

  const ids = new Set();
  for (const f of adicionados) {
    const m = LOG_RE.exec(f) || SNAP_RE.exec(f);
    if (m) ids.add(normalizarIdLog(m[1]));
  }
  if (!ids.size) {
    console.log("verificar-fechamento-frames: nenhum log/snapshot de execução adicionado no delta — ok");
    return 0;
  }

  let idsGrafo = new Set();
  let idsHist = new Set();
  try {
    idsGrafo = coletarNos(JSON.parse(fs.readFileSync(path.join(RAIZ, "LILA-DEV/planejamento/grafo.json"), "utf8")));
    const histPath = path.join(RAIZ, "LILA-DEV/planejamento/grafo-historico.json");
    if (fs.existsSync(histPath)) idsHist = coletarNos(JSON.parse(fs.readFileSync(histPath, "utf8")));
  } catch (e) {
    console.error("verificar-fechamento-frames: erro lendo grafo(s):", e.message);
    return 2;
  }

  const faltando = [...ids].filter((id) => exigeNo(id) && !idsGrafo.has(id) && !idsHist.has(id));
  const isentos = [...ids].filter((id) => !exigeNo(id));
  if (!faltando.length) {
    console.log("verificar-fechamento-frames: " + ids.size + " ID(s) adicionado(s) no delta — todos os de identidade com nó no grafo" + (isentos.length ? " (" + isentos.length + " isento(s): log-evidência de patch/lane)" : "") + " — ok");
    return 0;
  }
  console.error("verificar-fechamento-frames: log/snapshot adicionado no PR SEM nó no grafo (fechamento canônico incompleto — criar o nó no mesmo PR):");
  for (const id of faltando) console.error("  🔴 " + id);
  return 1;
}

if (require.main === module) process.exit(main());
module.exports = { main, exigeNo, IDENTIDADE_RE, normalizarIdLog, LOG_RE };
