#!/usr/bin/env node
// scripts/detectar-escopo-ci.cjs
// Proposito: fachada fina sobre scripts/select-tests.cjs (MATRIZ_TESTES do FDV-EXEC)
//   para os jobs de PR do CI: converte o plano deterministico de classes em flags de
//   skip (RUN_TCI, RUN_BACK, RUN_E2E, RUN_SCRIPTS, FRONT_MODE, BACK_MODE, RUN_INDICES,
//   DOC_ONLY, DOC_GATE) e as publica
//   no GITHUB_ENV quando presente — os steps condicionais usam if: env.<FLAG> == 'true'.
//   RUN_SCRIPTS (PATCH-CI-FAST-LANES-20261001): lane de diff só scripts/** (só
//     test:scripts + warm-up do .bin). FRONT_MODE: como a suíte front roda no
//     merge-gate — "coverage" (full + PATH-GATE), "changed" (vitest --changed,
//     sem coverage — só com diff provando que nenhum arquivo de threshold foi
//     tocado) ou "skip".
//   BACK_MODE (FRAME-CI-LANE-LIGHT-RESILIENCIA-20261006, P3): espelho do FRONT_MODE
//     para a suíte backend — mesmos três valores e mesma regra conservadora, com a
//     lista de thresholds PER-ARQUIVO de backend/vitest.config.ts (3 rotas gateadas).
//   Publica tambem INSTALL_ROOT/INSTALL_BACK (C4, 2026-09-11): instalacoes de
//   dependencia por escopo, consumidas APENAS pelo merge-gate (o pr-gate mantem
//   npm ci incondicional — ver computeInstalls).
// Regra de ouro (WET > DRY, licao dos MCPs): NUNCA re-implementa a classificacao de
//   paths — reusa select-tests.cjs como fonte unica da verdade.
// Conservador (E-INV-16): qualquer falha (select-tests exit!=0, JSON invalido,
//   --base ausente/vazio) -> TODAS as flags "true" (nunca pula suite por erro de
//   deteccao). config_shared e other -> tudo roda (conservador por desenho).
// Uso: node scripts/detectar-escopo-ci.cjs [--base <ref>]
//   --base <ref>  ref git do inicio do diff. No CI (pull_request): HEAD^1 — o
//                 primeiro pai do merge ref e a tip do branch base, portanto o
//                 diff HEAD^1..HEAD e exatamente o delta do PR. Em
//                 workflow_dispatch nao ha merge ref -> chamar SEM --base
//                 (conservador: tudo roda).
// Saida: stdout "RUN_TCI=.. RUN_BACK=.. RUN_E2E=.. RUN_INDICES=.. RUN_AUDITS=.. DOC_*=.." | exit 0
//   SEMPRE (script de conveniencia — nunca falha o job; erro vira conservador, nunca skip).

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Mapeamento MATRIZ_TESTES -> flags (classes de select-tests.cjs):
//   RUN_TCI  = test:ci (typechecks+test:scripts+vitest front)
//   RUN_BACK = vitest backend
//   RUN_E2E  = playwright install + backend E2E + E2E gold G1-G3
//   RUN_INDICES = indices:check no pr-gate (diff afeta indices — indicesNecessario)
//   DOC_ONLY = tier 1 (diff .md de prosa) — job vivo, nenhum step de gate
//   DOC_GATE = tier 2 (JSONs de indice/grafo/ledger/mapa) — indices:check agora no pr-gate
// config_shared/other/fullSuite -> sempre true nos RUN_* (E-INV-16: duvida nunca pula).
// RUN_INDICES cobre o DOC_GATE (FRAME-DIETA-WIRING-20261007 D2-v2, decisao Igor:
// dono unico do indices:check = pr-gate; o passo espelho do merge-gate doc-gate
// saiu e o gates-grafo segue dono do indices:status por PR). doc-only mantem
// "false" (nenhum step de gate); conservative() (falha de deteccao) -> true.
function computeFlags(classes, fullSuite, plan) {
  const n = (k) => (classes && classes[k]) || 0;
  const any = (...k) => k.some((x) => n(x) > 0);
  const idxNeeded = plan && plan.indicesNecessario === true ? "true" : "false";
  // FRAME-GATES-ROTINAS-DIARIAS-20261015 (D4): audits por-PR SOMENTE quando o
  // diff toca lockfile (plano auditsNecessario — fonte: select-tests RE.lockfile).
  // Fail-safe duplo: campo AUSENTE no plano -> "true" (sinal ausente nunca pula
  // gate); consumidor no merge-gate usa `!= 'false'` (env ausente roda).
  const auditsNeeded = plan && plan.auditsNecessario === false ? "false" : "true";
  if (fullSuite) {
    return { RUN_TCI: "true", RUN_BACK: "true", RUN_E2E: "true", RUN_SCRIPTS: "false", FRONT_MODE: "coverage", BACK_MODE: "coverage", DOC_ONLY: "false", DOC_GATE: "false", RUN_INDICES: idxNeeded, RUN_AUDITS: "true" };
  }
  if (plan && plan.docs_only === true) {
    return { RUN_TCI: "false", RUN_BACK: "false", RUN_E2E: "false", RUN_SCRIPTS: "false", FRONT_MODE: "skip", BACK_MODE: "skip", DOC_ONLY: "true", DOC_GATE: "false", RUN_INDICES: "false", RUN_AUDITS: "false" };
  }
  if (plan && plan.doc_gate === true) {
    return { RUN_TCI: "false", RUN_BACK: "false", RUN_E2E: "false", RUN_SCRIPTS: "false", FRONT_MODE: "skip", BACK_MODE: "skip", DOC_ONLY: "false", DOC_GATE: "true", RUN_INDICES: "true", RUN_AUDITS: "false" };
  }
  // PATCH-CI-FAST-LANES-20261001 (item 4): diff só de scripts/** deixa de arrastar
  // a suíte front inteira com coverage (RUN_TCI perde a classe "scripts") e ganha
  // lane própria (RUN_SCRIPTS = só test:scripts + warm-up do .bin, que o
  // test:scripts consome — HB-017). Diff MISTO scripts+front mantém RUN_TCI (o
  // step de front já inclui test:scripts nos --steps). FRONT_MODE e BACK_MODE chegam
  // aqui conservadores ("coverage": suíte full + PATH-GATE) e o main() afrouxa para
  // "changed" APENAS com diff materializado provando que nenhum arquivo de
  // threshold foi tocado — ausência de prova nunca acelera (E-INV-16).
  const runTci = any("frontend", "frontend_tests", "config_shared", "other");
  const runBack = any("backend", "backend_tests", "config_shared", "other");
  return {
    RUN_TCI: runTci ? "true" : "false",
    RUN_BACK: runBack ? "true" : "false",
    RUN_E2E: any("frontend", "frontend_tests", "backend", "backend_tests", "config_shared", "other") ? "true" : "false",
    RUN_SCRIPTS: !runTci && any("scripts") ? "true" : "false",
    FRONT_MODE: runTci ? "coverage" : "skip",
    BACK_MODE: runBack ? "coverage" : "skip",
    DOC_ONLY: "false",
    DOC_GATE: "false",
    RUN_INDICES: idxNeeded,
    RUN_AUDITS: auditsNeeded,
  };
}

