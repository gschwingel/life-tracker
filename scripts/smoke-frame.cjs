#!/usr/bin/env node
/**
 * scripts/smoke-frame.cjs — Smoke escopado por frame (camada LEVE da validação
 * em 2 camadas — decisão humana Igor, execução LOCAL, PATCH-GATE-LOTE-EVIDENCIA).
 *
 * Por frame (leve, meta 1–2 min): commit fino + smoke escopado. Gate completo
 * NÃO roda aqui — o peso integral fica no gate de lote (scripts/gate-lote.cjs,
 * 1× por sprint/merge) e no `npm run gate` (paridade com o CI).
 *
 * C7 (PATCH-OTIMIZACAO-PR-CI-FAILFAST-20260911): o smoke passa a consumir o
 * CLASSIFICADOR CANÔNICO (scripts/select-tests.cjs — nenhuma lista de paths
 * duplicada aqui) e ESCALA CONSERVADORAMENTE para o gate integral quando o plano
 * não permite provar que a seleção é segura: classificador indisponível, plano
 * inválido, fullSuite (config compartilhada, front+back, mudança de protocolo,
 * seleção vazia com código alterado) ou diff de documentação/índices (tiers
 * doc-only/doc-gate, onde não há teste a selecionar). A escalada NÃO é verde:
 * o JSON traz escalou=true + motivoEscalada e o exit é 1 (o código de saída
 * permanece 0/1/2 para não quebrar patch-ship.cjs — nenhum consumo novo de exit).
 *
 * Fluxo:
 *   1. Coleta arquivos staged (git --no-pager diff --cached --name-only).
 *      Nada staged → exit 2 com mensagem "nada staged".
 *   2. Carrega o plano do select-tests e decide escalada (acima).
 *   3. Mapeia testes relacionados: src/lib/foo.ts → foo.test.ts /
 *      __tests__/foo.test.ts / espelho src/__tests__/**; backend/src/services/
 *      foo.ts → backend/src/__tests__/services/foo.test.ts; arquivo de teste
 *      diretamente → o próprio arquivo.
 *   4. Executa os testes relacionados pelo runner CORRETO: vitest (NUNCA watch)
 *      por área (raiz/backend, cada uma com seu config) — exceto
 *      scripts/__tests__/*.{test,spec}.cjs, que são node:test e vão ao runner
 *      canônico `node --test` com caminhos explícitos (P08) — + npx tsc --noEmit
 *      do projeto inteiro (raiz sempre; backend quando há arquivo backend/
 *      staged). Falha de TYPECHECK também reprova o smoke (C7 — antes o exit era
 *      ignorado).
 *   5. Nenhum teste relacionado → roda só o typecheck e reporta testsRelated: 0
 *      (não é falha).
 *
 * Saída: progresso em stderr; UMA linha JSON em stdout:
 *   { "ok": bool, "testsRun": N, "durationMs": N, "escalou": bool,
 *     "motivoEscalada": string|null, "escopo": {classe: n}, "selecionados": [...],
 *     "naoExecutados": [...], "aviso": "smoke verde NÃO substitui o gate integral" }
 *   (as 3 primeiras chaves são contrato antigo e permanecem intactas)
 *
 * FR-HARDENING-GATES-FIXTURE (P08, 2026-09-21): scripts/__tests__/*.test.cjs são
 * node:test e NÃO vão mais ao vitest — o include do config raiz cobre apenas
 * src (ts/tsx), então o vitest respondia "No test files found,
 * exiting with code 1" (falso negativo de roteamento; evidência:
 * PATCH-VETORIAL-FIXTURE-20260920-log.md L60). Runner canônico agora: node --test
 * (mesma regra de caminhos explícitos do scripts/run-test-scripts.cjs). Exit
 * codes 0/1/2 e contrato JSON de stdout permanecem intactos (patch-ship.cjs).
 */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const EXTS = ["ts", "tsx", "js", "jsx"];

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
    ...opts,
  });
  return {
    status: r.status === null ? -1 : r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    error: r.error,
  };
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

const t0 = Date.now();
const iso = () => new Date().toISOString();
const log = (m) => process.stderr.write(`[smoke-frame] ${m}\n`);

// ── C7: plano canônico + escalada conservadora ───────────────────────────────
// A decisão de escopo NÃO é reimplementada aqui: vem do select-tests.cjs (fonte
// única do E4/MATRIZ_TESTES). Sem base = contexto PATCH (staged+unstaged+untracked).
function loadPlan() {
  const r = sh(process.execPath, [path.join(__dirname, "select-tests.cjs"), "--json"], { cwd: ROOT });
  if (r.status !== 0) return { planStatus: r.status === null ? -1 : r.status, plan: null };
  try {
    return { planStatus: 0, plan: JSON.parse(r.stdout) };
  } catch {
    return { planStatus: 0, plan: null };
  }
}

