#!/usr/bin/env node
// scripts/fila-diagnostico.cjs — FRAME-FILA-DRENAGEM-SKILL-20261002
// Raio-X da fila de merge do LilaV2: PRs abertos + classe de bloqueio de cada um,
// estado dos workflows de orquestração, runs travadas e saúde dos runners.
// Read-only. Sem dependências além do `gh` CLI autenticado.
// Uso: node scripts/fila-diagnostico.cjs [--json]
// Exit 0 sempre (é diagnóstico; falha de infra é REPORTADA, não lançada).
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { analisarBashWsl } = require("./lib/bash-wsl-detector.cjs");
// Classificação de PR COMPARTILHADA com o fila-drain (mss-first + família do gate).
// O rollup eager não expõe o required `merge-gate` (nasce autorreportado no
// merge-ref, E5) — a leitura antiga por nome exato degradava todo PR pousável.
const { REQUIRED, nomeDe, estadoGate, classificarPR: classificarFila } = require("./lib/fila-checks.cjs");

const REPO = process.env.GH_REPO || repoFromEnv();
const JSON_OUT = process.argv.includes("--json");
const PR_BUDGET_MIN = 60; // run in_progress acima disso = suspeita de zumbi
// Raízes dos runners locais (raio-X roda na máquina do dono): o .env de cada um
// protege o `shell: bash` do host contra a resolução WSL (BASH-WSL abaixo).
// PATCH-RUNNER-DUP-LISTENER-20261012: a lista estava ERRADA — media a lane
// `lila-local-fila` (REMOVIDA em 2026-10-12; ociosa desde a aposentadoria da fila)
// e ignorava `actions-runner-light2` (online desde 2026-10-06): o raio-X dizia
// "3/3 protegidos" contando a fila e deixando a light2 fora da proteção.
const RUNNER_ROOTS = (process.env.LILA_RUNNER_ROOTS ||
  "C:/actions-runner,C:/actions-runner-light,C:/actions-runner-light2").split(",");

function repoFromEnv() {
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const m = out.match(/github\.com[/:](.+?)(?:\.git)?$/);
    if (m) return m[1];
  } catch { /* fora de repo: usa gh default */ }
  return "igorlopes000/LilaV2";
}

function gh(args) {
  try {
    return { ok: true, out: execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim() };
  } catch (e) {
    return { ok: false, err: String(e.stderr || e.message).trim().split("\n")[0] };
  }
}
const jq = (q, ...rest) => gh(["api", ...rest, "--jq", q]);

