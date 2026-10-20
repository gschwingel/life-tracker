#!/usr/bin/env node
// scripts/run-checks-parallel.cjs
// Propósito: bateria de validação (typecheck ×3, lint, test:scripts,
//            indices:status + vitest front&back) com paralelismo LIMITADO.
// Motivação: rodar front+back em paralelo com workers padrão flakou (timeout 5s
//            MermaidBlock — contenda de CPU em coverage, 2026-08-29). Este runner impõe
//            --maxWorkers ao vitest e concurrency máxima aos passos leves, agrega exit
//            codes (qualquer falha → exit 1) e mede timing por passo (baseline p/ docs).
//
// Uso:
//   node scripts/run-checks-parallel.cjs [--serial] [--coverage] [--maxWorkers=N]
//       [--concurrency=N] [--steps=a,b,c] [--list] [--verbose] [--parallel-heavy]
//   --serial        roda tudo em sequência (baseline de comparação)
//   --coverage      troca `vitest run` por `vitest run --coverage` (PATH-GATE)
//   --maxWorkers    limite de workers do vitest (default 0 = padrão da máquina; use
//                   >0 apenas com --parallel-heavy para reduzir contenda)
//   --concurrency   paralelismo máximo dos passos leves (default 4)
//   --parallel-heavy paraleliza vitest front+back (RISCO: flaky/lento em máquinas
//                   com ≤8 cores — experimento 2026-08-29: timeouts MermaidBlock/
//                   fence-regex; default é vitest SERIAL)
//   --steps         filtro por nome (ex: vitest:front,vitest:back)
//   --list          lista os passos e sai
//   --verbose       imprime o log completo dos passos com falha (default: falhas
//                   nomeadas + tail 40)
// Saída: exit 0 (todas verdes) | exit 1 (pelo menos um passo falhou)

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BACKEND = path.join(ROOT, "backend");

