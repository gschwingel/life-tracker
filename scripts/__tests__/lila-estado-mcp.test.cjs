const { test } = require("node:test");
const assert = require("node:assert");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const SERVER = path.resolve(__dirname, "..", "lila-estado-mcp.cjs");

function startServer(env = {}, opts = {}) {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: opts.cwd,
    env: { ...process.env, ...env }
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
    // close(): encerra o filho e ESPERA o exit. Sem isso o cleanup do fixture pode
    // rodar com o processo (cwd DENTRO do fixture, nos testes E2E de worktree) ainda
    // vivo — no Windows o diretório fica travado e o rm falha com EPERM.
    // Flake real medido em 2026-09-12: 3 falhas no merge-gate (CI) + 1 em 6
    // execuções locais de `test:scripts`, sempre em lila-estado-mcp.
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exit = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      // teto de segurança: filho que ignore o sinal não pendura a suíte.
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

function makeFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lila-estado-mcp-"));
}

// rmrf: remoção de fixture com RETRY. `maxRetries`/`retryDelay` fazem o Node
// repetir com backoff linear em EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM — necessário
// no Windows, que segura o diretório por alguns ms após o processo sair (mesma
// origem do flake: `fs.rmSync` puro estourava EPERM e derrubava test:scripts).
const RM_RETRY = { recursive: true, force: true, maxRetries: 20, retryDelay: 50 };
function rmrf(dir) {
  fs.rmSync(dir, RM_RETRY);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ── protocolo: initialize + tools/list (EXATAMENTE 2 tools read-only) ────────
test("lila-estado-mcp: initialize + tools/list exatamente 2 tools", async () => {
  const s = startServer();
  try {
    const init = await s.call("initialize", { protocolVersion: "2024-11-05" });
    assert.equal(init.result.serverInfo.name, "lila-estado-mcp");
    assert.equal(typeof init.result.workspaceRoot, "string");
    assert.equal(typeof init.result.workspaceRootVia, "string");
    const list = await s.call("tools/list", {});
    const names = list.result.tools.map((t) => t.name);
    assert.deepEqual(names, ["debt_check", "indices_status"]);
    // nenhuma tool de escrita (fachada read-only por design)
    assert.ok(!names.includes("write_doc"));
    assert.ok(!names.includes("read_doc"));
  } finally {
    await s.close();
  }
});

// ── debt_check: integracao via spawn (env PATCH_DEBT_JSON) ───────────────────
test("lila-estado-mcp: debt_check retorna divida aberta velha (exitCode 1)", async () => {
  const dir = makeFixture();
  try {
    const ledger = path.join(dir, "patch-debt.json");
    fs.writeFileSync(
      ledger,
      JSON.stringify({
        version: 1,
        debts: [
          { id: "PATCH-TEST-001", patchId: "TEST", data: "2026-01-01", area: "infra", tipo: "testes", descricao: "fixture", skippedSteps: [], pagamentoExigido: "proximo estrutural", status: "aberta" }
        ]
      })
    );
    const s = startServer({ PATCH_DEBT_JSON: ledger });
    try {
      const r = await s.call("tools/call", { name: "debt_check", arguments: {} });
      assert.equal(r.result.isError, false);
      const data = JSON.parse(r.result.content[0].text);
      // schema de saida exigido pelo prompt: { ok, dividas: [{area, diasAberto}], exitCode }
      assert.equal(typeof data.ok, "boolean");
      assert.equal(Array.isArray(data.dividas), true);
      assert.equal(typeof data.exitCode, "number");
      assert.equal(data.ok, false);
      assert.equal(data.exitCode, 1);
      assert.equal(data.dividas[0].area, "infra");
      assert.equal(typeof data.dividas[0].diasAberto, "number");
    } finally {
      await s.close();
    }
  } finally {
    rmrf(dir);
  }
});

test("lila-estado-mcp: debt_check com ledger ausente = sem dividas (exitCode 0)", async () => {
  const dir = makeFixture();
  try {
    const s = startServer({ PATCH_DEBT_JSON: path.join(dir, "inexistente.json") });
    try {
      const r = await s.call("tools/call", { name: "debt_check", arguments: {} });
      const data = JSON.parse(r.result.content[0].text);
      assert.equal(data.ok, true);
      assert.equal(data.exitCode, 0);
      assert.deepEqual(data.dividas, []);
    } finally {
      await s.close();
    }
  } finally {
    rmrf(dir);
  }
});

test("lila-estado-mcp: debt_check com ledger ilegivel = erro estruturado (ok false + error)", async () => {
  const dir = makeFixture();
  try {
    const ledger = path.join(dir, "patch-debt.json");
    fs.writeFileSync(ledger, "{ nao e json");
    const s = startServer({ PATCH_DEBT_JSON: ledger });
    try {
      const r = await s.call("tools/call", { name: "debt_check", arguments: {} });
      const data = JSON.parse(r.result.content[0].text);
      assert.equal(data.ok, false);
      assert.equal(data.exitCode, 1);
      assert.match(data.error, /ilegivel/);
    } finally {
      await s.close();
    }
  } finally {
    rmrf(dir);
  }
});

// ── LILA_WORKSPACE_ROOT (PR tronco/mcp-workspace-root): default do ledger vindo de ROOT ──
test("lila-estado-mcp: LILA_WORKSPACE_ROOT isola o ledger default (layout de worktree)", async () => {
  // Cenário A: ledger fixture em <tmp>/LILA-DEV/execucao/patch-debt.json (sem PATCH_DEBT_JSON)
  // -> debt_check enxerga via default derivado de LILA_WORKSPACE_ROOT.
  const dirA = makeFixture();
  try {
    const ledger = path.join(dirA, "LILA-DEV", "execucao", "patch-debt.json");
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(
      ledger,
      JSON.stringify({
        version: 1,
        debts: [
          { id: "PATCH-TEST-ROOT-001", patchId: "TEST", data: "2026-01-01", area: "infra", tipo: "testes", descricao: "fixture root", skippedSteps: [], pagamentoExigido: "proximo estrutural", status: "aberta" }
        ]
      })
    );
    const s = startServer({ LILA_WORKSPACE_ROOT: dirA });
    try {
      const r = await s.call("tools/call", { name: "debt_check", arguments: {} });
      assert.equal(r.result.isError, false);
      const data = JSON.parse(r.result.content[0].text);
      assert.equal(data.ok, false, "ledger do worktree (LILA_WORKSPACE_ROOT) deveria ser lido como default");
      assert.equal(data.exitCode, 1);
      assert.equal(data.dividas.length, 1);
      assert.equal(data.dividas[0].area, "infra");
    } finally {
      await s.close();
    }
  } finally {
    rmrf(dirA);
  }

  // Cenário B: tmp vazio + LILA_WORKSPACE_ROOT -> sem ledger no root alternativo
  // (default do servidor resolve para <tmp>, nao para o repo real).
  const dirB = makeFixture();
  try {
    const s = startServer({ LILA_WORKSPACE_ROOT: dirB });
    try {
      const r = await s.call("tools/call", { name: "debt_check", arguments: {} });
      const data = JSON.parse(r.result.content[0].text);
      assert.equal(data.ok, true, "tmp sem ledger deveria ser 'sem dividas' (default derivado de LILA_WORKSPACE_ROOT)");
      assert.equal(data.exitCode, 0);
      assert.deepEqual(data.dividas, []);
    } finally {
      await s.close();
    }
  } finally {
    rmrf(dirB);
  }
});


// ── indices_status: integracao via spawn (env VETORIAL_INDEX_JSON/_BIN) ─────
test("lila-estado-mcp: indices_status fresco (fileHash ok + bin integro)", async () => {
  const dir = makeFixture();
  try {
    const src = path.join(dir, "foo.ts");
    fs.writeFileSync(src, "const x = 1;");
    const sidecar = path.join(dir, "indice-vetorial.json");
    fs.writeFileSync(
      sidecar,
      JSON.stringify({
        version: 1,
        model: "test",
        dimensions: 1536,
        chunks: [{ path: src, exportName: "Foo", content: "const x = 1;", startLine: 1, fileHash: sha256("const x = 1;"), offset: 0, length: 1536 }]
      })
    );
    const bin = path.join(dir, "indice-vetorial.bin");
    fs.writeFileSync(bin, Buffer.alloc(1 * 1536 * 4)); // chunks × dims × 4
    const s = startServer({ VETORIAL_INDEX_JSON: sidecar, VETORIAL_INDEX_BIN: bin });
    try {
      const r = await s.call("tools/call", { name: "indices_status", arguments: {} });
      const data = JSON.parse(r.result.content[0].text);
      assert.equal(typeof data.ok, "boolean");
      assert.equal(typeof data.chunks, "number");
      assert.equal(Array.isArray(data.stale), true);
      assert.equal(data.ok, true);
      assert.equal(data.chunks, 1);
      assert.deepEqual(data.stale, []);
      assert.equal(data.exitCode, 0);
      assert.equal(data.binIntegro, true);
    } finally {
      await s.close();
    }
  } finally {
    rmrf(dir);
  }
});

test("lila-estado-mcp: indices_status stale por fileHash divergente", async () => {
  const dir = makeFixture();
  try {
    const src = path.join(dir, "foo.ts");
    fs.writeFileSync(src, "const x = 1;");
    const sidecar = path.join(dir, "indice-vetorial.json");
    fs.writeFileSync(
      sidecar,
      JSON.stringify({
        version: 1,
        model: "test",
        dimensions: 1536,
        chunks: [{ path: src, exportName: "Foo", content: "const x = 1;", startLine: 1, fileHash: "a".repeat(64), offset: 0, length: 1536 }]
      })
    );
    const s = startServer({ VETORIAL_INDEX_JSON: sidecar, VETORIAL_INDEX_BIN: path.join(dir, "sem-bin.bin") });
    try {
      const r = await s.call("tools/call", { name: "indices_status", arguments: {} });
      const data = JSON.parse(r.result.content[0].text);
      assert.equal(data.ok, false);
      assert.equal(data.exitCode, 1);
      assert.ok(data.stale.includes(src));
    } finally {
      await s.close();
    }
  } finally {
    rmrf(dir);
  }
});

// ── regressao PATCH 2026-09-08: contrato CRLF→LF com o gerador canônico ──────
// verificar-frescor-indice-vetorial.cjs normaliza CRLF→LF antes do hash
// (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905). O MCP deve bater com esse contrato
// (drift FDV↔MCP = falha bloqueante) para nao reportar falso stale em checkout
// Windows (core.autocrlf).
test("lila-estado-mcp: indices_status considera fonte CRLF fresco (hash normalizado)", () => {
  const dir = makeFixture();
  try {
    const src = path.join(dir, "foo.ts");
    fs.writeFileSync(src, "const x = 1;\r\nconst y = 2;\r\n");
    // fileHash armazenado pelo gerador = sha256 do texto NORMALIZADO (LF)
    const fileHashLf = sha256("const x = 1;\nconst y = 2;\n");
    const sidecar = path.join(dir, "indice-vetorial.json");
    fs.writeFileSync(
      sidecar,
      JSON.stringify({
        version: 1,
        model: "test",
        dimensions: 1536,
        chunks: [{ path: src, exportName: "Foo", content: "", startLine: 1, fileHash: fileHashLf, offset: 0, length: 1536 }]
      })
    );
    const r = indicesStatus({ indexJson: sidecar, binPath: path.join(dir, "sem-bin.bin") });
    assert.equal(r.ok, true);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.stale, []);
  } finally {
    rmrf(dir);
  }
});