// ── C4 (PATCH-OTIMIZACAO-PR-CI-FAILFAST-20260911): instalacoes por escopo ─────
// Escopo DECLARADO: job merge-gate. O pr-gate mantem `npm ci` INCONDICIONAL
// porque seu passo consolidado roda typecheck:back (cwd backend) e
// validar-workflows (js-yaml da raiz) em TODO PR de codigo — condicionar ali
// removeria dependencia de steps que continuam rodando (gate sumindo em
// silencio e proibido). Consumidores reais no merge-gate: test:ci (raiz),
// vitest backend (backend), backend do E2E + E2E gold (raiz e backend). Os
// audits NAO usam node_modules (leem package-lock.json + registry).
// Ganho medido: `npm ci` do backend = 28,9s em PR de scripts/indices/docs
// (RUN_BACK=false e RUN_E2E=false). O step de doc-gate tier 2 (indices:check /
// validar-integridade) consome os geradores Node da RAIZ -> INSTALL_ROOT=true
// nesse tier (PATCH-CI-DOC-GATE-INSTALL-20260926, incidente PR #830).
// Fallback conservador (E-INV-16): sinal ausente, desconhecido ou contraditorio
// -> os DOIS npm ci; duvida nunca reduz validacao.
function computeInstalls(flags) {
  const f = flags || {};
  const conhecido = (v) => v === "true" || v === "false";
  const sinais = [f.RUN_TCI, f.RUN_BACK, f.RUN_E2E, f.RUN_SCRIPTS, f.DOC_ONLY, f.DOC_GATE];
  if (!sinais.every(conhecido)) return { INSTALL_ROOT: "true", INSTALL_BACK: "true" };
  const docOnly = f.DOC_ONLY === "true";
  const docGate = f.DOC_GATE === "true";
  const runTci = f.RUN_TCI === "true";
  const runBack = f.RUN_BACK === "true";
  const runE2e = f.RUN_E2E === "true";
  const runScripts = f.RUN_SCRIPTS === "true";
  // Plano contraditorio (tier de doc ligado junto de gate pesado): conservador.
  if ((docOnly || docGate) && (runTci || runBack || runE2e || runScripts)) return { INSTALL_ROOT: "true", INSTALL_BACK: "true" };
  // Tier 1 (prosa, sem step de gate): zero instalacao.
  if (docOnly) return { INSTALL_ROOT: "false", INSTALL_BACK: "false" };
  // Tier 2 (doc-gate): o passo de indices do merge-gate SAIU na dieta (D2-v2) —
  // o indices:check da classe doc_gate roda agora no pr-gate (que instala
  // node_modules da raiz quando DOC_GATE, ver pr-gate npm ci) e o indices:status
  // é do gates-grafo (unconditional por PR). Nenhum step restante do merge-gate
  // para doc_gate usa node_modules — zero instalacao (o #830 MODULE_NOT_FOUND
  // morreu junto com o passo).
  if (docGate) return { INSTALL_ROOT: "false", INSTALL_BACK: "false" };
  // Lane de scripts (RUN_SCRIPTS): test:scripts roda na raiz -> node_modules da raiz
  // obrigatorio; backend segue dispensado (nenhum step da lane toca backend/).
  return {
    INSTALL_ROOT: runTci || runE2e || runScripts ? "true" : "false",
    INSTALL_BACK: runBack || runE2e ? "true" : "false",
  };
}