// npm/npx via entry JS do Node (evita spawn de .cmd que lança EINVAL neste
// ambiente Windows). Layout do npm varia por plataforma/instalação:
//   - Windows / npm junto do node: <nodeDir>/node_modules/npm/bin/{npm,npx}-cli.js
//   - GitHub ubuntu toolcache:        <nodeDir>/../lib/node_modules/npm/bin/{npm,npx}-cli.js
// (PATCH-OTIMIZACAO-CI-ONDA3-20260906: o layout de Windows quebrava no ubuntu —
// 'Cannot find module .../bin/node_modules/npm/bin/npx-cli.js')
function resolveNpmCli(entry) {
  const dirNode = path.dirname(process.execPath);
  const candidates = [
    path.join(dirNode, "node_modules", "npm", "bin", entry),
    path.join(dirNode, "..", "lib", "node_modules", "npm", "bin", entry),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // mantém o erro original (claro) se nenhum existir
}
const NPM_CLI = resolveNpmCli("npm-cli.js");
const NPX_CLI = resolveNpmCli("npx-cli.js");

function resolveBin(step) {
  if (step.cmd === "npm") return { bin: process.execPath, args: [NPM_CLI, ...step.args] };
  if (step.cmd === "npx") return { bin: process.execPath, args: [NPX_CLI, ...step.args] };
  return { bin: step.cmd, args: step.args };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = {
  serial: argv.includes("--serial"),
  coverage: argv.includes("--coverage"),
  parallelHeavy: argv.includes("--parallel-heavy"),
  verbose: argv.includes("--verbose"),
  list: argv.includes("--list"),
  maxWorkers: 0,
  concurrency: 4,
  steps: null,
};
for (const a of argv) {
  if (a.startsWith("--maxWorkers=")) opt.maxWorkers = Number(a.split("=")[1]) || 0; // 0 = sem cap (workers padrão)
  if (a.startsWith("--concurrency=")) opt.concurrency = Math.max(1, Number(a.split("=")[1]) || 4);
  if (a.startsWith("--steps=")) opt.steps = a.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean);
}

// ── Definição de passos ───────────────────────────────────────────────────────
// maxWorkers=0 → não passa --maxWorkers (vitest usa o padrão da máquina).
const WORKERS = opt.maxWorkers > 0 ? `--maxWorkers=${opt.maxWorkers}` : null;
const VITEST = ["vitest", "run", "--pool=forks", ...(WORKERS ? [WORKERS] : [])];

// PATCH-CI-FAST-LANES-20261001: argumentos EXTRA para os passos vitest SEM
// coverage, injetados via env pelo merge-gate na lane "changed" (FRONT_MODE=changed
// publica VITEST_FRONT_ARGS='--changed HEAD^1'). Split por whitespace; vazio = sem
// efeito. NUNCA aplicado aos passos coverage:* — o PATH-GATE (HB-035) é definido
// sempre em suíte FULL; coverage não aceita seleção parcial (thresholds avaliam o
// que está no relatório — seleção parcial esvaziaria o gate em silêncio).
function argsVitestExtra(varName) {
  return String(process.env[varName] || "").trim().split(/\s+/).filter(Boolean);
}
const EXTRA_FRONT = argsVitestExtra("VITEST_FRONT_ARGS");
const EXTRA_BACK = argsVitestExtra("VITEST_BACK_ARGS");

const STEPS_LIGHT = [
  { name: "typecheck:app", cmd: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.app.json"], cwd: ROOT, kind: "light" },
  { name: "typecheck:node", cmd: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.node.json"], cwd: ROOT, kind: "light" },
  { name: "typecheck:back", cmd: "npx", args: ["tsc", "--noEmit"], cwd: BACKEND, kind: "light" },
  { name: "lint", cmd: "npm", args: ["run", "lint"], cwd: ROOT, kind: "light" },
  { name: "test:scripts", cmd: "npm", args: ["run", "test:scripts"], cwd: ROOT, kind: "light" },
  { name: "indices:status", cmd: "npm", args: ["run", "indices:status"], cwd: ROOT, kind: "light" },
];

const HEAVY = opt.coverage
  ? [
      // HB-042/HB-033 (2026-09-28): a instrumentação de cobertura ~2.5× mais lenta +
      // contenda do runner self-hosted estourava o timeout default de 5s em testes
      // inocentes (a classe que o próprio cabeçalho deste runner documenta:
      // "contenda de CPU em coverage"). O timeout PRÓPRIO da CLASSE COVERAGE é
      // passado AQUI, no passo, sem tocar o default global do vitest (que segue
      // detectando travamento real na suíte normal).
      { name: "coverage:front", cmd: "npx", args: [...VITEST, "--coverage", "--testTimeout=15000"], cwd: ROOT, kind: "heavy" },
      { name: "coverage:back", cmd: "npx", args: [...VITEST, "--coverage", "--testTimeout=15000"], cwd: BACKEND, kind: "heavy" },
    ]
  : [
      { name: "vitest:front", cmd: "npx", args: [...VITEST, ...EXTRA_FRONT], cwd: ROOT, kind: "heavy" },
      { name: "vitest:back", cmd: "npx", args: [...VITEST, ...EXTRA_BACK], cwd: BACKEND, kind: "heavy" },
    ];

let steps = [...STEPS_LIGHT, ...HEAVY];
if (opt.steps) {
  steps = steps.filter((s) => opt.steps.includes(s.name));
  if (steps.length === 0) {
    console.error("Nenhum passo correspondeu a --steps=" + opt.steps.join(","));
    process.exit(2);
  }
}

if (opt.list) {
  for (const s of steps) console.log(`${s.kind === "heavy" ? "H" : "L"} ${s.name}`);
  process.exit(0);
}

// ── Executor ──────────────────────────────────────────────────────────────────
const LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "run-checks-parallel-"));
const ENV = { ...process.env, CI: "true", FORCE_COLOR: "0" };

function readTail(file, n) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const lines = txt.split(/\r?\n/).filter((l) => l.trim());
    return lines.slice(-n).join("\n");
  } catch {
    return "";
  }
}

