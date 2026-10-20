"use strict";
// Suite: fila-checks — lib compartilhada fila-drain × fila-diagnostico.
// Regressão da drenagem de 2026-10-06: no regime EAGER o rollup NÃO expõe o
// required `merge-gate` (nasce autorreportado no merge-ref, E5) — o único check
// do gate visível é o nativo `merge-gate-runner`. Classificar pelo nome exato
// marcava TODO PR pousável como "re-despachar merge-gate" (6 falsos no dia).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { REQUIRED, nomeDe, entradasGate, estadoGate, resumoChecks, classificarPR } = require("../lib/fila-checks.cjs");

const checkRun = (name, conclusion, status = "COMPLETED") => ({ __typename: "CheckRun", name, status, conclusion });
const statusCtx = (context, state) => ({ __typename: "StatusContext", context, state });
const leves = () => [checkRun("pr-gate", "SUCCESS"), checkRun("gates-grafo", "SUCCESS"), checkRun("manifest-frescor", "SUCCESS")];

// ── A regressão que motivou a lib ────────────────────────────────────────────
test("REGRESSÃO 2026-10-06: eager (só merge-gate-runner no rollup) + mss UNSTABLE = POUSAVEL", () => {
  const pr = {
    mergeStateStatus: "UNSTABLE",
    statusCheckRollup: [...leves(), checkRun("merge-gate-runner", "SUCCESS"), checkRun("docs-einv-frescor", "SUCCESS"), checkRun("alerta", "SKIPPED")],
  };
  const v = classificarPR(pr);
  assert.equal(v.classe, "POUSAVEL");
});

// ── Família do gate: formas e nomes ──────────────────────────────────────────
test("nomeDe: CheckRun (name) e StatusContext (context)", () => {
  assert.equal(nomeDe(checkRun("Merge-Gate-Runner", "SUCCESS")), "merge-gate-runner");
  assert.equal(nomeDe(statusCtx("merge-gate", "SUCCESS")), "merge-gate");
  assert.equal(nomeDe({}), "");
});

test("entradasGate casa os dois nomes vivos e as duas formas", () => {
  const entradas = entradasGate([checkRun("merge-gate-runner", "SUCCESS"), statusCtx("merge-gate", "PENDING"), checkRun("pr-gate", "SUCCESS")]);
  assert.equal(entradas.length, 2);
});

test("família ausente = AUSENTE", () => {
  assert.equal(estadoGate(leves()), "AUSENTE");
});

test("família: StatusContext clássico SUCCESS (path de despacho, E5-v2) = SUCCESS", () => {
  assert.equal(estadoGate([...leves(), statusCtx("merge-gate", "SUCCESS")]), "SUCCESS");
});

test("família: pendência domina sucesso antigo (runner velho + despacho em curso)", () => {
  assert.equal(estadoGate([checkRun("merge-gate-runner", "SUCCESS"), checkRun("merge-gate", null, "IN_PROGRESS")]), "PENDING");
});

test("família: falha antiga + sucesso novo = FAILURE (conservador — nunca verde falso)", () => {
  assert.equal(estadoGate([checkRun("merge-gate-runner", "FAILURE"), statusCtx("merge-gate", "SUCCESS")]), "FAILURE");
});

test("família: SKIPPED nunca é verde (runbook: nunca merge em skipped)", () => {
  assert.equal(estadoGate([checkRun("merge-gate-runner", "SKIPPED")]), "FAILURE");
});

// ── resumoChecks ─────────────────────────────────────────────────────────────
test("resumoChecks agrega o gate numa linha merge-gate e normaliza os required", () => {
  const r = resumoChecks([...leves(), checkRun("merge-gate-runner", "SUCCESS"), checkRun("docs-einv-frescor", "FAILURE")]);
  assert.deepEqual(
    r.map((c) => c.nome + ":" + c.estado),
    ["merge-gate:SUCCESS", "pr-gate:SUCCESS", "gates-grafo:SUCCESS", "manifest-frescor:SUCCESS"],
  );
});

test("resumoChecks: required ausente = AUSENTE", () => {
  const r = resumoChecks([checkRun("pr-gate", "SUCCESS")]);
  assert.equal(r.find((c) => c.nome === "merge-gate").estado, "AUSENTE");
  assert.equal(r.find((c) => c.nome === "manifest-frescor").estado, "AUSENTE");
});

// ── classificarPR: matriz de classes ─────────────────────────────────────────
test("DIRTY = DIRTY (nunca automático)", () => {
  assert.equal(classificarPR({ mergeStateStatus: "DIRTY", statusCheckRollup: leves() }).classe, "DIRTY");
});

test("gate AUSENTE de verdade + BLOCKED + leves verdes = REDESPACHAR_GATE (playbook C)", () => {
  const v = classificarPR({ mergeStateStatus: "BLOCKED", statusCheckRollup: leves() });
  assert.equal(v.classe, "REDESPACHAR_GATE");
});

