#!/usr/bin/env node
"use strict";
/**
 * patch-ship.cjs — entrega de patch em UM comando (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905).
 * Fluxo: smoke local (smoke-frame) → commit de conteúdo → push → PR com auto-merge
 * best-effort.
 *
 * FRAME-GATES-ROTINAS-DIARIAS-20261015 (D6): a regeneração de índices e o commit
 * separado chore(indices) SAÍRAM do atalho — o frescor dos derivados é dos
 * watchdogs diários (indices-textual-watchdog 05:20 UTC / vetorial 04:30 UTC,
 * entrega por PR com required checks) e nenhum gate por-PR reprova staleness.
 * Regen on-demand (trigger C6, FDV-EXEC) quando a sessão consumir índice stale:
 * nesse caso os índices regenerados vão NO commit de conteúdo (commit único é
 * válido — FRESHNESS_BY_CONTENT).
 *
 * Uso: node scripts/patch-ship.cjs "mensagem do commit" [--no-pr]
 *   --no-pr        não cria/atualiza PR (só commits + push).
 * Exit: 0 sucesso | 1 falha (nada é commitado em falha de smoke/preflight)
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEBT_PATH = path.join(ROOT, "LILA-DEV", "execucao", "patch-debt.json");

// Artefatos derivados de índice (FRAME-GATES-ROTINAS-DIARIAS-20261015: sem
// regen nem commit separado no atalho; a lista sobrevive só para o guard de
// preflight "só índices?" — entrega pura de regen é trabalho do watchdog).
const ARTE_INDICE_RE = [
  /^indice-vetorial\.json$/,
  /^indice-vetorial\.bin$/,
  /^LILA-DEV\/indice-rastreabilidade\.json$/,
  /^docs\/AI-PROJECT-MANIFEST-INDEX\.md$/,
];

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 200 * 1024 * 1024, ...opts });
  return { status: r.status === null ? -1 : r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function git(args, opts = {}) {
  return sh("git", ["--no-pager", ...args], opts);
}

function die(msg, code = 1) {
  process.stderr.write(`[patch-ship] ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const cfg = { noPr: false };
  const rest = [];
  for (const a of argv) {
    if (a === "--no-pr") cfg.noPr = true;
    else rest.push(a);
  }
  cfg.message = rest.join(" ").trim();
  return cfg;
}

function slugDaMensagem(m) {
  return m
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function eArtefatoIndice(rel) {
  return ARTE_INDICE_RE.some((re) => re.test(rel));
}

function arquivosRastreadosIndices() {
  const r = git(["diff", "--cached", "--name-only"]);
  if (r.status !== 0) return [];
  return r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

// ── G9 (Lote 1): corpo do PR montado a partir da evidencia do ciclo ──────────
// "Aprovacao vira revisao de veredito, nao arqueologia": o corpo declara os gates
// rodados neste ciclo, os testes selecionados (plano do select-tests), a referencia
// declarada na mensagem e a divida aberta no ledger (ou zero).

/** Le as dividas ABERTAS do ledger (nunca lanca: ledger ausente = zero). */
function lerDividasAbertas(ledgerPath = DEBT_PATH) {
  try {
    const j = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    return (Array.isArray(j.debts) ? j.debts : []).filter((d) => d && d.status === "aberta");
  } catch {
    return [];
  }
}

/** Extrai a referencia declarada na mensagem (ex.: [FRAME-X-20260920] -> FRAME-X-20260920). */
function extrairReferencia(mensagem) {
  const m = /\[([A-Z][A-Z0-9-]{2,})\]/.exec(String(mensagem || ""));
  return m ? m[1] : null;
}