// Nomeia as falhas do passo: TAP (`not ok N - <nome>`, reporter do node 22 no CI
// com stdout não-TTY) ou spec (`✖ <nome>` + `ℹ fail N`, reporter do node 24 local).
// Sem isso o log do CI mostra apenas o tail 40 e as falhas ficam ANÔNIMAS — custo
// pago em 2026-09-17 (merge-gate vermelho com 7 falhas de test:scripts sem um
// único nome no log, exigindo um ciclo inteiro de CI só para identificá-las).
function readFailures(file, max) {
  try {
    const lines = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter(
        (l) =>
          /^not ok \d+ - /.test(l) ||
          /^✖ /.test(l) ||
          /^ℹ fail [1-9]/.test(l) ||
          /^# fail [1-9]/.test(l),
      );
    if (lines.length === 0) return "";
    const shown = lines.slice(0, max).join("\n");
    const extra =
      lines.length > max
        ? `\n      ... (+${lines.length - max} linhas; log completo: ${file})`
        : "";
    return shown + extra;
  } catch {
    return "";
  }
}

function runStep(step) {
  return new Promise((resolve) => {
    const logPath = path.join(LOG_DIR, `${step.name}.log`);
    const out = fs.createWriteStream(logPath);
    const t0 = Date.now();
    const { bin, args } = resolveBin(step);
    const child = spawn(bin, args, {
      cwd: step.cwd,
      env: ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // pipe() espera o 'open' do stream — sem problema de fd pré-aberto (Windows EINVAL).
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    child.on("error", (err) => {
      out.end();
      resolve({ step, ok: false, ms: Date.now() - t0, err: err.message });
    });
    child.on("close", (code) => {
      out.end();
      resolve({ step, ok: code === 0, ms: Date.now() - t0, code });
    });
  });
}

function report(r) {
  const status = r.ok ? "ok" : "FAIL";
  const why = r.err ? ` — ${r.err}` : r.code !== undefined ? ` — exit ${r.code}` : "";
  console.log(`[${status}] ${r.step.name} (${(r.ms / 1000).toFixed(1)}s)${why}`);
  if (!r.ok && !opt.verbose) {
    const logFile = path.join(LOG_DIR, `${r.step.name}.log`);
    const falhas = readFailures(logFile, 25);
    if (falhas) console.log(`      --- falhas (${r.step.name}) ---\n${falhas}`);
    const tail = readTail(logFile, 40);
    if (tail) console.log(`      --- log (${r.step.name}) ---\n${tail}`);
  }
  return r;
}

async function runPool(items, limit) {
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = report(await runStep(items[idx]));
    }
  };
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

(async () => {
  const mode = opt.serial
    ? "serial"
    : `light-parallel(${opt.concurrency}) + heavy-${opt.parallelHeavy ? "parallel" : "serial"}${opt.maxWorkers > 0 ? ` (maxWorkers=${opt.maxWorkers})` : ""}`;
  console.log(
    `[run-checks-parallel] ${steps.length} passos · modo=${mode}${opt.coverage ? " · COVERAGE (PATH-GATE)" : ""} · logs=${LOG_DIR}`,
  );

  const t0 = Date.now();
  const light = steps.filter((s) => s.kind === "light");
  const heavy = steps.filter((s) => s.kind === "heavy");
  const results = [];

  if (opt.serial) {
    for (const s of steps) results.push(report(await runStep(s)));
  } else {
    // Leves: paralelos (bounded). Pesados (vitest/coverage): serial por default —
    // experimento 2026-08-29 provou que paralelizar vitest front+back é mais lento
    // E flaky em máquinas ≤8 cores (timeouts de render jsdom).
    results.push(...(await runPool(light, opt.concurrency)));
    if (opt.parallelHeavy) {
      results.push(...(await runPool(heavy, 2)));
    } else {
      for (const s of heavy) results.push(report(await runStep(s)));
    }
  }

  const wall = Date.now() - t0;
  const failed = results.filter((r) => !r.ok);
  console.log("\n════════ RESULTADO ════════");
  for (const r of results) {
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.step.name.padEnd(18)} ${(r.ms / 1000).toFixed(1).padStart(6)}s${r.err ? `  ${r.err}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passos verdes · wall=${(wall / 1000).toFixed(1)}s`);
  process.exit(failed.length ? 1 : 0);
})();