/**
 * Escala para o gate integral quando o plano não prova seleção segura. PURA
 * (tabela de teste). Qualquer dúvida = escalar (E-INV-16): o smoke nunca vira
 * autorização de merge.
 */
function decideEscalation({ planStatus, plan }) {
  if (planStatus !== 0) return { escalar: true, motivos: [`classificador select-tests indisponível (exit ${planStatus})`] };
  if (!plan || typeof plan !== "object") return { escalar: true, motivos: ["plano do select-tests inválido/vazio"] };
  if (plan.docs_only === true) return { escalar: true, motivos: ["tier doc-only: nenhum teste a selecionar — a decisão é do gate integral"] };
  if (plan.doc_gate === true) return { escalar: true, motivos: ["tier doc-gate (índices/grafo): rode npm run gate (índices) — smoke não cobre"] };
  if (plan.fullSuite === true) {
    const motivos = Array.isArray(plan.fullSuiteMotivos) && plan.fullSuiteMotivos.length ? plan.fullSuiteMotivos : ["plano marcou fullSuite sem motivo declarado"];
    return { escalar: true, motivos };
  }
  return { escalar: false, motivos: [] };
}

// ── 1. Arquivos staged ───────────────────────────────────────────────────────
const stagedRes = sh("git", ["--no-pager", "diff", "--cached", "--name-only"]);
if (stagedRes.status !== 0) {
  log("git diff --cached falhou");
  emit({ ok: false, testsRun: 0, durationMs: Date.now() - t0 });
  process.exit(1);
}
const staged = stagedRes.stdout
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
if (staged.length === 0) {
  process.stderr.write("[smoke-frame] nada staged\n");
  emit({ ok: false, testsRun: 0, durationMs: Date.now() - t0, reason: "nada staged" });
  process.exit(2);
}
log(`staged: ${staged.length} arquivo(s)`);

const { planStatus, plan } = loadPlan();
const escalada = decideEscalation({ planStatus, plan });
const escopo = (plan && plan.classes) || {};
if (escalada.escalar) {
  for (const m of escalada.motivos) log(`ESCALADA para o gate integral: ${m}`);
  log("rode: npm run gate (a camada leve não substitui o gate integral)");
  emit({
    ok: false,
    testsRun: 0,
    durationMs: Date.now() - t0,
    escalou: true,
    motivoEscalada: escalada.motivos.join(" | "),
    escopo,
    selecionados: [],
    naoExecutados: ["vitest (relacionados)", "typecheck (raiz/backend)", "gate integral (npm run gate)"],
    aviso: "smoke verde NÃO substitui o gate integral",
  });
  process.exit(1);
}

// Checklist auditável do smoke (C7): o que rodou e o que NÃO rodou.
const selecionados = [];
const naoExecutados = [];

// ── 2. Mapeamento de testes relacionados ─────────────────────────────────────
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function relatedTests(file) {
  if (!exists(file)) return []; // arquivo deletado — sem mapeamento
  if (TEST_FILE_RE.test(file)) return [file]; // já é arquivo de teste

  const dir = path.posix.dirname(file);
  const base = path.posix.basename(file).replace(/\.[^.]+$/, "");
  const cands = [];
  for (const e of EXTS) {
    cands.push(`${dir}/${base}.test.${e}`);
    cands.push(`${dir}/${base}.spec.${e}`);
    cands.push(`${dir}/__tests__/${base}.test.${e}`);
  }
  // Espelho __tests__/: backend/src/services/foo.ts → backend/src/__tests__/services/foo.test.ts
  //                      src/lib/foo.ts → src/__tests__/lib/foo.test.ts
  const mirror = file.match(/^(backend\/src|src)\/(.*)$/);
  if (mirror) {
    const relNoExtPath = relNoExt(mirror[2]);
    for (const e of EXTS) cands.push(`${mirror[1]}/__tests__/${relNoExtPath}.test.${e}`);
  }
  return [...new Set(cands.filter(exists))];
}

function relNoExt(p) {
  return p.replace(/\.[^.]+$/, "");
}

