#!/usr/bin/env node
/**
 * scripts/gate-lote.cjs — Gate de lote com evidência JSON (validação em 2 camadas).
 *
 * Camada "por lote" (peso integral, 1× por sprint/merge — decisão humana Igor,
 * execução LOCAL). Complemento da camada leve por frame (scripts/smoke-frame.cjs).
 *
 * Fluxo:
 *   1. Faixa do lote: do GATE-BASE (arquivo .gate-base na raiz, contendo o SHA
 *      do último head validado) até HEAD. Sem marcação anterior — ou marcação
 *      não-ancestral de HEAD (normal após squash-merge: o SHA gravado vem do
 *      branch, nunca da main; SP-ROTEADOR-REASONING 2026-09-13) — ou marcação
 *      IRRESOLVÍVEL no clone local (PATCH-GATE-BASE-FALLBACK-20261010) →
 *      merge-base com origin/main (reportado em stderr, com aviso ALTO quando o
 *      marker existe mas não serve).
 *   2. Gates mecânicos sequenciais com exit code capturado:
 *        npx vitest run      (suíte completa — nunca watch)
 *        npx tsc --noEmit    (typecheck integral)
 *        npx eslint . --max-warnings=0  (lint integral — LIÇÃO SP-ROTEADOR-REASONING
 *          2026-09-13: um erro `react-refresh/only-export-components` escapou do
 *          smoke por frame e só apareceu no `pr-gate` do CI; o lint full entra na
 *          camada de lote, 1×, para o defeito morrer antes do push)
 *   3. Verificação documental E1.5 (rastro): commits AUTORADOS da faixa que
 *      alteraram docs/** ou src/prompts/Canonical/** precisam conter tag de frame
 *      na mensagem (ex: FR-TOOLCALLS-O12, PATCH-X-20260904). Falha senão.
 *      Commits de MERGE (2+ pais) são IGNORADOS: são artefato da plataforma
 *      (mensagem padrão da máquina de merge do GitHub), não trabalho autoral — a
 *      tag é exigência de autoria. Falso positivo medido 2026-09-23: o merge
 *      `3b6c8ac0` (main → branch) carrega docs/manifest-fonte.yaml e reprovava o
 *      lote inteiro, embora os commits de origem (#705/#706/#707) tenham tag. O
 *      conteúdo mergeado já foi validado nos commits de origem, que seguem
 *      exigindo tag quando tocam docs/**.
 *   4. Evidência JSON em LILA-DEV/validacao/gate-lote-<timestamp-UTC>.json
 *      (schema gate-lote-evidence/v1), sempre vinculada ao SHA validado.
 *   5. Sucesso total (todos exit 0 + rastro ok) → atualiza .gate-base para
 *      HEAD. Qualquer falha → marcação NÃO atualizada. Presença de commits
 *      após GATE-BASE invalida evidência anterior por construção (evidência
 *      sempre vinculada ao validatedHeadSha).
 *
 * Não-interativo por construção: vitest run (nunca watch), git --no-pager,
 * spawnSync sem TTY. Saída: progresso em stderr; UMA linha JSON em stdout:
 *   { "ok": true|false, "validatedHeadSha": "...", "durationMs": N }
 */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MARKER_PATH = path.join(ROOT, ".gate-base");
const EVIDENCE_DIR = path.join(ROOT, "LILA-DEV", "validacao");
const SCHEMA = "gate-lote-evidence/v1";

/**
 * Tag de frame em mensagem de commit (ex: FR-TOOLCALLS-O12, SP-AI-WRITE-01, PATCH-X-20260904).
 * As constantes de rastro e a avaliação pura vivem em scripts/lib/gate-lote-core.cjs
 * (H8 do complemento 2026-09-25: núcleo testável; este script fica fachada executável).
 */
const {
  docsDoRastro,
  avaliarCommitDoRastro,
  classificarFalhaScript,
  decidirBaseDoLote,
} = require("./lib/gate-lote-core.cjs");

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
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

