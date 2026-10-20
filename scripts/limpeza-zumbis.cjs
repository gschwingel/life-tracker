#!/usr/bin/env node
// scripts/limpeza-zumbis.cjs — FRAME-SKILL-LIMPEZA-SESSAO-20261004
// Remediação dos zumbis detectados pelo fila-diagnostico.cjs: conserta o que é
// SEGURO por construção e REPORTA o que exige julgamento. Consumido pela skill
// limpeza-sessao (ritual de fim de sessão).
//
// AGE (seguro por construção — reversível ou já-órfão):
//   - cancela runs zumbis/fantasma apontadas pelo diagnóstico (fila re-entrante:
//     rodada nova assume; nada de trabalho real é perdido);
//   - inicia Docker Desktop se engine inacessível;
//   - mata Runner.Worker órfãos SOMENTE se nenhum runner estiver busy.
//
// SÓ REPORTA (julgamento humano/autor):
//   - PRs DIRTY de autores; worktrees com trabalho não-commitado (nunca destrói).
//
// Uso: node scripts/limpeza-zumbis.cjs [--dry-run] [--json]
// Exit 0 sempre (remediação best-effort com relatório; nunca falha a sessão).
"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const JSON_OUT = process.argv.includes("--json");

function gh(args) {
  try {
    return { ok: true, out: execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim() };
  } catch (e) {
    return { ok: false, err: String(e.stderr || e.message).trim().split("\n")[0] };
  }
}

function agiu(acao, detalhe) {
  const linha = DRY_RUN ? `[DRY-RUN] ${acao}: ${detalhe}` : `${acao}: ${detalhe}`;
  console.log(linha);
  return linha;
}

// ── 1. Diagnóstico (fonte única — fila-diagnostico.cjs --json) ───────────────
function diagnosticar() {
  const r = execFileSync("node", [path.join(__dirname, "fila-diagnostico.cjs"), "--json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(r);
}

// ── 2. Remediações seguras ───────────────────────────────────────────────────
const acoes = [];

function cancelarRun(id, motivo) {
  if (DRY_RUN) { acoes.push(agiu("cancelaria run", `#${id} — ${motivo}`)); return; }
  const r = gh(["run", "cancel", String(id), "--repo", diag.repo]);
  acoes.push(agiu(r.ok ? "cancelada run" : "FALHOU cancelar run", `#${id} — ${motivo}${r.ok ? "" : " (" + r.err + ")"}`));
}

function cancelarZumbis(diag) {
  for (const id of diag.runs_suspeitas || []) {
    cancelarRun(id, "zumbi/fantasma apontado pelo diagnóstico");
  }
}

function iniciarDocker(diag) {
  if (diag.docker_engine) return;
  if (DRY_RUN) { acoes.push(agiu("iniciaria Docker Desktop", "engine inacessível — merge-gate depende do postgres de teste")); return; }
  try {
    execFileSync("cmd", ["/c", "start", "", "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"], { stdio: "ignore" });
    acoes.push(agiu("iniciado Docker Desktop", "engine subindo — aguardar ~30s antes de despachar gates"));
  } catch (e) {
    acoes.push(agiu("FALHOU iniciar Docker Desktop", String(e.message).split("\n")[0]));
  }
}

function matarWorkersOrfaos(diag) {
  const algumBusy = (diag.runners || []).some((r) => r.includes("(busy)"));
  if (algumBusy) return; // workers podem ser legítimos — só limpa com runners ociosos
  if (DRY_RUN) return;
  try {
    const out = execFileSync("tasklist", { encoding: "utf8" });
    const workers = (out.match(/Runner\.Worker\.exe/g) || []).length;
    if (workers === 0) return;
    execFileSync("taskkill", ["/IM", "Runner.Worker.exe", "/F"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    acoes.push(agiu("mortos Runner.Worker órfãos", workers + " processo(s) — nenhum runner busy, jobs mortos"));
  } catch {
    // nada a matar ou acesso negado — advisory
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
let diag;
try {
  diag = diagnosticar();
} catch (e) {
  console.error(`limpeza-zumbis: diagnostico falhou — ${String(e.message).split("\n")[0]}`);
  process.exit(2);
}

cancelarZumbis(diag);
iniciarDocker(diag);
matarWorkersOrfaos(diag);

const pendencias = {
  prs_abertos: diag.prs.length,
};

if (JSON_OUT) {
  console.log(JSON.stringify({ acoes, pendencias }, null, 2));
} else {
  console.log(`=== AÇÕES (${acoes.length}) ===`);
  for (const a of acoes) console.log("  " + a);
  console.log(`=== PENDÊNCIAS DE JULGAMENTO ===`);
  console.log(`  PRs abertos: ${pendencias.prs_abertos}`);
}
process.exit(0);
