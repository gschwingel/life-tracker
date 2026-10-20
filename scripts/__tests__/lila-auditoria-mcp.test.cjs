// scripts/__tests__/lila-auditoria-mcp.test.cjs
// MCP-AUDITORIA (2026-08-31): suite do lila-auditoria-mcp (fachada read-only dos gates
// E1.5/E4 do FDV-EXEC). Protocolo JSON-RPC + schema das tools + formato do relatorio.
// Por padrao roda com AUDITORIA_MCP_STUB=1 (gates stub deterministicos, sem spawn).
// Teste REAL (gates verdadeiros do repo, ~25s) e OPT-IN: AUDITORIA_MCP_REAL=1.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { spawnCapture } = require("../lila-auditoria-mcp.cjs");

const SERVER = path.resolve(__dirname, "..", "lila-auditoria-mcp.cjs");
const REAL = process.env.AUDITORIA_MCP_REAL === "1";

function startServer(env = {}) {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, AUDITORIA_MCP_STUB: "1", ...env }
  });
  const pending = new Map();
  let nextId = 1;
  child.stdout.on("data", (buf) => {
    const lines = buf.toString("utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  return {
    child,
    call(method, params) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    },
    // close(): encerra o filho e ESPERA o exit — mesmo contrato do restante das
    // suites MCP (2026-09-12): o cleanup de fixture não pode correr com o processo
    // ainda vivo, senão o Windows trava o diretório e o rm estoura EPERM.
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exit = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      const teto = new Promise((resolve) =>
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* já morto */ }
          resolve();
        }, 2000).unref()
      );
      await Promise.race([exit, teto]);
    }
  };
}

// rmrf: remoção de fixture com RETRY (o Node repete com backoff linear em
// EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM). No Windows o diretório fica travado por
// alguns ms após o processo sair; `fs.rmSync` puro flakava test:scripts.
const RM_RETRY = { recursive: true, force: true, maxRetries: 20, retryDelay: 50 };
function rmrf(dir) {
  fs.rmSync(dir, RM_RETRY);
}

test("lila-auditoria-mcp: initialize + tools/list exatamente 2 tools read-only", async () => {
  const s = startServer();
  try {
    const init = await s.call("initialize", { protocolVersion: "2024-11-05" });
    assert.equal(init.result.serverInfo.name, "lila-auditoria-mcp");
    assert.equal(typeof init.result.workspaceRoot, "string");
    assert.equal(typeof init.result.workspaceRootVia, "string");
    const list = await s.call("tools/list", {});
    const names = list.result.tools.map((t) => t.name);
    assert.deepEqual(names, ["audit_state", "report_draft"]);
    // read-only por design: nenhuma tool de escrita (nem de grafo/docs)
    assert.ok(!names.includes("write_doc"));
    assert.ok(!names.includes("grafo_normalize"));
  } finally {
    await s.close();
  }
});

test("audit_state (stub): 4 gates com schema {nome,ok,exitCode,resumo,evidencia} + todos_verdes", async () => {
  const s = startServer();
  try {
    const r = await s.call("tools/call", { name: "audit_state", arguments: {} });
    assert.equal(r.result.isError, false);
    const data = JSON.parse(r.result.content[0].text);
    assert.equal(data.env, "stub");
    assert.equal(data.gates.length, 4);
    const nomes = data.gates.map((g) => g.nome).sort();
    assert.deepEqual(nomes, ["indices_check", "indices_status", "select_tests", "verificar_divida"]);
    for (const g of data.gates) {
      assert.equal(typeof g.ok, "boolean");
      assert.equal(typeof g.exitCode, "number");
      assert.ok(g.resumo.length > 0, "resumo nao vazio");
      assert.ok(g.evidencia.length > 0, "evidencia nao vazia");
    }
    assert.equal(data.todos_verdes, true);
  } finally {
    await s.close();
  }
});