function fail(msg) {
  process.stderr.write(`[gate-lote] ERRO: ${msg}\n`);
  emit({ ok: false, validatedHeadSha: null, durationMs: Date.now() - t0 });
  process.exit(1);
}

const t0 = Date.now();
const iso = () => new Date().toISOString();
const log = (m) => process.stderr.write(`[gate-lote] ${m}\n`);
// ── 0. Lock anti-concorrência (PATCH-GATE-LOTE-LOCK 2026-09-05) ──────────────
// Duas sessões paralelas rodando gate-lote simultaneamente correm sobre o mesmo
// .gate-base e gravam evidências concorrentes (observado em 2026-09-05: 2 pares
// de evidências a 3s de distância, vitest flaky por contenção). O lock serializa:
// segunda execução falha rápido em vez de produzir evidência não-determinística.
const LOCK_PATH = path.join(EVIDENCE_DIR, ".gate-lote.lock");
const LOCK_STALE_MS = 30 * 60 * 1000; // 30 min — crash deixa lock órfão; idade maior = removido
function acquireLock() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  if (fs.existsSync(LOCK_PATH)) {
    let info = {};
    try {
      info = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
    } catch {
      /* lock corrompido — tratado como órfão abaixo se velho */
    }
    const age = Date.now() - (Date.parse(info.startedAt) || 0);
    if (age < LOCK_STALE_MS) {
      fail(
        `outro gate-lote em execução (pid ${info.pid || "?"}, iniciado ${info.startedAt || "?"}). ` +
          `Execução concorrente bloqueada — aguarde ou remova ${LOCK_PATH} se for órfão.`
      );
    }
    log(`lock órfão (${Math.round(age / 60000)} min) removido`);
    fs.rmSync(LOCK_PATH, { force: true });
  }
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: iso() }), "utf8");
}
function releaseLock() {
  try {
    fs.rmSync(LOCK_PATH, { force: true });
  } catch {
    /* best-effort */
  }
}
acquireLock();
process.on("exit", releaseLock);
process.on("SIGINT", () => {
  releaseLock();
  process.exit(130);
});
process.on("SIGTERM", () => {
  releaseLock();
  process.exit(143);
});

// ── 1. HEAD ──────────────────────────────────────────────────────────────────

// ── 1. HEAD ──────────────────────────────────────────────────────────────────
const headRes = sh("git", ["--no-pager", "rev-parse", "HEAD"]);
if (headRes.status !== 0) fail("git rev-parse HEAD falhou");
const headSha = headRes.stdout.trim();

// ── 2. Base da faixa (GATE-BASE | merge-base origin/main) ────────────────────
let baseSha;
let baseSource;
// Fallback ratificado (SP-ROTEADOR-REASONING, 2026-09-13): merge-base com
// origin/main também quando o .gate-base EXISTE mas não é ancestral de HEAD.
// Após squash-merge o SHA gravado vem do branch e NUNCA é ancestral da main —
// a falha dura quebrava o gate em todo pós-merge (evidência: exit 1 em 118ms
// na main bccba62e, .gate-base e09e5d05).
// PATCH-GATE-BASE-FALLBACK-20261010: o caso IRRESOLVÍVEL deixou de ser falha dura
// e caiu no MESMO fallback. Medição de 2026-10-10: o marker é arquivo RASTREADO e
// o gate grava nele o head do BRANCH no sucesso; após squash-merge esse SHA não
// está em main e, com o branch apagado, o objeto pode nem existir no clone local
// (main em c8582173 → "could not get object info") — a falha dura quebrava a
// camada 2 do E2 em TODA sessão nova. A decisão vive PURA em decidirBaseDoLote
// (scripts/lib/gate-lote-core.cjs) e é coberta por teste do núcleo.
function resolveViaMergeBase(motivo) {
  const mb = sh("git", ["--no-pager", "merge-base", "origin/main", "HEAD"]);
  if (mb.status !== 0) fail("merge-base com origin/main falhou (rode git fetch origin)");
  baseSha = mb.stdout.trim();
  baseSource = `merge-base com origin/main (${motivo})`;
  log(`GATE-BASE não usado (${motivo}) — fallback → merge-base origin/main = ${baseSha.slice(0, 8)}`);
}
const markerExiste = fs.existsSync(MARKER_PATH);
const markerSha = markerExiste ? fs.readFileSync(MARKER_PATH, "utf8").trim() : "";
const shaResolvivel =
  markerExiste &&
  sh("git", ["--no-pager", "rev-parse", "--verify", `${markerSha}^{commit}`]).status === 0;
