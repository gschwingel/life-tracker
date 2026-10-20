#!/usr/bin/env node
// scripts/lila-auditoria-mcp.cjs — MCP server (stdio) READ-ONLY de auditoria FDV-EXEC.
// Proposito: fachada dos gates MECANICOS do E1.5/E4 (MATRIZ_TESTES v3.10).
// Tools:
//   audit_state  — roda os 5 gates puros em serie e retorna { gates:[{nome,ok,exitCode,
//                  resumo,evidencia}], todos_verdes }. Zero escrita.
//   report_draft — preenche o FORMATO_RELATORIO com os resultados mecanicos e deixa os
//                  campos de JULGAMENTO VAZIOS (P1/P2, narrativa, escalada, lacunas).
// NAO-GOALS (explicitos — nao negociaveis):
//   - NUNCA classifica P1/P2; NUNCA decide escalada a full suite; NUNCA aprova auditoria.
//   - NUNCA escreve arquivos. grafo-normalize dry-run fica FORA (E3.5 e interativo/
//     humano — escreve artefato de candidatos; friccao cognitiva E-INV-09 preservada).
//   - NUNCA roda heavy (vitest/typecheck/coverage — isso e do run-checks-parallel.cjs).
//   - NUNCA re-implementa logica: fachada spawn/parse dos scripts existentes (WET > DRY,
//     mesma regra de ouro do lila-estado-mcp §2.3). Logica duplicada diverge (licao do
//     bug de chunking vetorial).
// Entrada/Saida: JSON-RPC 2.0 via stdin/stdout (uma mensagem JSON por linha).
// Env: AUDITORIA_MCP_STUB=1 (gates stub deterministicos p/ testes, sem spawn) |
//      AUDITORIA_MCP_TIMEOUT_MS (default 120000 por gate).

"use strict";

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");

// ── Resolucao do workspace root (LAZY — por chamada, cadeia git-aware) ───────
// Cadeia de precedencia (PROMPT-MCP-AUTOROOT-20260911 / F1):
//   1. LILA_WORKSPACE_ROOT         override explicito de sessao (nome canonico)
//   2. git toplevel do CWD herdado (`git rev-parse --show-toplevel`)
//   3. LILA_GRAFO_ROOT             LEGADO — DEPRECATED, somente compat de leitura
//   4. __dirname/..                instalacao in-repo (comportamento historico)
// Projetos conhecidos pinam o root na definicao do servidor (LILA_WORKSPACE_ROOT,
// MULTIPROJETO 12/09 — fronteira e o ROOT, nao a copia do script); a cadeia
// CWD-based abaixo permanece como fallback para worktree ad-hoc.
// Nunca lanca para o chamador: falha/empty simplesmente desce a cadeia.
// Log de resolucao vai para STDERR (stdout e o canal do protocolo JSON-RPC).
function gitToplevel(cwd) {
  try {
    const out = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 2000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
    if (!out || out.error || out.status !== 0) return null;
    const linha = String(out.stdout || "").split(/\r?\n/)[0].trim();
    return linha || null;
  } catch {
    return null;
  }
}

function resolveRootDetailed() {
  let root = process.env.LILA_WORKSPACE_ROOT;
  let via = "LILA_WORKSPACE_ROOT";
  if (!root) { root = gitToplevel(process.cwd()); via = "git-toplevel"; }
  if (!root) { root = process.env.LILA_GRAFO_ROOT; via = "LILA_GRAFO_ROOT(deprecated)"; }
  if (!root) { root = path.resolve(__dirname, ".."); via = "__dirname"; }
  process.stderr.write(`[mcp-root] resolved=${root} via=${via}\n`);
  return { root, via };
}

function resolveRoot() {
  return resolveRootDetailed().root;
}

// Contexto anunciado no inicio de cada resposta (initialize + tools/call): o
// modelo ve para onde o servidor aponta antes de consumir/executar.
function workspaceContext() {
  const detalhe = resolveRootDetailed();
  return { workspaceRoot: detalhe.root, workspaceRootVia: detalhe.via };
}

function comContextoWorkspace(resultado) {
  const ctx = workspaceContext();
  if (resultado && typeof resultado === "object" && !Array.isArray(resultado)) {
    return { workspaceRoot: ctx.workspaceRoot, workspaceRootVia: ctx.workspaceRootVia, ...resultado };
  }
  return { workspaceRoot: ctx.workspaceRoot, workspaceRootVia: ctx.workspaceRootVia, resultado };
}

