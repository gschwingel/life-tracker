"use strict";

// Testes do núcleo puro do gate de lote (H8 do complemento pós-sweep 2026-09-25,
// item 3). O `gate-lote.cjs` executa as suítes no `require`, então o que é testável
// — e o que pode regredir em silêncio — é o NÚCLEO de decisão: rastro documental por
// commit (com merges ignorados e docs gerados fora), detecção de lock órfão e a
// classificação de falha de script (artefato "stdout is not a tty" ≠ falha real).

const { test } = require("node:test");
const assert = require("node:assert");

const {
  docsDoRastro,
  avaliarCommitDoRastro,
  lockOrfao,
  classificarFalhaScript,
  decidirBaseDoLote,
  LOCK_STALE_MS,
} = require("../lib/gate-lote-core.cjs");

// ── rastro documental (E1.5) ─────────────────────────────────────────────────

test("docsDoRastro: só docs/** e src/prompts/Canonical/ não-gerados entram", () => {
  const files = [
    "docs/DEPLOY.md",
    "src/prompts/Canonical/FDV-E.md",
    "docs/AI-PROJECT-MANIFEST.md", // GERADO — fora
    "docs/AI-PROJECT-MANIFEST-INDEX.md", // GERADO — fora
    "src/routes/chat.ts",
    "backend/docs/outro.md",
  ];
  assert.deepEqual(docsDoRastro(files), ["docs/DEPLOY.md", "src/prompts/Canonical/FDV-E.md"]);
});

test("avaliarCommitDoRastro: commit com docs/** e SEM tag de frame → falha com sha e motivo", () => {
  const v = avaliarCommitDoRastro({
    sha: "abc1234",
    subject: "fix: ajusta texto do guia",
    files: ["docs/TESTING.md"],
    isMerge: false,
  });
  assert.equal(v.falha.sha, "abc1234");
  assert.match(v.falha.reason, /sem tag de frame/);
});

test("avaliarCommitDoRastro: commit com docs/** e COM tag de frame → passa", () => {
  const v = avaliarCommitDoRastro({
    sha: "abc1234",
    subject: "docs(TESTING): [PATCH-X-20260904] atualiza checklist",
    files: ["docs/TESTING.md"],
    isMerge: false,
  });
  assert.equal(v, null);
});

test("avaliarCommitDoRastro: commit que só toca docs GERADOS → passa (não é doc autoral)", () => {
  const v = avaliarCommitDoRastro({
    sha: "abc1234",
    subject: "chore(indices): regenera manifest",
    files: ["docs/AI-PROJECT-MANIFEST.md", "docs/AI-PROJECT-MANIFEST-INDEX.md"],
    isMerge: false,
  });
  assert.equal(v, null);
});

test("avaliarCommitDoRastro: commit sem doc no escopo → passa (regra não inventa violação)", () => {
  const v = avaliarCommitDoRastro({
    sha: "abc1234",
    subject: "fix(routes): corrige timeout",
    files: ["backend/src/routes/chat.ts", "src/lib/api-client.ts"],
    isMerge: false,
  });
  assert.equal(v, null);
});

test("avaliarCommitDoRastro: MERGE é ignorado por construção (sem autor, mensagem da máquina)", () => {
  const v = avaliarCommitDoRastro({
    sha: "merge001",
    subject: "Merge branch 'main' into feature",
    files: ["docs/manifest-fonte.yaml"],
    isMerge: true,
  });
  assert.deepEqual(v, { ignorado: "merge" });
});

// ── lock anti-concorrência ───────────────────────────────────────────────────

test("lockOrfao: lock ilegível/ausente é órfão", () => {
  assert.equal(lockOrfao(null, 1_700_000_000_000).orfao, true);
});

test("lockOrfao: lock recente NÃO é órfão (execução concorrente bloqueia)", () => {
  const agora = Date.parse("2026-09-27T12:00:00.000Z");
  const recente = { pid: 123, startedAt: "2026-09-27T11:55:00.000Z" };
  const v = lockOrfao(recente, agora);
  assert.equal(v.orfao, false);
  assert.equal(v.idadeMs, 5 * 60 * 1000);
});

test("lockOrfao: lock mais velho que o teto é órfão (crash não trava o gate para sempre)", () => {
  const agora = Date.parse("2026-09-27T12:00:00.000Z");
  const velho = { pid: 123, startedAt: new Date(agora - LOCK_STALE_MS - 1000).toISOString() };
  assert.equal(lockOrfao(velho, agora).orfao, true);
});

test("lockOrfao: startedAt ilegível → idade infinita (órfão, nunca lock eterno)", () => {
  const v = lockOrfao({ pid: 1, startedAt: "nao-e-data" }, Date.now());
  assert.equal(v.orfao, true);
  assert.equal(v.idadeMs, Number.POSITIVE_INFINITY);
});

// ── classificação de falha de script (EXECUCAO_CLI) ──────────────────────────

test("classificarFalhaScript: exit 0 é verde", () => {
  assert.deepEqual(classificarFalhaScript("qualquer coisa", 0), { tipo: "verde" });
});

test("classificarFalhaScript: saída que só tem o artefato de TTY → reexecutar (não é falha real)", () => {
  const v = classificarFalhaScript("stdout is not a tty\n", 1);
  assert.equal(v.tipo, "artefato-tty");
  assert.equal(v.reexecutar, true);
});

test("classificarFalhaScript: falha REAL com saída de teste → não é mascarada pelo artefato", () => {
  const saida = "stdout is not a tty\n✖ 3 testes falharam\n# fail 3\n";
  assert.equal(classificarFalhaScript(saida, 1).tipo, "falha-com-resultado");
});

test("classificarFalhaScript: exit 1 sem artefato e sem resultado → falha", () => {
  assert.equal(classificarFalhaScript("Error: algo quebrou", 1).tipo, "falha");
});

// ── PATCH-GATE-BASE-FALLBACK-20261010 — base do lote a partir do marker ──────

test("decidirBaseDoLote: marker resolvível e ancestral → USA o marker", () => {
  const d = decidirBaseDoLote({ markerExiste: true, shaResolvivel: true, shaAncestral: true });
  assert.equal(d.usarMarker, true);
  assert.equal(d.motivo, null);
});

test("decidirBaseDoLote: marker IRRESOLVÍVEL cai no fallback (não é mais falha dura)", () => {
  const d = decidirBaseDoLote({ markerExiste: true, shaResolvivel: false, shaAncestral: false });
  assert.equal(d.usarMarker, false);
  assert.match(d.motivo, /irresolvível/);
});

test("decidirBaseDoLote: marker não-ancestral cai no fallback (squash-merge)", () => {
  const d = decidirBaseDoLote({ markerExiste: true, shaResolvivel: true, shaAncestral: false });
  assert.equal(d.usarMarker, false);
  assert.match(d.motivo, /não-ancestral/);
});

test("decidirBaseDoLote: sem marker → fallback declarado", () => {
  const d = decidirBaseDoLote({ markerExiste: false, shaResolvivel: false, shaAncestral: false });
  assert.equal(d.usarMarker, false);
  assert.match(d.motivo, /sem GATE-BASE anterior/);
});