function conservative(reason) {
  console.log(`[detectar-escopo-ci] conservador (tudo roda): ${reason}`);
  return { RUN_TCI: "true", RUN_BACK: "true", RUN_E2E: "true", RUN_SCRIPTS: "true", FRONT_MODE: "coverage", BACK_MODE: "coverage", RUN_INDICES: "true", RUN_AUDITS: "true" };
}

// PATCH-DEVFLOW-FRESCOR-CONTENT-20260905 (B — fast-lane de catálogo de modelos).
// Arquivos de CÓDIGO do allowlist abaixo + neutros (LILA-DEV/**, docs/**,
// indice-*, docs/AI-PROJECT-MANIFEST-INDEX.md) = patch de dados/catálogo: test:ci
// front + vitest backend continuam (cobrem catálogo e testes dedicados); só o E2E é
// pulado (RUN_E2E=false). Fora do allowlist → lanço completo (conservador).
const FAST_LANE_CODE = new Set([
  "src/lib/models.ts",
  "src/lib/image-models.ts",
  "src/__tests__/lib/image-models.test.ts",
  "src/__tests__/components/chat/ModelDropdown.test.tsx",
  "backend/src/lib/image-model-ids.ts",
  "backend/src/services/openrouter.ts",
  "backend/src/__tests__/services/openrouter-image.test.ts",
  "scripts/lila-models.cjs",
]);
const FAST_LANE_NEUTRO = [
  /^LILA-DEV\//,
  /^docs\//,
  /^indice-vetorial\.(json|bin)$/,
];

function ehFastLane(files) {
  if (!files || files.length === 0) return false;
  const algumCodigo = files.some((f) => FAST_LANE_CODE.has(f));
  if (!algumCodigo) return false;
  return files.every((f) => FAST_LANE_CODE.has(f) || FAST_LANE_NEUTRO.some((re) => re.test(f)));
}

function fastLaneFlags(plan) {
  const idxNeeded = plan && plan.indicesNecessario === true ? "true" : "false";
  return {
    RUN_TCI: "true",
    RUN_BACK: "true",
    RUN_E2E: "false",
    RUN_SCRIPTS: "false",
    FRONT_MODE: "changed",
    BACK_MODE: "changed",
    RUN_INDICES: idxNeeded,
    // Fast lane por construção não contém lockfile (allowlist fechado de
    // código + neutros) — "false" é provado, não presumido (FRAME-GATES-ROTINAS-DIARIAS-20261015).
    RUN_AUDITS: "false",
    DOC_ONLY: "false",
    DOC_GATE: "false",
  };
}