const shaAncestral =
  shaResolvivel &&
  sh("git", ["--no-pager", "merge-base", "--is-ancestor", markerSha, headSha]).status === 0;
const decisaoBase = decidirBaseDoLote({ markerExiste, shaResolvivel, shaAncestral });
if (decisaoBase.usarMarker) {
  baseSha = markerSha;
  baseSource = "GATE-BASE (.gate-base)";
} else {
  // Sinal ALTO quando o marker existe mas não serve — inclusive o irresolvível
  // (PATCH-GATE-BASE-FALLBACK-20261010): o gate reescreve o marker no SUCESSO, o
  // que auto-corrige o valor podre na primeira passagem verde.
  if (markerExiste) {
    console.error(
      `[gate-lote] AVISO ALTO: .gate-base = '${markerSha}' não serviu como base (${decisaoBase.motivo}) — seguindo por fallback; o marker é reescrito no sucesso.`
    );
  }
  resolveViaMergeBase(decisaoBase.motivo);
}
log(`faixa: ${baseSha.slice(0, 8)}..${headSha.slice(0, 8)} | base: ${baseSource}`);

// ── 3. Commits e arquivos da faixa ───────────────────────────────────────────
const commitsRes = sh("git", ["--no-pager", "rev-list", "--reverse", `${baseSha}..${headSha}`]);
if (commitsRes.status !== 0) fail("git rev-list falhou");
const commitsRange = commitsRes.stdout
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const filesRes = sh("git", ["--no-pager", "diff", "--name-only", `${baseSha}..${headSha}`]);
if (filesRes.status !== 0) fail("git diff --name-only falhou");
const changedFiles = filesRes.stdout
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
log(`commits na faixa: ${commitsRange.length} | arquivos alterados: ${changedFiles.length}`);

// ── 4. Verificação documental E1.5 (rastro: docs exigem tag de frame) ────────
// A exceção dos manifestos GERADOS (docs/AI-PROJECT-MANIFEST*.md — artefatos de
// build, não docs autorais; bloqueou o lote de 2026-09-05 via e28cd07f) vive no
// núcleo, dentro de `docsDoRastro` (scripts/lib/gate-lote-core.cjs).
const docFilesChanged = docsDoRastro(changedFiles);
const docFailures = [];
const mergeCommitsIgnorados = [];
if (docFilesChanged.length > 0) {
  // Merges (2+ pais) ficam fora do rastro: exigir tag na mensagem padrão da
  // máquina de merge do GitHub é inexigível por construção (não há autor).
  const mergesRes = sh("git", ["--no-pager", "rev-list", "--merges", `${baseSha}..${headSha}`]);
  const mergeSet = new Set(
    mergesRes.status === 0
      ? mergesRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
      : []
  );
  log(`doc trace: ${docFilesChanged.length} arquivo(s) doc alterado(s) — validando tag de frame por commit (merge(s) ignorado(s): ${mergeSet.size})`);
  for (const sha of commitsRange) {
    if (mergeSet.has(sha)) {
      const subj = sh("git", ["--no-pager", "show", "-s", "--format=%s", sha]);
      mergeCommitsIgnorados.push({ sha, subject: (subj.stdout || "").trim() });
      continue;
    }
    const show = sh("git", ["--no-pager", "show", "--name-only", "--pretty=format:%s", sha]);
    if (show.status !== 0) continue;
    const lines = show.stdout.split("\n").map((s) => s.trim());
    const veredito = avaliarCommitDoRastro({
      sha,
      subject: lines[0] || "",
      files: lines.slice(1).filter(Boolean),
      isMerge: false,
    });
    if (veredito && veredito.falha) docFailures.push(veredito.falha);
  }
}