/** Monta o corpo do PR (funcao pura — testada em __tests__/patch-ship.test.cjs). */
function montarCorpoPr({ mensagem = "", checagens = [], testes = null, referencia = null, dividas = [] } = {}) {
  const linhas = [];
  linhas.push("Corpo gerado por `patch-ship` — evidencia do proprio ciclo (sem arqueologia).");
  linhas.push("");
  linhas.push("## Mudanca");
  linhas.push(`- Mensagem: \`${String(mensagem).trim()}\``);
  linhas.push(`- Referencia declarada: ${referencia ? "`" + referencia + "`" : "nao declarada na mensagem"}`);
  linhas.push("");
  linhas.push("## Gates rodados neste ciclo");
  if (checagens.length === 0) linhas.push("- nenhum gate registrado");
  else for (const c of checagens) linhas.push(`- ${c.nome}: ${c.ok ? "verde" : "FALHOU"}${c.detalhe ? " — " + c.detalhe : ""}`);
  linhas.push("");
  linhas.push("## Testes selecionados");
  if (!testes) {
    linhas.push("- plano indisponivel (select-tests nao executado)");
  } else {
    const classes = Object.entries(testes.classes || {}).map(([k, v]) => `${k} (${v})`).join(", ");
    linhas.push(`- Classes no diff: ${classes || "nenhuma"}`);
    if (Array.isArray(testes.typechecksObrigatorios) && testes.typechecksObrigatorios.length > 0) {
      linhas.push(`- Typechecks obrigatorios: ${testes.typechecksObrigatorios.join(", ")}`);
    }
    if (Array.isArray(testes.testesRelacionados) && testes.testesRelacionados.length > 0) {
      linhas.push(`- Testes relacionados: ${testes.testesRelacionados.join(", ")}`);
    }
    linhas.push(`- Suite completa exigida: ${testes.fullSuite ? "sim" : "nao"}`);
  }
  linhas.push("");
  linhas.push("## Divida declarada");
  if (dividas.length === 0) linhas.push("- Nenhuma divida aberta no ledger");
  else for (const d of dividas) linhas.push(`- \`${d.id}\` (${d.area || "sem area"}): ${d.descricao || d.tipo || "sem descricao"}`);
  return linhas.join("\n") + "\n";
}