const related = [...new Set(staged.flatMap(relatedTests))];
const rootTests = related.filter((f) => !f.startsWith("backend/"));
// FR-HARDENING-GATES-FIXTURE (P08): testes node:test de scripts/__tests__ NÃO vão
// ao vitest (include raiz = src/**/*.{test,spec}.{ts,tsx} → falso negativo por
// roteamento). Runner canônico: node --test, caminhos explícitos (run-test-scripts.cjs).
const NODE_TEST_RE = /^scripts\/__tests__\/.*\.(?:test|spec)\.cjs$/;
const rootVitestTests = rootTests.filter((f) => !NODE_TEST_RE.test(f));
const rootNodeTests = rootTests.filter((f) => NODE_TEST_RE.test(f));
const backendTests = related.filter((f) => f.startsWith("backend/")).map((f) => f.replace(/^backend\//, ""));
const touchesBackend = staged.some((f) => f.startsWith("backend/"));
log(`testes relacionados: ${related.length} (raiz vitest: ${rootVitestTests.length} | raiz node:test: ${rootNodeTests.length} | backend: ${backendTests.length})`);

// ── 3. Execução (sequencial, exit code capturado) ────────────────────────────
const commands = [];
let testsRun = 0;
let ok = true;

function runGate(file, args, cwd, label, opts = {}) {
  const startedAt = iso();
  const r = sh(file, args, { shell: true, cwd, ...opts });
  const finishedAt = iso();
  commands.push({ cmd: label, exitCode: r.status, startedAt, finishedAt });
  log(`${label} → exit ${r.status}`);
  return r;
}

if (rootVitestTests.length > 0) {
  const r = runGate("npx", ["vitest", "run", ...rootVitestTests], ROOT, `npx vitest run ${rootVitestTests.join(" ")}`);
  selecionados.push(`npx vitest run ${rootVitestTests.join(" ")}`);
  const m = (r.stdout || "").match(/Tests\s+(\d+)\s+passed/);
  testsRun += m ? Number(m[1]) : rootVitestTests.length;
  if (r.status !== 0) ok = false;
}

if (rootNodeTests.length > 0) {
  // P08: node:test com caminhos explícitos e SEM shell (o path do node pode conter
  // espaços no Windows) — mesmo regime portável do run-test-scripts.cjs (CI fix 2026-08-24).
  const r = runGate(process.execPath, ["--test", ...rootNodeTests], ROOT, `node --test ${rootNodeTests.join(" ")}`, { shell: false });
  selecionados.push(`node --test ${rootNodeTests.join(" ")}`);
  // Contagem: TAP ("# pass N") ou spec ("ℹ pass N") — fallback = nº de arquivos.
  const m = (r.stdout || "").match(/[#ℹ]\s*pass\s+(\d+)\s*\r?$/m);
  testsRun += m ? Number(m[1]) : rootNodeTests.length;
  if (r.status !== 0) ok = false;
}

if (backendTests.length > 0) {
  const r = runGate("npx", ["vitest", "run", ...backendTests], path.join(ROOT, "backend"), `npx vitest run ${backendTests.join(" ")} (backend)`);
  selecionados.push(`npx vitest run ${backendTests.join(" ")} (backend)`);
  const m = (r.stdout || "").match(/Tests\s+(\d+)\s+passed/);
  testsRun += m ? Number(m[1]) : backendTests.length;
  if (r.status !== 0) ok = false;
}

if (related.length === 0) {
  log("testsRelated: 0 — nenhum teste relacionado encontrado (não é falha); rodando apenas typecheck");
}

// Typecheck: exit code TAMBÉM reprova o smoke (C7 — antes o retorno era ignorado
// e um erro de tipo passava como smoke verde; era um gate que sumia em silêncio).
const tcRaiz = runGate("npx", ["tsc", "--noEmit"], ROOT, "npx tsc --noEmit (raiz)");
selecionados.push("npx tsc --noEmit (raiz)");
if (tcRaiz.status !== 0) ok = false;
if (touchesBackend) {
  const tcBack = runGate("npx", ["tsc", "--noEmit"], path.join(ROOT, "backend"), "npx tsc --noEmit (backend)");
  selecionados.push("npx tsc --noEmit (backend)");
  if (tcBack.status !== 0) ok = false;
} else {
  naoExecutados.push("npx tsc --noEmit (backend) — nenhum arquivo backend/ staged");
}
if (related.length === 0) {
  naoExecutados.push("vitest (nenhum teste relacionado encontrado pela matriz)");
}
naoExecutados.push("suite completa, test:scripts, E2E e audits (gate integral: npm run gate)");

emit({
  ok,
  testsRun,
  durationMs: Date.now() - t0,
  escalou: false,
  motivoEscalada: null,
  escopo,
  escopoLegivel: Object.entries(escopo)
    .map(([c, n]) => `${c}=${n}`)
    .join(" "),
  selecionados,
  naoExecutados,
  aviso: "smoke verde NÃO substitui o gate integral — rode npm run gate antes do PR/merge",
});
process.exit(ok ? 0 : 1);
