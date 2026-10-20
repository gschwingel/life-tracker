#!/usr/bin/env node
// lila-estado-mcp.cjs — MCP server (stdio) READ-ONLY para consulta de estado do repo.
// Proposito: expor consultas de estado como tools tipadas (debt_check, indices_status)
// sem nenhuma operacao de escrita. Cada tool e fachada FINA sobre o
// script CLI correspondente — WET > DRY (regra de ouro PROMPT-MCP-REGISTRO-ADOCAO 2.3):
// a logica de leitura e duplicada aqui em vez de refatorar os scripts originais, que
// permanecem intactos e funcionando identicos standalone (console.log em CLI quebraria
// o protocolo JSON-RPC no stdout deste servidor).
// Entrada: JSON-RPC 2.0 via stdin (initialize | notifications/initialized | ping | tools/list | tools/call)
// Saida:   JSON-RPC 2.0 via stdout (uma mensagem JSON por linha)
// Env (testes): PATCH_DEBT_JSON | VETORIAL_INDEX_JSON | VETORIAL_INDEX_BIN |
//               LILA_WORKSPACE_ROOT (override de root — ver resolveRoot() abaixo)

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const { spawnSync } = require("child_process");

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

// ── Helpers compartilhados ──────────────────────────────────────────────────

/** dias desde uma data "YYYY-MM-DD" (mesmo padrao de verificar-divida-patch.cjs). */
function diasAberto(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/**
 * sha256 hex do conteudo de um arquivo. MESMO padrao de
 * verificar-frescor-indice-vetorial.cjs (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905):
 * normalizacao CRLF→LF antes do hash — evita falso stale quando o checkout
 * reescreve texto com CRLF (core.autocrlf, Windows). Binarios (com \0) sao
 * hasheados brutos.
 */
function fileHash(filePath) {
  const buf = fs.readFileSync(filePath);
  if (!buf.includes(0)) {
    const texto = buf
      .toString("utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    return crypto.createHash("sha256").update(texto, "utf8").digest("hex");
  }
  return crypto.createHash("sha256").update(buf).digest("hex");
}


// ── debt_check: fachada sobre scripts/verificar-divida-patch.cjs (CLI-only, WET > DRY) ──

/**
 * Le o ledger de dividas (LILA-DEV/execucao/patch-debt.json) e lista as dividas
 * abertas. Espelha a regra D6 do FDV-PATCH: pagamento exigido quando existe divida
 * aberta da area (se --area informado) OU com idade > dias (default 30).
 * Retorna: { ok, dividas: [{id, area, diasAberto}], exitCode, error? }.
 * Nenhum side effect — apenas leitura (nao paga, nao altera ledger).
 */
function debtCheck(opts = {}) {
  const ledgerPath =
    opts.ledgerPath ||
    process.env.PATCH_DEBT_JSON ||
    path.join(resolveRoot(), "LILA-DEV", "execucao", "patch-debt.json");
  const area = opts.area || null;
  const days = opts.days != null ? opts.days : 30;

  if (!fs.existsSync(ledgerPath)) {
    return { ok: true, dividas: [], exitCode: 0 };
  }

  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  } catch (e) {
    return { ok: false, dividas: [], exitCode: 1, error: `patch-debt.json ilegivel: ${e.message || e}` };
  }

  const abertas = (Array.isArray(ledger.debts) ? ledger.debts : []).filter((d) => d && d.status === "aberta");
  const dividas = abertas.map((d) => ({
    id: d.id,
    area: d.area,
    diasAberto: diasAberto(d.data)
  }));

  const pendente = dividas.some((d) => {
    const velha = d.diasAberto !== null && d.diasAberto > days;
    const daArea = area !== null && d.area === area;
    return velha || daArea;
  });

  return { ok: !pendente, dividas, exitCode: pendente ? 1 : 0 };
}

// ── indices_status: fachada sobre scripts/verificar-frescor-indice-vetorial.cjs (WET > DRY) ──

/**
 * Verifica o frescor do indice vetorial por fileHash por chunk (mesmo criterio do
 * verificar-frescor-indice-vetorial.cjs) + integridade basica do sidecar e, quando o
 * .bin existir, consistencia sidecar↔bin (chunks.length × dimensions × 4 == bin.size).
 * Retorna: { ok, chunks, stale: [...], exitCode, binIntegro?, error? }.
 * Nenhum side effect — apenas leitura (nao regenera indice).
 */
function indicesStatus(opts = {}) {
  const indexJson =
    opts.indexJson ||
    process.env.VETORIAL_INDEX_JSON ||
    path.join(resolveRoot(), "indice-vetorial.json");
  const binPath =
    opts.binPath ||
    process.env.VETORIAL_INDEX_BIN ||
    indexJson.replace(/\.json$/i, ".bin");

  if (!fs.existsSync(indexJson)) {
    return { ok: false, chunks: 0, stale: [], exitCode: 1, error: "indice-vetorial.json ausente (rode npm run indices)" };
  }

  let sidecar;
  try {
    sidecar = JSON.parse(fs.readFileSync(indexJson, "utf8"));
  } catch (e) {
    return { ok: false, chunks: 0, stale: [], exitCode: 1, error: `indice-vetorial.json ilegivel: ${e.message || e}` };
  }

  if (!Array.isArray(sidecar.chunks) || sidecar.chunks.length === 0) {
    return { ok: false, chunks: 0, stale: [], exitCode: 1, error: "indice-vetorial.json sem chunks (indice vazio ou invalido)" };
  }

  const stale = [];
  const okSet = new Set();
  for (const c of sidecar.chunks) {
    if (typeof c.path !== "string" || typeof c.fileHash !== "string") continue;
    if (okSet.has(c.path)) continue;
    if (!fs.existsSync(c.path)) {
      if (!stale.includes(c.path)) stale.push(c.path);
      continue;
    }
    try {
      if (fileHash(c.path) === c.fileHash) {
        okSet.add(c.path);
      } else if (!stale.includes(c.path)) {
        stale.push(c.path);
      }
    } catch {
      if (!stale.includes(c.path)) stale.push(c.path);
    }
  }

  let binIntegro = null;
  if (fs.existsSync(binPath)) {
    binIntegro =
      typeof sidecar.dimensions === "number" &&
      fs.statSync(binPath).size === sidecar.chunks.length * sidecar.dimensions * 4;
  }

  const ok = stale.length === 0 && binIntegro !== false;
  return { ok, chunks: sidecar.chunks.length, stale, exitCode: ok ? 0 : 1, binIntegro };
}

// ── Declaracao das tools (EXATAMENTE 2, read-only) ────────────────────────────

const TOOLS = [
  {
    name: "debt_check",
    description:
      "Verifica o ledger de dividas de patch (LILA-DEV/execucao/patch-debt.json) — fachada fina de verificar-divida-patch.cjs. Retorna { ok, dividas: [{area, diasAberto}], exitCode } sem executar side effects (nao paga divida, nao altera ledger).",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string", description: "Filtra pagamento exigido pela area (opcional)." },
        days: { type: "number", description: "Idade maxima aceitavel em dias (default 30)." }
      }
    }
  },
  {
    name: "indices_status",
    description:
      "Verifica o frescor do indice vetorial (fileHash por chunk) e a integridade sidecar↔bin — fachada fina de verificar-frescor-indice-vetorial.cjs. Retorna { ok, chunks, stale: [...] } sem side effects (nao regenera indice).",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

// ── Dispatcher JSON-RPC (padrão estrutural dos MCPs lila-*) ─────────────────

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
          respond(id, { protocolVersion: (params && params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lila-estado-mcp", version: "0.1.0" }, ...workspaceContext() });
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
          if (name === "debt_check") {
            result = debtCheck({ area: args.area || null, days: args.days != null ? args.days : 30 });
          } else if (name === "indices_status") {
            result = indicesStatus({});
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

module.exports = { debtCheck, indicesStatus, diasAberto, resolveRoot, resolveRootDetailed, workspaceContext, comContextoWorkspace };