// ── erro estruturado: tool desconhecida (JSON-RPC error code -32601) ─────────
test("lila-estado-mcp: tool desconhecida retorna erro estruturado -32601", async () => {
  const s = startServer();
  try {
    const r = await s.call("tools/call", { name: "tool_inexistente", arguments: {} });
    assert.equal(r.error.code, -32601);
    assert.match(r.error.message, /Unknown tool/);
  } finally {
    await s.close();
  }
});

// ── unit: funcoes puras com overrides por argumento (sem spawn) ──────────────
const { debtCheck, indicesStatus, diasAberto } = require("../lila-estado-mcp.cjs");

/**
 * Data relativa ao dia corrente (UTC) — M2 do sweep 2026-09-25: o fixture usava a
 * data LITERAL "2026-08-27", que ficou com 31 dias em 2026-09-27 e virou falso
 * vermelho por virada de calendario (nao por regressao de codigo). A data passa a
 * ser derivada de hoje, entao o teste mede a REGRA do limite de 30 dias, nao o
 * calendario de quem roda a suite.
 */
function diasAtras(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

test("lila-estado-mcp: debtCheck exige pagamento da area (argumento area)", () => {
  const dir = makeFixture();
  try {
    const ledger = path.join(dir, "patch-debt.json");
    fs.writeFileSync(
      ledger,
      JSON.stringify({
        version: 1,
        debts: [
          { id: "PATCH-TEST-002", patchId: "TEST", data: diasAtras(1), area: "infra", tipo: "testes", descricao: "fixture", skippedSteps: [], pagamentoExigido: "proximo estrutural", status: "aberta" }
        ]
      })
    );
    // sem area e com data dentro da janela (1 dia): nenhuma pendente -> ok
    assert.equal(debtCheck({ ledgerPath: ledger }).ok, true);
    assert.equal(debtCheck({ ledgerPath: ledger }).exitCode, 0);
    // com area "infra": pendente por ser da area -> exitCode 1
    const r = debtCheck({ ledgerPath: ledger, area: "infra" });
    assert.equal(r.ok, false);
    assert.equal(r.exitCode, 1);
    assert.equal(r.dividas[0].area, "infra");
  } finally {
    rmrf(dir);
  }
});

test("lila-estado-mcp: debtCheck acusa divida FORA da janela de 30 dias", () => {
  const dir = makeFixture();
  try {
    const ledger = path.join(dir, "patch-debt.json");
    fs.writeFileSync(
      ledger,
      JSON.stringify({
        version: 1,
        debts: [
          { id: "PATCH-TEST-003", patchId: "TEST", data: diasAtras(60), area: "infra", tipo: "testes", descricao: "fixture velha", skippedSteps: [], pagamentoExigido: "proximo estrutural", status: "aberta" }
        ]
      })
    );
    const r = debtCheck({ ledgerPath: ledger });
    assert.equal(r.ok, false);
    assert.equal(r.exitCode, 1);
    assert.equal(r.dividas[0].area, "infra");
  } finally {
    rmrf(dir);
  }
});

test("lila-estado-mcp: indicesStatus falha com sidecar invalido", () => {
  const dir = makeFixture();
  try {
    const sidecar = path.join(dir, "indice-vetorial.json");
    fs.writeFileSync(sidecar, JSON.stringify({ version: 1, chunks: [] }));
    const r = indicesStatus({ indexJson: sidecar });
    assert.equal(r.ok, false);
    assert.equal(r.exitCode, 1);
    assert.match(r.error, /sem chunks/);
    assert.equal(r.chunks, 0);
  } finally {
    rmrf(dir);
  }
});

test("lila-estado-mcp: diasAberto valida formato YYYY-MM-DD", () => {
  assert.equal(diasAberto("nao-data"), null);
  assert.equal(typeof diasAberto("2026-01-01"), "number");
  assert.ok(diasAberto("2026-01-01") > 30);
});



// ── Resolução de workspace root — cadeia git-aware (PROMPT-MCP-AUTOROOT-20260911 / F3) ──
// Cadeia: LILA_WORKSPACE_ROOT > git toplevel do CWD > LILA_GRAFO_ROOT (deprecated) > __dirname/..
// O cwd é HERDADO no spawn — por isso os degraus 2/3/4 são exercitados em processo
// filho com cwd/env controlados (mesmo caminho de código: resolveRoot()).

const ROOT_INSTALACAO = path.resolve(path.dirname(SERVER), "..");

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

/** Repo git efêmero + worktree linkado (espelha o cenário real de paralelismo). */
function makeGitRepoComWorktree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lila-root-"));
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

function mesmaPasta(a, b) {
  return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
}

test("resolveRoot (F3.1): LILA_WORKSPACE_ROOT vence a cadeia inteira", () => {
  const dir = makeFixture();
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
  const dir = makeFixture();
  try {
    // GIT_CEILING_DIRECTORIES impede a descoberta ACIMA do diretório do teste —
    // determinístico mesmo quando o tmpdir da máquina vive dentro de um repo.
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

test("debt_check (F3.2 E2E): ledger default lido do git toplevel do worktree, sem env", async () => {
  const { base, wt } = makeGitRepoComWorktree();
  try {
    const ledger = path.join(wt, "LILA-DEV", "execucao", "patch-debt.json");
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, JSON.stringify({
      version: 1,
      debts: [{ id: "PATCH-AUTOROOT-001", patchId: "AUTOROOT", data: "2026-01-01", area: "infra", tipo: "testes", descricao: "fixture git-toplevel", skippedSteps: [], pagamentoExigido: "proximo estrutural", status: "aberta" }]
    }));
    // env vazia ("" é falsy) = nenhum override: o root tem de vir do toplevel do cwd.
    const s = startServer({ PATCH_DEBT_JSON: "", LILA_WORKSPACE_ROOT: "", LILA_GRAFO_ROOT: "" }, { cwd: wt });
    try {
      const r = await s.call("tools/call", { name: "debt_check", arguments: {} });
      assert.equal(r.result.isError, false);
      const data = JSON.parse(r.result.content[0].text);
      assert.equal(data.ok, false, "deveria achar a dívida do ledger no root resolvido por git toplevel");
      assert.equal(data.dividas.length, 1);
      assert.equal(data.dividas[0].area, "infra");
    } finally {
      await s.close();
    }
  } finally {
    rmrf(base);
  }
});

