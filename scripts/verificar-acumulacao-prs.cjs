#!/usr/bin/env node
/**
 * scripts/verificar-acumulacao-prs.cjs
 * FRAME-FIM-FILA-EAGER-20261006 (E4) — watchdog de ACUMULACAO de PRs.
 *
 * POR QUE ESTE SCRIPT EXISTE
 * A fila indiana foi aposentada (plano aprovado por Igor, 2026-10-05/06): o
 * regime normal e gates eager + auto-merge — cada PR cuida de si. O modo de
 * falha que SOBROU e a ACUMULACAO SILENCIOSA: PR aberto que ninguem olha
 * (autor sumiu, --auto esquecido, leves mortas, runner local em cima de um
 * zumbi). Sem orquestrador central, ninguem percebe — o mesmo "silencio que
 * parece saude" do jobs-vivacidade, agora no nivel de PR.
 *
 * O QUE COBRE (E5 do frame: thresholds calibraveis)
 * - Alvo A (PR preso): PR aberto ha mais de PR_IDADE_MIN (default 90) minutos
 *   SEM NENHUM check-run ativo (queued/in_progress) no head — cobre "leves
 *   morreram", "nobody working" e "verde mas nao pousou".
 * - Alvo B (fila de runner): run `queued` ha mais de RUN_QUEUED_MIN (default
 *   15) minutos — runner local offline ou lane travada (o FIFO so anda com
 *   runner vivo).
 * - Alvo C (zumbi): run `in_progress` ha mais de RUN_VIVA_MIN (default 45)
 *   minutos — zumbi segurando lane (incidente 2026-10-06: Gates de Grafo
 *   47min prendeu os leves de 3+ PRs por 12h).
 *
 * CONTRATO
 * - READ-ONLY: nunca conserta, nunca cancela, nunca dispara workflow.
 *   Denuncia (exit 1 + linha por alvo no stdout); o drenador (skill
 *   fila-drenagem) e quem age.
 * - Sem dependencia externa: fetch global do Node 20+.
 * - PRs com label `veredito-pendente`... removido do sistema (2026-10-06);
 *   sem excecoes por PR: PR preso e PR preso.
 *
 * USO
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/verificar-acumulacao-prs.cjs
 *   ... --pr-idade-min 90 --run-queued-min 15 --run-viva-min 45
 *
 * Roda em CI pelo .github/workflows/watchdog-acumulacao.yml (cron a cada 30 min,
 * ubuntu-latest — observador EXTERNO de proposito: o alvo principal e o
 * runner local, que nao enxerga a propria ausencia).
 */
"use strict";

const API = "https://api.github.com";

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
}

const PR_IDADE_MIN = arg("--pr-idade-min", 90);
const RUN_QUEUED_MIN = arg("--run-queued-min", 15);
const RUN_VIVA_MIN = arg("--run-viva-min", 45);

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const REPO = process.env.GITHUB_REPOSITORY || "";

async function ghGet(path) {
  const r = await fetch(API + path, {
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " em GET " + path);
  return r.json();
}

function minutosDesde(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

async function main() {
  if (!TOKEN || !REPO) {
    console.error("[FALHA] GITHUB_TOKEN/GITHUB_REPOSITORY ausentes — falha loud, nunca silencio");
    process.exit(1);
  }
  const agora = [];
  let falhou = false;

  // Alvo A — PR preso (aberto, velho, zero check-run ativo no head)
  const prs = await ghGet("/repos/" + REPO + "/pulls?state=open&per_page=50&sort=created&direction=asc");
  for (const pr of prs) {
    const idade = minutosDesde(pr.created_at);
    const checks = await ghGet("/repos/" + REPO + "/commits/" + pr.head.sha + "/check-runs?per_page=100");
    const ativos = (checks.check_runs || []).filter(
      (c) => c.status === "queued" || c.status === "in_progress"
    );
    if (idade > PR_IDADE_MIN && ativos.length === 0) {
      falhou = true;
      agora.push(
        "[ALVO-A] PR #" + pr.number + " aberto ha " + idade +
        "min sem NENHUM check-run ativo no head (" + pr.head.ref + ") — acumulacao: " + pr.html_url
      );
    }
  }

  // Alvos B e C — runs queued idosas / in_progress zumbis
  const runs = await ghGet("/repos/" + REPO + "/actions/runs?per_page=50");
  for (const run of runs.workflow_runs || []) {
    const min = minutosDesde(run.created_at);
    if (run.status === "queued" && min > RUN_QUEUED_MIN) {
      falhou = true;
      agora.push(
        "[ALVO-B] run " + run.id + " queued ha " + min + "min (" + run.name +
        " / " + run.head_branch + ") — runner offline ou lane travada: " + run.html_url
      );
    }
    if (run.status === "in_progress" && min > RUN_VIVA_MIN) {
      falhou = true;
      agora.push(
        "[ALVO-C] run " + run.id + " in_progress ha " + min + "min (" + run.name +
        " / " + run.head_branch + ") — zumbi segurando lane: " + run.html_url
      );
    }
  }

  if (falhou) {
    console.log("=== WATCHDOG ACUMULACAO — DISPARADO (" + agora.length + " alvo(s)) ===");
    for (const linha of agora) console.log(linha);
    process.exit(1);
  }
  console.log(
    "OK: " + prs.length + " PR(s) aberto(s), nenhum preso (idade>" + PR_IDADE_MIN +
    "min sem run ativa); nenhuma run queued>" + RUN_QUEUED_MIN + "min nem in_progress>" +
    RUN_VIVA_MIN + "min"
  );
}

main().catch((e) => {
  console.error("[FALHA] " + (e && e.message ? e.message : e));
  process.exit(1);
});