test("audit_state (stub) com base: select_tests recebe a ref no schema", async () => {
  const s = startServer();
  try {
    const r = await s.call("tools/call", { name: "audit_state", arguments: { base: "HEAD~1" } });
    const data = JSON.parse(r.result.content[0].text);
    const st = data.gates.find((g) => g.nome === "select_tests");
    assert.ok(st, "gate select_tests presente");
    assert.equal(st.ok, true);
  } finally {
    await s.close();
  }
});

test("report_draft (stub): FORMATO_RELATORIO com campos de julgamento VAZIOS + escalada", async () => {
  const s = startServer();
  try {
    const r = await s.call("tools/call", { name: "report_draft", arguments: {} });
    const data = JSON.parse(r.result.content[0].text);
    assert.match(data.relatorio, /AUDITORIA FDV-EXEC/);
    assert.match(data.relatorio, /P-N/); // problemas com campo de julgamento
    assert.match(data.relatorio, /VAZIO/); // campos de julgamento vazios
    assert.match(data.relatorio, /Escalada a full suite/);
    assert.match(data.relatorio, /select_tests/);
    assert.equal(data.todos_verdes, true);
  } finally {
    await s.close();
  }
});

test("audit_state REAL (OPT-IN AUDITORIA_MCP_REAL=1): gates verdadeiros do repo", { timeout: 180000, skip: !REAL }, async () => {
  const s = startServer({ AUDITORIA_MCP_STUB: "0" });
  try {
    const r = await s.call("tools/call", { name: "audit_state", arguments: {} });
    const data = JSON.parse(r.result.content[0].text);
    assert.equal(data.env, "real");
    assert.equal(data.gates.length, 5);
    for (const g of data.gates) {
      assert.equal(typeof g.exitCode, "number", `${g.nome} exitCode numerico`);
      assert.ok(g.resumo.length > 0, `${g.nome} resumo nao vazio`);
    }
    // Wiring validado; o repo NAO precisa estar 100% verde neste teste (indices podem
    // estar stale durante desenvolvimento) — gates vermelhos sao reportados, nao assertados.
    const vermelhos = data.gates.filter((g) => !g.ok).map((g) => `${g.nome}(exit ${g.exitCode})`);
    if (vermelhos.length > 0) {
      console.log(`[lila-auditoria-mcp REAL] gates vermelhos (esperado durante dev): ${vermelhos.join(", ")}`);
    }
  } finally {
    await s.close();
  }
});

// ── Resolução de workspace root — cadeia git-aware (PROMPT-MCP-AUTOROOT-20260911 / F3) ──
// Cadeia: LILA_WORKSPACE_ROOT > git toplevel do CWD > LILA_GRAFO_ROOT (deprecated) > __dirname/..
// O cwd é HERDADO no spawn — os degraus são exercitados em processo filho com cwd/env
// controlados (mesmo caminho de código: resolveRoot()); os gates usam esse root como cwd.

const ROOT_INSTALACAO = path.resolve(path.dirname(SERVER), "..");

function mesmaPasta(a, b) {
  return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
}

/** Executa resolveRoot() em processo filho com cwd/env controlados (env de root limpo). */
function resolveRootChild({ cwd, env = {} } = {}) {
  const envFinal = { ...process.env };
  delete envFinal.LILA_WORKSPACE_ROOT;
  delete envFinal.LILA_GRAFO_ROOT;
  Object.assign(envFinal, env);
  const r = spawnSync(
    process.execPath,
    ["-e", `process.stdout.write(require(${JSON.stringify(SERVER)}).resolveRoot());`],
    { cwd: cwd || ROOT_INSTALACAO, env: envFinal, encoding: "utf8" }
  );
  return { root: String(r.stdout || "").trim(), stderr: String(r.stderr || ""), status: r.status };
}