function horasAte(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

// ── 1. Workflows de orquestração ─────────────────────────────────────────────
function diagnosticoWorkflows() {
  const achados = [];
  const wf = jq('.workflows[] | select(.path == ".github/workflows/fila-merge.yml") | {id, state, name}', `repos/${REPO}/actions/workflows`);
  let fila = null;
  if (wf.ok) {
    try { fila = JSON.parse(wf.out); } catch { fila = null; }
  }
  if (!fila) achados.push("Fila Merge: workflow não encontrado (fila inexistente)");
  else if (fila.state !== "active") achados.push(`Fila Merge: workflow '${fila.state}' — fila MORTA (reativar: PUT /actions/workflows/${fila.id}/enable)`);
  return { fila, achados };
}

// ── 2. Runs travadas (zumbis) ────────────────────────────────────────────────
function diagnosticoRuns() {
  const achados = [];
  const suspeitas = [];
  for (const status of ["in_progress", "queued", "pending"]) {
    const r = gh(["run", "list", "--repo", REPO, "--status", status, "--limit", "20",
      "--json", "databaseId,workflowName,createdAt,headBranch"]);
    if (!r.ok) { achados.push(`runs/${status}: ilegível (${r.err})`); continue; }
    let runs;
    try { runs = JSON.parse(r.out); } catch { continue; }
    for (const run of runs) {
      const h = horasAte(run.createdAt);
      if (run.workflowName === "Fila Merge" && status === "in_progress" && h > PR_BUDGET_MIN) {
        achados.push(`ZUMBI: Fila Merge #${run.databaseId} em_progress há ${h.toFixed(1)}h (orçamento ~${PR_BUDGET_MIN}min) — cancelar`);
        suspeitas.push(run.databaseId);
      } else if (h > 2) {
        achados.push(`run ${run.workflowName} #${run.databaseId} '${status}' há ${h.toFixed(1)}h — investigar`);
        suspeitas.push(run.databaseId);
      }
    }
  }
  return { achados, suspeitas };
}

// ── 3. Runners ───────────────────────────────────────────────────────────────
function diagnosticoRunners() {
  const achados = [];
  const r = jq('.runners[] | {name, status, busy}', `repos/${REPO}/actions/runners`);
  let runners = [];
  if (r.ok && r.out) {
    // gh --jq em lista devolve NDJSON (um objeto por linha), não um array.
    try { runners = r.out.split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
    catch (e) { achados.push(`runners ilegíveis (JSON): ${e.message}`); }
  } else if (!r.ok) {
    achados.push(`runners ilegíveis: ${r.err} — verifique permissão admin:read do gh (diagnóstico fica cego para esta camada)`);
  }
  for (const rn of runners) {
    if (rn.status !== "online") achados.push(`runner '${rn.name}' ${rn.status} — jobs da lane dele não executam`);
  }
  if (!runners.some((x) => x.name === "lila-local-light" && x.status === "online"))
    achados.push("runner light offline/ausente — leves e fila parados (dependência crítica)");
  if (!runners.some((x) => x.name === "lila-local" && x.status === "online"))
    achados.push("runner heavy offline/ausente — merge-gate não executa");
  return { runners, achados };
}

// ── 3b. Docker engine (dependência dura do merge-gate: postgres de teste) ────
// PATCH-FILA-DRENAGEM-EOL-20261004: a sonda antiga usava `docker version
// --format '{{.ServerVersion}}'` — campo inexistente no tipo raiz do comando
// (o correto seria {{.Server.Version}}); no CLI 29.x o erro de template vira
// exit≠0 e o raio-X classificava engine VIVO como morto (falso negativo do
// incidente 2026-10-04: `docker info --format '{{.ServerVersion}}'` respondia
// enquanto o raio-X acusava INACESSÍVEL). Sonda correta via `docker info` +
// sonda dupla com janela de 2s contra oscilação real do daemon ao subir.
const DOCKER_SONDAS = 2;
const DOCKER_JANELA_MS = 2000;

function dockerEngineSonda() {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function diagnosticoDocker() {
  const achados = [];
  let engine = dockerEngineSonda();
  if (!engine) {
    for (let i = 1; i < DOCKER_SONDAS && !engine; i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, DOCKER_JANELA_MS);
      engine = dockerEngineSonda();
    }
  }
  if (!engine) achados.push("Docker engine inacessível (2 sondas) — merge-gate falha no postgres de teste; iniciar Docker Desktop e re-executar o gate");
  return { engine, achados };
}

// ── 3e. Workspace do runner — EOL canônico (PATCH-FILA-DRENAGEM-EOL-20261004) ─
// O golden byte-a-byte (e qualquer comparação disco×fixture) lê arquivos com
// readFileSync: um checkout com smudge pré-#1047 nunca re-smudged acumula
// w/crlf e quebra o gate com falha críptica (incidente 2026-10-04, PR #1082:
// 3377 arquivos CRLF → golden 8/11 no runner, 11/11 local). Detector: contagem
// w/crlf no checkout persistente do runner; re-smudge canônico sugerido.
const RUNNER_WS = process.env.LILA_RUNNER_WS || "C:/actions-runner/_work/LilaV2/LilaV2";

function diagnosticoRunnerWsEol() {
  const achados = [];
  let crlf = null;
  try {
    const out = execFileSync("git", ["-C", RUNNER_WS, "ls-files", "--eol"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    crlf = out.split("\n").filter((l) => /^i\/\S+\s+w\/crlf\b/.test(l)).length;
  } catch {
    // ws do runner ausente/fora desta máquina: detector fica mudo (roda localmente no dono)
  }
  if (crlf !== null && crlf > 0)
    achados.push(
      `workspace do runner com ${crlf} arquivo(s) CRLF — gate de byte-a-byte falha no runner e passa local (re-smudge: git -C ${RUNNER_WS} checkout-index -a -f && git -C ${RUNNER_WS} reset --hard HEAD)`,
    );
  return { crlf, achados };
}

// ── 3f. Resolução de `bash` no HOST (BASH-WSL — PATCH-FILA-DRENAGEM-WSL-20261004) ─
// Incidente 2026-10-04: listener reiniciado como serviço num PATH de máquina sem
// bash do Git → `shell: bash` resolve o launcher WSL do System32, que não roda
// como LocalSystem — TODOS os rounds da fila morriam no spawn do shell. O PATH
// lido aqui é o de MÁQUINA (registro), não o da sessão: é o que o serviço herda.
// A proteção é o `.env` na raiz de cada runner (vale após o restart do serviço).
function diagnosticoBashWsl() {
  let pathEntries = [];
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "/v", "Path"],
      { encoding: "utf8" },
    );
    const m = out.match(/Path\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)\r?\n/i);
    if (m) pathEntries = m[1].split(";");
  } catch {
    // sem registro (fora de Windows): detector mudo — nunca falso positivo
  }
  const runnerEnvs = RUNNER_ROOTS.map((root) => {
    try {
      const envPath = path.join(root, ".env");
      return fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    } catch {
      return "";
    }
  });
  return analisarBashWsl({ pathEntries, fsExists: (p) => fs.existsSync(p), runnerEnvs });
}