// ── PATCH-CI-FAST-LANES-20261001 (item 2): lane "changed" da suíte front ──────
// Arquivos com threshold de coverage PER-ARQUIVO no vitest.config.ts (PATH-GATE,
// HB-035). Enquanto algum deles estiver no diff, o merge-gate roda a suíte FULL
// com coverage (o PATH-GATE deles é consumido). Sem nenhum no diff, a suíte roda
// em modo --changed (grafo de módulos do Vitest) SEM coverage — o enforce
// integral continua no fluxo que toca os arquivos e no fullSuite.
// PARIDADE: o teste
// scripts/__tests__/detectar-escopo-ci.test.cjs fixa ESTA lista contra o
// vitest.config.ts — arquivo novo no thresholds sem entrar aqui = vermelho.
const COVERAGE_THRESHOLD_FILES = [
  "src/lib/api-client.ts",
  "src/lib/chat-message-adapter.ts",
  "src/lib/ritual-abertura.ts",
  "src/lib/ritual-fechamento.ts",
  "src/lib/chat-persistence.ts",
  "src/lib/google-calendar.ts",
  "src/hooks/useChatSender.ts",
];

/**
 * Decide FRONT_MODE a partir do diff materializado. Pura (testada).
 * Retorna "coverage" (default conservador) ou "changed" (só com prova completa:
 * RUN_TCI ativo, fora de fullSuite/docs tiers, diff legível e nenhum arquivo de
 * threshold tocado). Qualquer dúvida -> "coverage" (E-INV-16).
 */
function decidirFrontMode({ runTci, fullSuite, files, docsOnly, docGate }) {
  if (!runTci) return "skip";
  if (fullSuite || docsOnly || docGate) return "coverage";
  if (!Array.isArray(files) || files.length === 0) return "coverage";
  const tocou = files.some((f) => COVERAGE_THRESHOLD_FILES.includes(f));
  return tocou ? "coverage" : "changed";
}

// ── FRAME-CI-LANE-LIGHT-RESILIENCIA-20261006 (P3): lane "changed" do backend ──
// Espelho exato da lane do front: thresholds PER-ARQUIVO de backend/vitest.config.ts
// (3 rotas gateadas). Enquanto algum deles estiver no diff, o merge-gate roda a
// suíte backend FULL com coverage (o PATH-GATE deles é consumido). Sem nenhum no
// diff, roda em modo --changed (grafo de módulos do Vitest) SEM coverage — o
// enforce integral continua nos fluxos que tocam os arquivos, no fullSuite e no
// cron/regen que roda a suíte inteira. PARIDADE (padrão A2): o teste
// scripts/__tests__/detectar-escopo-ci.test.cjs fixa ESTA lista contra o
// backend/vitest.config.ts — threshold novo sem entrar aqui = vermelho.
const BACK_COVERAGE_THRESHOLD_FILES = [
  "backend/src/routes/auth.ts",
  "backend/src/routes/chat.ts",
  "backend/src/routes/calendar.ts",
];

/**
 * Espelho de decidirFrontMode para a suíte backend. Pura (testada).
 * Mesma regra conservadora: qualquer dúvida -> "coverage" (E-INV-16).
 */
function decidirBackMode({ runBack, fullSuite, files, docsOnly, docGate }) {
  if (!runBack) return "skip";
  if (fullSuite || docsOnly || docGate) return "coverage";
  if (!Array.isArray(files) || files.length === 0) return "coverage";
  const tocou = files.some((f) => BACK_COVERAGE_THRESHOLD_FILES.includes(f));
  return tocou ? "coverage" : "changed";
}

function filesDoDiff(base) {
  const r = spawnSync("git", ["--no-pager", "diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split("\n").map((s) => s.trim().replace(/\\/g, "/")).filter(Boolean);
}

function finish(flags) {
  const docOnly = flags.DOC_ONLY || "false";
  const docGate = flags.DOC_GATE || "false";
  const runIndices = flags.RUN_INDICES || "false";
  const runScripts = flags.RUN_SCRIPTS || "false";
  const frontMode = flags.FRONT_MODE || "coverage";
  const backMode = flags.BACK_MODE || "coverage";
  // FRAME-GATES-ROTINAS-DIARIAS-20261015: fail-safe no consumidor — flag
  // ausente no objeto publica "true" (env ausente no merge-gate roda audits;
  // so "false" explicito do diff sem lockfile pula).
  const runAudits = flags.RUN_AUDITS === "false" ? "false" : "true";
  const installs = computeInstalls(flags);
  console.log(
    `[detectar-escopo-ci] RUN_TCI=${flags.RUN_TCI} RUN_BACK=${flags.RUN_BACK} RUN_E2E=${flags.RUN_E2E} RUN_SCRIPTS=${runScripts} FRONT_MODE=${frontMode} BACK_MODE=${backMode} RUN_INDICES=${runIndices} RUN_AUDITS=${runAudits} DOC_ONLY=${docOnly} DOC_GATE=${docGate} INSTALL_ROOT=${installs.INSTALL_ROOT} INSTALL_BACK=${installs.INSTALL_BACK}`
  );
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `RUN_TCI=${flags.RUN_TCI}\nRUN_BACK=${flags.RUN_BACK}\nRUN_E2E=${flags.RUN_E2E}\nRUN_SCRIPTS=${runScripts}\nFRONT_MODE=${frontMode}\nBACK_MODE=${backMode}\nRUN_INDICES=${runIndices}\nRUN_AUDITS=${runAudits}\nDOC_ONLY=${docOnly}\nDOC_GATE=${docGate}\nINSTALL_ROOT=${installs.INSTALL_ROOT}\nINSTALL_BACK=${installs.INSTALL_BACK}\n`
    );
  }
  process.exit(0); // conveniencia: nunca falha o job — erro vira conservador
}