test("BLOCKED + gate verde = ANOMALIA_D (playbook D)", () => {
  const v = classificarPR({ mergeStateStatus: "BLOCKED", statusCheckRollup: [...leves(), statusCtx("merge-gate", "SUCCESS")] });
  assert.equal(v.classe, "ANOMALIA_D");
});

test("UNSTABLE com non-required vermelho = POUSAVEL com extras", () => {
  const v = classificarPR({
    mergeStateStatus: "UNSTABLE",
    statusCheckRollup: [...leves(), checkRun("merge-gate-runner", "SUCCESS"), checkRun("docs-einv-frescor", "FAILURE")],
  });
  assert.equal(v.classe, "POUSAVEL");
  assert.deepEqual(v.extras, ["docs-einv-frescor"]);
});

test("BEHIND com required verdes = POUSAVEL (strict=false)", () => {
  const v = classificarPR({ mergeStateStatus: "BEHIND", statusCheckRollup: [...leves(), checkRun("merge-gate-runner", "SUCCESS")] });
  assert.equal(v.classe, "POUSAVEL");
});

test("CLEAN = POUSAVEL mesmo sem entrada de gate no rollup (mss manda)", () => {
  const v = classificarPR({ mergeStateStatus: "CLEAN", statusCheckRollup: leves() });
  assert.equal(v.classe, "POUSAVEL");
});

test("required não-gate vermelho = VERMELHO", () => {
  const v = classificarPR({ mergeStateStatus: "BLOCKED", statusCheckRollup: [...leves().slice(1), checkRun("pr-gate", "FAILURE")] });
  assert.equal(v.classe, "VERMELHO");
  assert.ok(v.vermelhos.includes("pr-gate"));
});

test("gate FAILURE = VERMELHO citando merge-gate", () => {
  const v = classificarPR({ mergeStateStatus: "BLOCKED", statusCheckRollup: [...leves(), checkRun("merge-gate-runner", "FAILURE")] });
  assert.equal(v.classe, "VERMELHO");
  assert.ok(v.vermelhos.includes("merge-gate"));
});

test("check em curso = PENDENTE (inclui StatusContext PENDING)", () => {
  const v = classificarPR({ mergeStateStatus: "BLOCKED", statusCheckRollup: [checkRun("pr-gate", null, "IN_PROGRESS"), statusCtx("merge-gate", "PENDING")] });
  assert.equal(v.classe, "PENDENTE");
  assert.ok(v.pendentes.includes("pr-gate") && v.pendentes.includes("merge-gate"));
});

test("StatusContext EXPECTED conta como pendente (required não reportou ainda)", () => {
  const v = classificarPR({ mergeStateStatus: "BLOCKED", statusCheckRollup: [statusCtx("pr-gate", "EXPECTED")] });
  assert.equal(v.classe, "PENDENTE");
});

test("mss fora do conjunto conhecido (HAS_HOOKS) = AVALIAR", () => {
  const v = classificarPR({ mergeStateStatus: "HAS_HOOKS", statusCheckRollup: [...leves(), checkRun("merge-gate-runner", "SUCCESS")] });
  assert.equal(v.classe, "AVALIAR");
});

test("mss UNSTABLE com required ausentes do rollup = POUSAVEL (rollup é diagnóstico; mss é o veredito da protection)", () => {
  // Mesma classe de visibilidade do `merge-gate` eager: checks podem existir fora
  // do rollup (merge-ref/associação). Se um required estivesse FALTANDO de
  // verdade, o GitHub devolveria BLOCKED — nunca UNSTABLE.
  const v = classificarPR({ mergeStateStatus: "UNSTABLE", statusCheckRollup: [checkRun("merge-gate-runner", "SUCCESS")] });
  assert.equal(v.classe, "POUSAVEL");
});

test("BLOCKED com só o runner verde no rollup = ANOMALIA_D (estado estranho → playbook D)", () => {
  const v = classificarPR({ mergeStateStatus: "BLOCKED", statusCheckRollup: [checkRun("merge-gate-runner", "SUCCESS")] });
  assert.equal(v.classe, "ANOMALIA_D");
});

// ── Contrato ─────────────────────────────────────────────────────────────────
test("REQUIRED = protection de main vigente (API, 2026-10-06; strict=false)", () => {
  assert.deepEqual(REQUIRED, ["merge-gate", "pr-gate", "gates-grafo", "manifest-frescor"]);
});

test("fila-drain não executa main() no require (guarda require.main)", () => {
  delete require.cache[require.resolve("../fila-drain.cjs")];
  require("../fila-drain.cjs"); // sem guarda, chamaria gh e sairia do processo
  assert.ok(true);
});