// ── 3c. Kill-switch da fila (FILA_PAUSADA — E8) ──────────────────────────────
function diagnosticoKillSwitch() {
  const achados = [];
  const r = gh(["variable", "get", "FILA_PAUSADA", "--repo", REPO]);
  const pausada = r.ok && r.out.trim() === "true";
  if (pausada) achados.push("FILA_PAUSADA=true — fila congelada por kill-switch (descongelar: gh variable set FILA_PAUSADA --body false)");
  return { pausada, achados };
}

// ── 3c-b. Gerados da main (manifest/module-map/docs) — stale neles deixa a fila
// inteira refém (drenagem 2026-10-04/05: manifest esquecido no #1095 + module-map
// no #1104 + golden do #1107). Indisponível (dep ausente) = honesto, nunca falso verde.
//
// 2026-10-07 (#1201, drenagem): o raio-X mediu o CHECKOUT LOCAL defasado e
// acusou "docs_derivados STALE" numa main que acabara de ficar fresca — quase
// abriu regen redundante. Medir checkout ≠ medir a main: fetch + comparação;
// divergente → worktree temporário desanexado em origin/main (NODE_PATH aponta
// os node_modules daqui; LFS smudge vem do cache local). Worktree indisponível
// → mede local COM rótulo honesto do desvio. Sempre registra o que mediu
// (estado._medido_em) — E-INV-01: asserção rastreável à base medida.
function classificarFrescor(nome, saida, erroLinha) {
  const s = String(saida || "");
  if (/"ok":\s*true|docs derivados: frescos|✅ module-map/.test(s)) return "fresco";
  if (/STALE|❌ module-map/.test(s)) return "STALE";
  // NUNCA adivinhar a causa: o rótulo "dep ausente" mentiu em 2026-10-07
  // (manifest falhava por outro motivo mesmo com js-yaml instalado). Mostra a
  // primeira linha do erro real — diagnóstico rastreável, chute zero.
  return erroLinha ? `indisponível (${erroLinha})` : "indeterminado";
}