function main() {
  const argv = process.argv.slice(2);
  const baseIdx = argv.indexOf("--base");
  const base = baseIdx !== -1 ? String(argv[baseIdx + 1] || "").trim() : null;
  if (baseIdx !== -1 && !base) {
    return finish(conservative("--base ausente/vazio (workflow_dispatch)"));
  }
  let plan;
  try {
    const args = [path.join(__dirname, "select-tests.cjs"), "--json"];
    if (base) args.push("--base", base);
    const res = spawnSync(process.execPath, args, { encoding: "utf8" });
    if (res.status !== 0) {
      return finish(conservative(`select-tests exit ${res.status}: ${String(res.stderr || "").trim().slice(0, 120)}`));
    }
    plan = JSON.parse(res.stdout);
  } catch (e) {
    return finish(conservative(`excecao: ${String((e && e.message) || e).slice(0, 120)}`));
  }
  // Fast-lane de catálogo (B): diff só de modelos/dados + neutros → pula E2E.
  // Nunca aplica em fullSuite/docs_only/doc_gate (esses têm prioridade).
  if (base && !(plan.fullSuite === true) && plan.docs_only !== true && plan.doc_gate !== true) {
    const files = filesDoDiff(base);
    if (files && ehFastLane(files)) {
      console.log("[detectar-escopo-ci] fast-lane de catálogo (RUN_E2E=false)");
      return finish(fastLaneFlags(plan));
    }
  }
  const flags = computeFlags(plan.classes, plan.fullSuite === true, plan);
  // PATCH-CI-FAST-LANES-20261001 (item 2): afrouxa FRONT_MODE coverage -> changed
  // só com o diff materializado provando que nenhum arquivo de threshold do
  // PATH-GATE foi tocado. falha/dúvida no diff -> fica "coverage" (conservador).
  if (flags.RUN_TCI === "true" && flags.FRONT_MODE === "coverage") {
    const files = base ? filesDoDiff(base) : null;
    const refinado = decidirFrontMode({
      runTci: true,
      fullSuite: plan.fullSuite === true,
      docsOnly: plan.docs_only === true,
      docGate: plan.doc_gate === true,
      files,
    });
    if (refinado !== flags.FRONT_MODE) {
      console.log(`[detectar-escopo-ci] FRONT_MODE=${refinado} (nenhum arquivo de threshold de coverage no diff)`);
      flags.FRONT_MODE = refinado;
    }
  }
  // FRAME-CI-LANE-LIGHT-RESILIENCIA-20261006 (P3): mesmo afrouxamento para o
  // backend — coverage -> changed só com o diff provando que nenhuma rota
  // gateada de backend/vitest.config.ts foi tocada. falha/dúvida -> "coverage".
  if (flags.RUN_BACK === "true" && flags.BACK_MODE === "coverage") {
    const files = base ? filesDoDiff(base) : null;
    const refinado = decidirBackMode({
      runBack: true,
      fullSuite: plan.fullSuite === true,
      docsOnly: plan.docs_only === true,
      docGate: plan.doc_gate === true,
      files,
    });
    if (refinado !== flags.BACK_MODE) {
      console.log(`[detectar-escopo-ci] BACK_MODE=${refinado} (nenhum arquivo de threshold de coverage do backend no diff)`);
      flags.BACK_MODE = refinado;
    }
  }
  finish(flags);
}

module.exports = { computeFlags, ehFastLane, computeInstalls, decidirFrontMode, decidirBackMode, COVERAGE_THRESHOLD_FILES, BACK_COVERAGE_THRESHOLD_FILES };

if (require.main === module) main();