const GATE_TIMEOUT_MS = Number(process.env.AUDITORIA_MCP_TIMEOUT_MS) || 120000;

// npm via entry JS do Node (mesmo truque do run-checks-parallel — evita .cmd no Windows).
const NPM_BIN = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin");
const NPM_CLI = path.join(NPM_BIN, "npm-cli.js");

// ── Execucao de gate (fachada spawn/parse — WET > DRY) ─────────────────────────

function spawnCapture(bin, argv) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(bin, argv, {
      cwd: resolveRoot(),
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => { stdout += b.toString("utf8"); });
    child.stderr.on("data", (b) => { stderr += b.toString("utf8"); });
    const timer = setTimeout(() => { child.kill(); }, GATE_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, ms: Date.now() - t0 });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: err.message, ms: Date.now() - t0 });
    });
  });
}

function tail(resumo) {
  const lines = String(resumo || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(-6).join(" | ");
}

/** Spec dos 5 gates puros do E1.5/E4 (ordem deterministica). */
function gateSpecs(args) {
  return [
    {
      nome: "select_tests",
      run: () =>
        spawnCapture(
          process.execPath,
          ["scripts/select-tests.cjs", ...(args.base ? ["--base", String(args.base)] : []), "--json"]
        ),
    },
    { nome: "indices_check", run: () => spawnCapture(process.execPath, [NPM_CLI, "run", "indices:check"]) },
    { nome: "indices_status", run: () => spawnCapture(process.execPath, ["scripts/validar-integridade.cjs", "--indices-only"]) },
    {
      nome: "verificar_divida",
      run: () =>
        spawnCapture(
          process.execPath,
          ["scripts/verificar-divida-patch.cjs", ...(args.area ? ["--area", String(args.area)] : [])]
        ),
    },
  ];
}

function parseSelectTests(out) {
  const text = String(out.stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runGate(spec) {
  if (process.env.AUDITORIA_MCP_STUB === "1") {
    return { nome: spec.nome, ok: true, exitCode: 0, resumo: "[stub] gate deterministico", evidencia: "stub (AUDITORIA_MCP_STUB=1)", ms: 0 };
  }
  const out = await spec.run();
  const gate = {
    nome: spec.nome,
    ok: out.exitCode === 0,
    exitCode: out.exitCode,
    resumo: tail([out.stdout, out.stderr].join("\n")),
    evidencia: String(out.stdout || out.stderr || "(sem saida)").trim().split(/\r?\n/)[0] || "(sem saida)",
    ms: out.ms,
  };
  if (spec.nome === "select_tests") {
    const plan = parseSelectTests(out);
    if (plan) gate.evidencia = plan; // objeto — consumido pelo report_draft
  }
  return gate;
}

// ── Tools ───────────────────────────────────────────────────────────────────────

async function auditState(args) {
  const gates = [];
  for (const spec of gateSpecs(args)) {
    gates.push(await runGate(spec));
  }
  const todosVerdes = gates.every((g) => g.ok);
  return {
    env: process.env.AUDITORIA_MCP_STUB === "1" ? "stub" : "real",
    executadoEm: new Date().toISOString(),
    gates,
    todos_verdes: todosVerdes,
  };
}

function escaladaLinhas(audit) {
  const st = audit.gates.find((g) => g.nome === "select_tests");
  if (st && typeof st.evidencia === "object" && st.evidencia !== null) {
    const p = st.evidencia;
    if (p.fullSuite) return [`  full suite: SIM — ${(p.fullSuiteMotivos || []).join("; ") || "matriz disparou"}`];
    if (p.selecaoVazia) return ["  full suite: nao — selecao vazia justificada no relatorio (nao executar vitest)"];
    return ["  full suite: nao disparada pela matriz"];
  }
  return ["  <VAZIO — evidencia do select_tests indisponivel>"];
}

async function reportDraft(args) {
  const audit = await auditState(args);
  const linhas = [];
  linhas.push("AUDITORIA FDV-EXEC — [Frame ID | BUGFIX | docfix]");
  linhas.push("");
  linhas.push("✅ Integros (sem problemas):");
  for (const g of audit.gates) {
    linhas.push(`- [mecanico] ${g.nome}: exit ${g.exitCode} — ${g.resumo}`);
  }
  linhas.push("");
  linhas.push("❌ Problemas encontrados:");
  linhas.push("- [P-N] [dimensao afetada]: <VAZIO — classificar P1/P2 pelo agente (friccao cognitiva)>");
  linhas.push("  Correcao: <VAZIO — apenas se dentro do escopo dos arquivos ja tocados>");
  linhas.push("");
  linhas.push("📋 Testes pendentes:");
  linhas.push("- <VAZIO — novos arquivos sem cobertura identificados pelo agente>");
  linhas.push("");
  linhas.push("📋 AI-Manifest:");
  linhas.push("- <VAZIO — atualizado se mudanca estrutural (src/lib hooks components pages backend docs scripts Method package.json)>");
  linhas.push("");
  linhas.push("Escalada a full suite (sugestao mecanica do select_tests):");
  linhas.push(...escaladaLinhas(audit));
  return {
    relatorio: linhas.join("\n"),
    todos_verdes: audit.todos_verdes,
    gates: audit.gates.map((g) => ({ nome: g.nome, ok: g.ok, exitCode: g.exitCode, resumo: g.resumo })),
  };
}

// ── Declaracao das tools (EXATAMENTE 2, read-only) ────────────────────────────

const AUDIT_ARGS = {
  type: "object",
  properties: {
    base: { type: "string", description: "Ref git (hash/branch) do inicio do frame — passada ao select-tests (obrigatoria no contexto pos-commit E4)." },
    area: { type: "string", description: "Area tattica para o gate verificar-divida-patch (opcional)." },
    days: { type: "number", description: "Idade maxima aceitavel da divida em dias (default 30)." }
  }
};

const TOOLS = [
  {
    name: "audit_state",
    description:
      "Agrega os 4 gates MECANICOS do E1.5/E4 (FDV-EXEC v3.10) em uma chamada read-only: select_tests (plano da MATRIZ_TESTES), indices_check, indices_status, verificar_divida. Retorna { gates:[{nome,ok,exitCode,resumo,evidencia}], todos_verdes }. NAO classifica P1/P2, NAO decide escalada, NAO aprova, NAO escreve arquivos (grafo-normalize fica fora — E3.5 interativo), NAO roda vitest/typecheck.",
    inputSchema: AUDIT_ARGS,
  },
  {
    name: "report_draft",
    description:
      "Preenche o FORMATO_RELATORIO canonico do FDV-EXEC com os resultados mecanicos do audit_state e deixa os campos de JULGAMENTO VAZIOS (P1/P2, narrativa, lacunas, manifest) para o agente/humano preencher. Retorna { relatorio, todos_verdes, gates }. Read-only.",
    inputSchema: AUDIT_ARGS,
  }
];

// ── Dispatcher JSON-RPC (padrao estrutural do lila-estado-mcp) ─────────────────

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
  function respond(id, result) { send({ jsonrpc: "2.0", id, result }); }
  function fail(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

  rl.on("line", async (line) => {
    let req;
    try { req = JSON.parse(line); } catch { return; }
    const { id, method, params } = req;
    try {
      switch (method) {
        case "initialize":
          respond(id, { protocolVersion: (params && params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lila-auditoria-mcp", version: "0.1.0" }, ...workspaceContext() });
          break;
        case "notifications/initialized":
        case "notifications/cancelled":
          break;
        case "ping":
          respond(id, {});
          break;
        case "tools/list":
          respond(id, { tools: TOOLS });
          break;
        case "tools/call": {
          const name = params && params.name;
          const args = (params && params.arguments) || {};
          if (typeof args !== "object" || args === null || Array.isArray(args)) {
            respond(id, { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "arguments deve ser um objeto" }) }], isError: true });
            break;
          }
          let result;
          if (name === "audit_state") {
            result = await auditState({ base: args.base || null, area: args.area || null, days: args.days != null ? args.days : 30 });
          } else if (name === "report_draft") {
            result = await reportDraft({ base: args.base || null, area: args.area || null, days: args.days != null ? args.days : 30 });
          } else {
            fail(id, -32601, "Unknown tool: " + name);
            break;
          }
          respond(id, { content: [{ type: "text", text: JSON.stringify(comContextoWorkspace(result)) }], isError: false });
          break;
        }
        default:
          fail(id, -32601, "Method not found: " + method);
      }
    } catch (err) {
      fail(id, -32603, String(err && err.message ? err.message : err));
    }
  });

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

module.exports = { auditState, reportDraft, gateSpecs, spawnCapture, resolveRoot, resolveRootDetailed, workspaceContext, comContextoWorkspace };