const primeiraLinhaErro = (e) =>
  String(e && (e.stderr || e.stdout || e.message) || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 110) || "";

const WT_FRESCOR = path.join(require("os").tmpdir(), "fila-diagnostico-frescor");

/** Resolve onde medir: local se for a própria main; senão worktree em origin/main.
 *  → { cwd, envExtra, rotulo, temporario } — nunca lança (fallback honesto). */
function resolverBaseMedicao() {
  const fallback = (rotulo) => ({ cwd: ".", envExtra: {}, rotulo, temporario: false });
  try {
    try { execFileSync("git", ["fetch", "origin", "main"], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }); } catch { /* offline: usa refs locais */ }
    const local = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const remota = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
    if (local === remota) return fallback(`origin/main@${remota.slice(0, 8)}`);
    try {
      fs.rmSync(WT_FRESCOR, { recursive: true, force: true });
      execFileSync("git", ["worktree", "add", "--detach", WT_FRESCOR, remota], { encoding: "utf8", timeout: 300000, stdio: ["ignore", "pipe", "pipe"] });
      return {
        cwd: WT_FRESCOR,
        envExtra: { NODE_PATH: path.resolve(__dirname, "..", "node_modules") },
        rotulo: `origin/main@${remota.slice(0, 8)} (checkout local ${local.slice(0, 8)} defasado — medição na main real)`,
        temporario: true,
      };
    } catch {
      return fallback(`checkout local ${local.slice(0, 8)} (≠ origin/main ${remota.slice(0, 8)}) — leitura PODE NÃO refletir a main; validar em worktree limpo antes de agir`);
    }
  } catch {
    return fallback("sem git/refs — medindo diretório corrente");
  }
}