/** Repo git efêmero + worktree linkado (cenário real de paralelismo por worktree). */
function makeGitRepoComWorktree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lila-aud-root-"));
  const repo = path.join(base, "repo");
  const wt = path.join(base, "wt");
  fs.mkdirSync(repo, { recursive: true });
  const git = (args, cwd) =>
    spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  git(["init", "-q"], repo);
  git(["-c", "user.email=test@test", "-c", "user.name=test", "commit", "-q", "--allow-empty", "-m", "init"], repo);
  git(["worktree", "add", "-q", wt, "-b", "wt-fixture"], repo);
  return { base, repo, wt };
}

test("resolveRoot (F3.1): LILA_WORKSPACE_ROOT vence a cadeia inteira", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lila-aud-ws-"));
  try {
    const r = resolveRootChild({
      cwd: ROOT_INSTALACAO,
      env: { LILA_WORKSPACE_ROOT: dir, LILA_GRAFO_ROOT: path.join(dir, "legado") }
    });
    assert.equal(r.status, 0);
    assert.ok(mesmaPasta(r.root, dir), `esperado ${dir}, obtido ${r.root}`);
    assert.match(r.stderr, /\[mcp-root\] resolved=.* via=LILA_WORKSPACE_ROOT/);
  } finally {
    rmrf(dir);
  }
});

test("resolveRoot (F3.2): sem env, root = git toplevel de worktree do CWD", () => {
  const { base, wt } = makeGitRepoComWorktree();
  try {
    const r = resolveRootChild({ cwd: wt });
    assert.equal(r.status, 0);
    assert.ok(mesmaPasta(r.root, wt), `esperado ${wt}, obtido ${r.root}`);
    assert.match(r.stderr, /via=git-toplevel/);
  } finally {
    rmrf(base);
  }
});

test("resolveRoot (F3.3): sem env e fora de repo git → __dirname/..", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lila-aud-fora-"));
  try {
    // GIT_CEILING_DIRECTORIES impede a descoberta ACIMA do diretório do teste.
    const r = resolveRootChild({ cwd: dir, env: { GIT_CEILING_DIRECTORIES: dir } });
    assert.equal(r.status, 0);
    assert.ok(mesmaPasta(r.root, ROOT_INSTALACAO), `esperado ${ROOT_INSTALACAO}, obtido ${r.root}`);
    assert.match(r.stderr, /via=__dirname/);
  } finally {
    rmrf(dir);
  }
});

test("resolveRoot (F3.5): sem env dentro do repo → idêntico ao comportamento histórico", () => {
  const r = resolveRootChild({ cwd: ROOT_INSTALACAO });
  assert.equal(r.status, 0);
  assert.ok(mesmaPasta(r.root, ROOT_INSTALACAO), `esperado ${ROOT_INSTALACAO}, obtido ${r.root}`);
  assert.match(r.stderr, /via=git-toplevel/);
});

test("spawnCapture (F3.2 E2E): cwd dos gates = root resolvido por git toplevel, sem env", async () => {
  const antesWs = process.env.LILA_WORKSPACE_ROOT;
  const antesGrafo = process.env.LILA_GRAFO_ROOT;
  delete process.env.LILA_WORKSPACE_ROOT;
  delete process.env.LILA_GRAFO_ROOT;
  try {
    const toplevel = String(
      spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" }).stdout || ""
    ).trim();
    const r = await spawnCapture(process.execPath, ["-e", "process.stdout.write(process.cwd())"]);
    assert.equal(r.exitCode, 0);
    assert.ok(mesmaPasta(String(r.stdout).trim(), toplevel), `cwd ${r.stdout} deveria ser o toplevel ${toplevel}`);
  } finally {
    if (antesWs === undefined) delete process.env.LILA_WORKSPACE_ROOT; else process.env.LILA_WORKSPACE_ROOT = antesWs;
    if (antesGrafo === undefined) delete process.env.LILA_GRAFO_ROOT; else process.env.LILA_GRAFO_ROOT = antesGrafo;
  }
});