function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (!cfg.message) {
    die('mensagem obrigatória: node scripts/patch-ship.cjs "feat(x): ..." [--no-pr]');
  }
  const checagens = [];

  const ramoAtual = git(["branch", "--show-current"]).stdout.trim();
  const emMain = ramoAtual === "main" || !ramoAtual;
  if (emMain) {
    const novo = `tronco/${slugDaMensagem(cfg.message)}`;
    const b = sh("git", ["switch", "-c", novo]);
    if (b.status !== 0) die(`falha ao criar branch ${novo}: ${b.stderr.trim()}`);
    console.log(`[patch-ship] branch criada: ${novo}`);
  }

  // Pré-flight: precisa haver mudança de conteúdo para commitar.
  const diff = git(["diff", "--name-only"]).stdout.trim();
  const novos = sh("git", ["ls-files", "--others", "--exclude-standard"]).stdout.trim();
  const temConteudo = diff.split("\n").concat(novos.split("\n"))
    .map((l) => l.trim()).filter(Boolean)
    .some((f) => !eArtefatoIndice(f));
  if (!temConteudo) die("nenhuma mudança de conteúdo detectada (só índices?). Nada a fazer.");

  // 1) Stage do conteúdo (FRAME-GATES-ROTINAS-DIARIAS-20261015: índices regenerados
  // on-demand via C6 vão NO commit único — a separação content/índices morreu com
  // o gate de frescor por-PR).
  let st = sh("git", ["add", "-A"]);
  if (st.status !== 0) die(`git add falhou: ${st.stderr.trim()}`);

  // 2) Smoke local: app (src/backend/test) via smoke-frame; testes de scripts
  // (node:test, scripts/__tests__/*.test.cjs) via node --test — vitest NÃO roda
  // suíte node:test. Se ambos existirem no mesmo patch, o smoke-frame roda com os
  // testes de scripts temporariamente fora do index (para não os arrastar pro vitest).
  const staged = arquivosRastreadosIndices();
  const appFiles = staged.filter((f) => /^(src|backend|test)\//.test(f));
  const scriptTests = staged.filter((f) => /^scripts\/__tests__\/.*\.test\.cjs$/.test(f));

  if (scriptTests.length > 0) {
    if (appFiles.length > 0) {
      const r = git(["reset", "-q", "--", ...scriptTests]);
      if (r.status !== 0) die(`git reset temporário dos testes de scripts falhou: ${r.stderr.trim()}`);
    }
    const nodeTest = spawnSync(process.execPath, ["--test", ...scriptTests], { cwd: ROOT, encoding: "utf8" });
    process.stdout.write(nodeTest.stdout || "");
    process.stderr.write(nodeTest.stderr || "");
    if (nodeTest.status !== 0) {
      die(`node --test (scripts) falhou (exit ${String(nodeTest.status)}) — nada commitado; revise o diff.`);
    }
    checagens.push({ nome: "test:scripts (node --test)", ok: true, detalhe: `${scriptTests.length} arquivo(s)` });
    if (appFiles.length > 0) {
      const r = git(["add", "--", ...scriptTests]);
      if (r.status !== 0) die(`re-add dos testes de scripts falhou: ${r.stderr.trim()}`);
    }
  }

  if (appFiles.length > 0) {
    const smoke = spawnSync(process.execPath, [path.join(ROOT, "scripts", "smoke-frame.cjs")], {
      cwd: ROOT,
      encoding: "utf8",
    });
    process.stdout.write(smoke.stdout || "");
    process.stderr.write(smoke.stderr || "");
    if (smoke.status !== 0) {
      die(`smoke-frame falhou (exit ${String(smoke.status)}) — nada commitado; revise o diff.`);
    }
    checagens.push({ nome: "smoke-frame (vitest relacionados + typecheck)", ok: true });
  } else {
    console.log("[patch-ship] sem mudanças de app (src/backend/test) — validação via testes de scripts acima.");
  }

  // 2.5) [REMOVIDO] Gate do CHANGELOG — sistema aposentado (evento deliberado
  // Igor 2026-10-05, supersedendo FRAME-CHANGELOG-REFORM-20261001).

  // 2) Commit de conteúdo (único — sem regen nem chore(indices): FRAME-GATES-
  // ROTINAS-DIARIAS-20261015 D6. Os ex-passos 4/5 — `npm run indices` +
  // `indices:manifest` + `indices:vetorial` + `indices:check` + commit separado —
  // saíram: watchdogs diários são os donos do frescor dos derivados).
  st = git(["commit", "-m", cfg.message]);
  if (st.status !== 0) die(`commit de conteúdo falhou: ${st.stderr.trim()}`);

  // 3) Push.
  const ramo = git(["branch", "--show-current"]).stdout.trim();
  const up = git(["rev-parse", "--abbrev-ref", `${ramo}@{upstream}`]);
  st = up.status === 0 ? git(["push"]) : git(["push", "-u", "origin", ramo]);
  if (st.status !== 0) die(`push falhou: ${st.stderr.trim()}`);

  // 4) PR com auto-merge best-effort.
  if (!cfg.noPr) {
    const pr = sh("gh", ["pr", "list", "--head", ramo, "--json", "number", "--limit", "1"]);
    let num;
    try {
      const list = JSON.parse(pr.stdout || "[]");
      num = list.length > 0 ? list[0].number : null;
    } catch {
      num = null;
    }
    if (!num) {
      // G9: corpo do PR montado da evidencia do ciclo (gates + testes + referencia + divida).
      let planoTestes = null;
      const plan = sh(process.execPath, [path.join(ROOT, "scripts", "select-tests.cjs"), "--json"]);
      if (plan.status === 0 && plan.stdout.trim()) {
        try { planoTestes = JSON.parse(plan.stdout); } catch { planoTestes = null; }
      }
      const corpoPr = montarCorpoPr({
        mensagem: cfg.message,
        checagens,
        testes: planoTestes,
        referencia: extrairReferencia(cfg.message),
        dividas: lerDividasAbertas(),
      });
      const create = sh("gh", ["pr", "create", "--base", "main", "--head", ramo, "--title", cfg.message, "--body", corpoPr]);
      if (create.status !== 0) {
        console.log(`[patch-ship] PR não criado: ${create.stderr.trim()}`);
      } else {
        const url = create.stdout.trim().split("\n").pop();
        console.log(`[patch-ship] PR: ${url}`);
        const m = /pull\/(\d+)/.exec(url);
        num = m ? Number(m[1]) : null;
      }
    } else {
      console.log(`[patch-ship] PR existente para ${ramo}: #${num}`);
    }
    if (num) {
      const auto = sh("gh", ["pr", "merge", String(num), "--auto", "--merge"]);
      if (auto.status === 0) console.log(`[patch-ship] auto-merge armado para #${num}`);
      else console.log(`[patch-ship] auto-merge indisponível agora (best-effort): ${auto.stderr.trim().split("\n")[0]}`);
    }
  }

  console.log("[patch-ship] OK — ciclo completo (smoke → conteúdo → índices → push).");
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { slugDaMensagem, eArtefatoIndice, parseArgs, montarCorpoPr, extrairReferencia, lerDividasAbertas };