function diagnosticoGerados() {
  const achados = [];
  const estado = {};
  const base = resolverBaseMedicao();
  estado._medido_em = base.rotulo;
  const envRodada = { ...process.env, ...(base.envExtra || {}) };
  const checks = [
    ["manifest", "scripts/verificar-frescor-manifest.cjs"],
    ["module_map", "scripts/verificar-frescor-module-map.cjs"],
    ["docs_derivados", "scripts/verificar-frescor-docs.cjs"],
  ];
  try {
    for (const [nome, script] of checks) {
      try {
        const r = execFileSync("node", [script], { cwd: base.cwd, env: envRodada, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
        estado[nome] = classificarFrescor(nome, r);
      } catch (e) {
        const saida = `${(e.stdout || "")}${(e.stderr || "")}`;
        estado[nome] = classificarFrescor(nome, saida, primeiraLinhaErro(e));
      }
      if (estado[nome] === "STALE") achados.push(`${nome} STALE na main — fila inteira refém (regen canônico + PR dedicado chore(indices))`);
    }
  } finally {
    if (base.temporario) {
      try { fs.rmSync(WT_FRESCOR, { recursive: true, force: true }); } catch { /* já limpo */ }
      try { execFileSync("git", ["worktree", "prune"], { encoding: "utf8", timeout: 60000, stdio: "ignore" }); } catch { /* cosmético */ }
    }
  }
  return { estado, achados };
}


// ── 3d. Processos órfãos locais (listeners duplicados, workers de jobs mortos) ──
// PATCH-RUNNER-DUP-LISTENER-20261012: o achado não só CONTA, ele NOMEIA o
// excedente. O excedente é um listener em SESSÃO `Console` (processo do usuário)
// duplicando um runner que JÁ tem serviço — a duplicata briga pelo loop e quem
// perde loga "A session for this runner already exists" no `_diag` (runner
// alterna online/offline). Causa medida 2026-10-12: tarefas agendadas
// `\LilaRunnerFila` e `\LilaRunnerLight` subindo `run.cmd` ALÉM do serviço.
// O fechamento continua HUMANO (matriz: nunca matar runner busy) — o script
// entrega o PID e a janela segura exigida.
function listenersEmConsole() {
  const out = execFileSync("tasklist", ["/fi", "IMAGENAME eq Runner.Listener.exe", "/fo", "csv", "/nh"], {
    encoding: "utf8",
  });
  const pids = [];
  for (const linha of out.split(/\r?\n/)) {
    if (!linha.includes("Runner.Listener.exe")) continue;
    const cols = linha.split('","').map((c) => c.replace(/^"|"$/g, ""));
    if (/console/i.test(cols[2] ?? "")) pids.push(cols[1] ?? "?");
  }
  return pids;
}

function diagnosticoProcessos(runners) {
  const achados = [];
  try {
    const out = execFileSync("tasklist", { encoding: "utf8" });
    const listeners = (out.match(/Runner\.Listener\.exe/g) || []).length;
    const workers = (out.match(/Runner\.Worker\.exe/g) || []).length;
    // legítimo: 1 listener por runner registrado; alerta só se EXCEDER
    const esperados = runners.runners.length || null;
    if (esperados && listeners > esperados) {
      let excedente = "";
      try {
        const pids = listenersEmConsole();
        if (pids.length > 0) excedente = " — excedente em sessão Console: PID " + pids.join(", ");
      } catch {
        // tasklist csv indisponível: mantém o achado sem os PIDs
      }
      achados.push(
        listeners +
          " Runner.Listener para " +
          esperados +
          " runners registrados" +
          excedente +
          " (duplicata brigando pelo loop: checar tarefa agendada que sobe `run.cmd` além do serviço; fechar o excedente em modo Console com JANELA SEGURA — 0 runner busy e 0 Runner.Worker)",
      );
    }
    if (workers > 1 && !runners.runners.some((r) => r.busy)) achados.push(workers + " Runner.Worker com nenhum runner busy (órfãos de jobs mortos)");
  } catch {
    // tasklist indisponível: advisory silencioso (fora de Windows)
  }
  return { achados };
}

// ── 4. PRs abertos + classe de bloqueio ──────────────────────────────────────
function classificarPR(pr) {
  const v = classificarFila(pr);
  switch (v.classe) {
    case "POUSAVEL":
      return "PRONTO — mergear agora" + (v.extras && v.extras.length ? " (non-required vermelho não bloqueia: " + v.extras.join(", ") + ")" : "");
    case "DIRTY":
      return "DIRTY — resync (merge main + regen + push)";
    case "REDESPACHAR_GATE":
      return "GATE AUSENTE com leves verdes — despachar merge-gate";
    case "ANOMALIA_D":
      return "ANOMALIA: required verde + BLOCKED — tentar merge/re-despacho/close-reopen";
    case "PENDENTE":
      return "AGUARDANDO: " + (v.pendentes || []).join(", ");
    case "VERMELHO":
      return "VERMELHO: " + (v.vermelhos && v.vermelhos.length ? v.vermelhos.join(", ") : v.motivo) + " — diagnosticar log-failed";
    default:
      return "AVALIAR (mstate=" + pr.mergeStateStatus + ")";
  }
}

function diagnosticoPRs() {
  const r = gh(["pr", "list", "--repo", REPO, "--state", "open", "--limit", "50",
    "--json", "number,headRefName,headRefOid,createdAt,mergeStateStatus,statusCheckRollup"]);
  if (!r.ok) return { achados: [`pr list ilegível: ${r.err}`], prs: [] };
  const prs = JSON.parse(r.out).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out = prs.map((pr) => {
    const faltando = REQUIRED.filter((n) =>
      n === "merge-gate"
        ? estadoGate(pr.statusCheckRollup) === "AUSENTE"
        : !(pr.statusCheckRollup || []).some((c) => nomeDe(c) === n),
    );
    return {
      number: pr.number,
      branch: pr.headRefName,
      head: (pr.headRefOid || "").slice(0, 8),
      idade_horas: +horasAte(pr.createdAt).toFixed(1),
      mstate: pr.mergeStateStatus,
      classe: classificarPR(pr),
      required_faltando_na_rollup: faltando,
    };
  });
  return { prs: out, achados: [] };
}

// ── main ─────────────────────────────────────────────────────────────────────
const wf = diagnosticoWorkflows();
const runs = diagnosticoRuns();
const runners = diagnosticoRunners();
const docker = diagnosticoDocker();
const runnerWsEol = diagnosticoRunnerWsEol();
const bashWsl = diagnosticoBashWsl();
const killSwitch = diagnosticoKillSwitch();
const gerados = diagnosticoGerados();
const processos = diagnosticoProcessos(runners);
const prs = diagnosticoPRs();

const resultado = {
  repo: REPO,
  workflows: { fila_merge_state: wf.fila ? wf.fila.state : "N/A", fila_merge_id: wf.fila ? wf.fila.id : null, achados: wf.achados },
  runs_suspeitas: runs.suspeitas,
  runners: runners.runners.map((r) => `${r.name}:${r.status}${r.busy ? "(busy)" : ""}`),
  docker_engine: docker.engine,
  runner_ws_crlf: runnerWsEol.crlf,
  bash_wsl: { resolucao: bashWsl.resolucao, protegidos: bashWsl.protegidos, total: bashWsl.total },
  fila_pausada: killSwitch.pausada,
  gerados: gerados.estado,
  prs: prs.prs,
  achados_infra: [...wf.achados, ...runs.achados, ...runners.achados, ...docker.achados, ...runnerWsEol.achados, ...bashWsl.achados, ...killSwitch.achados, ...processos.achados, ...gerados.achados],
  acao_sugerida:
    prs.prs.length === 0
      ? "Fila vazia. Monitorar heartbeat E10 e PRs novos."
      : "Drenar em ordem de createdAt (skill fila-drenagem): resolver classe de cada PR, gate, merge, resync dos restantes.",
};

if (JSON_OUT) {
  console.log(JSON.stringify(resultado, null, 2));
} else {
  console.log(`=== FILA (${resultado.prs.length} PR aberto(s)) ===`);
  for (const p of resultado.prs)
    console.log(`#${p.number} ${p.branch} [${p.head}] ${p.idade_horas}h | ${p.mstate} | ${p.classe}${p.required_faltando_na_rollup.length ? " | sem rollup: " + p.required_faltando_na_rollup.join(",") : ""}`);
  console.log(`=== WORKFLOWS === ${resultado.workflows.fila_merge_state} ${resultado.workflows.achados.join(" | ")}`);
  console.log(`=== RUNNERS === ${resultado.runners.join(" | ")}`);
  console.log(`=== DOCKER === engine ${resultado.docker_engine ? "acessível" : "INACESSÍVEL"}`);
  console.log(`=== WS-RUNNER === ${resultado.runner_ws_crlf === null ? "não encontrado nesta máquina (detector mudo)" : resultado.runner_ws_crlf === 0 ? "EOL ok (w/crlf=0)" : `${resultado.runner_ws_crlf} arquivo(s) CRLF`}`);
  console.log(`=== BASH-WSL === resolucao=${resultado.bash_wsl.resolucao} (${resultado.bash_wsl.protegidos}/${resultado.bash_wsl.total} runners protegidos via .env)`);
  console.log(`=== KILL-SWITCH === FILA_PAUSADA=${resultado.fila_pausada}`);
  console.log(`=== GERADOS === ${Object.entries(resultado.gerados).map(([k,v])=>k+"="+v).join(" | ")}`);
  console.log(`=== INFRA === ${resultado.achados_infra.length ? resultado.achados_infra.join(" | ") : "sem achados"}`);
  console.log(`=== AÇÃO === ${resultado.acao_sugerida}`);
}
process.exit(0);