// ── 4.5 [REMOVIDO] Declaração de CHANGELOG — sistema aposentado (evento
// deliberado Igor 2026-10-05, supersedendo FRAME-CHANGELOG-REFORM-20261001).

// ── 5. Gates mecânicos (sequenciais, exit code capturado) ────────────────────
// LIÇÃO SP-ROTEADOR-REASONING (2026-09-13, PR #332): o smoke por frame (rápido,
// por design) não roda o lint de repo inteiro — um erro `react-refresh/
// only-export-components` só apareceu no `pr-gate` do CI. O lint full entra AQUI
// (1× por lote, camada 2) para o defeito ser pego antes do push, com evidência.
const GATES = [
  { cmd: "npx vitest run", file: "npx", args: ["vitest", "run"] },
  { cmd: "npx tsc --noEmit", file: "npx", args: ["tsc", "--noEmit"] },
  { cmd: "npx eslint . --max-warnings=0", file: "npx", args: ["eslint", ".", "--max-warnings=0"] },
];
const commands = [];
for (const gate of GATES) {
  const startedAt = iso();
  const r = sh(gate.file, gate.args, { shell: true });
  const finishedAt = iso();
  // H8: a saída do gate é classificada (verde | artefato-tty | falha-com-resultado |
  // falha) e o veredito vai para a EVIDÊNCIA. O exit code continua mandando — a
  // classificação é diagnóstico explícito, nunca cura silenciosa de vermelho
  // (`.clinerules` EXECUCAO_CLI: `stdout is not a tty` = artefato do harness).
  const saida = `${r.stdout}\n${r.stderr}`;
  const classificacao = classificarFalhaScript(saida, r.status);
  commands.push({
    cmd: gate.cmd,
    exitCode: r.status,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    classificacao: classificacao.tipo,
  });
  log(`${gate.cmd} → exit ${r.status} (${classificacao.tipo})`);
}

const allGreen = commands.every((c) => c.exitCode === 0) && docFailures.length === 0;
const overallExitCode = allGreen ? 0 : 1;

// ── 6. Evidência JSON (rastreável, vinculada ao SHA validado) ────────────────
const evidence = {
  schema: SCHEMA,
  validatedHeadSha: headSha,
  baseSha,
  commitsRange,
  commands,
  docTrace: {
    docFilesChanged,
    frameTagsVerified: docFailures.length === 0,
    failures: docFailures,
    /** Merges (2+ pais) ignorados por não serem trabalho autoral — rastro de auditoria. */
    mergesIgnorados: mergeCommitsIgnorados,
  },

  overallExitCode,
  generatedAt: iso(),
  generatedBy: "scripts/gate-lote.cjs",
};
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const tsStamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidencePath = path.join("LILA-DEV", "validacao", `gate-lote-${tsStamp}.json`);
fs.writeFileSync(path.join(ROOT, evidencePath), JSON.stringify(evidence, null, 2) + "\n", "utf8");
log(`evidência: ${evidencePath}`);

// ── 7. Marcação GATE-BASE (apenas com exit 0 de tudo) ────────────────────────
if (allGreen) {
  fs.writeFileSync(MARKER_PATH, headSha + "\n", "utf8");
  log(`GATE-BASE atualizado → ${headSha}`);
} else {
  log("FALHA — GATE-BASE NÃO atualizado");
}

emit({
  ok: allGreen,
  validatedHeadSha: allGreen ? headSha : null,
  durationMs: Date.now() - t0,
});
process.exit(overallExitCode);
