
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readUnits, deprecateUnit, registerUnit, readNode, updateNode, createNodes, caminhos, comContextoWorkspace } = require("../lila-grafo-mcp.cjs");

// ── Fixture temporária (env overrides lidos LAZY nas chamadas) ────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grafo-mcp-"));
const snapDir = path.join(tmp, "snap");
fs.mkdirSync(snapDir, { recursive: true });
fs.writeFileSync(path.join(tmp, "grafo.json"), JSON.stringify({
  keyframes: [{ id: "KF-T", estado: "🟢", snapshot: "snap/KF-T.md" }], sprints: [], frames: []
}, null, 2));
fs.writeFileSync(path.join(tmp, "grafo-historico.json"), JSON.stringify({ keyframes: [], sprints: [], frames: [] }, null, 2));
fs.writeFileSync(path.join(snapDir, "KF-T.md"), [
  "NÓ: KF-T", "", "DECISÕES DE NEGÓCIO:",
  "- Dado A, quando B, então C → tomada por: humano | data: 2026-08-27",
  "- Dado D, quando E, então F"
].join("\n"));
const ledgerPath = path.join(tmp, "decisoes-ledger.json");
// rmrf: remoção de fixture com RETRY (o Node repete com backoff linear em
// EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM). No Windows o diretório fica travado por
// alguns ms após o processo sair; `fs.rmSync` puro flakava test:scripts (2026-09-12).
const RM_RETRY = { recursive: true, force: true, maxRetries: 20, retryDelay: 50 };
function rmrf(dir) {
  fs.rmSync(dir, RM_RETRY);
}
function resetLedger() {
  fs.writeFileSync(ledgerPath, JSON.stringify({ schema: "v1", unidades: [
    { id: "KF-T.U1", node: "KF-T", grafo: "atual", nivel: "keyframe", snapshot: "snap/KF-T.md",
      tipo: "decisao", granularidade: "bullet", texto: "Dado A, quando B, então C → tomada por: humano | data: 2026-08-27",
      tomadaPor: "humano", data: "2026-08-27", status: "ativa", deprecated: null, revisao: null }
  ], nodos: [] }, null, 2));
}
// Fixture isolada também no degrau 1 da cadeia de root (PROMPT-MCP-AUTOROOT-20260911):
// desde a cadeia git-aware, o git toplevel do CWD precede o legado LILA_GRAFO_ROOT —
// sem LILA_WORKSPACE_ROOT o fixture seria ignorado nos caminhos derivados de root.
process.env.LILA_WORKSPACE_ROOT = tmp;
process.env.LILA_GRAFO_ROOT = tmp;
process.env.LILA_GRAFO_LEDGER = ledgerPath;
process.env.LILA_GRAFO_PATH = path.join(tmp, "grafo.json");
process.env.LILA_GRAFO_HISTORICO = path.join(tmp, "grafo-historico.json");

test("read_units anuncia workspaceRoot/workspaceRootVia antes dos dados", () => {
  resetLedger();
  const r = comContextoWorkspace(readUnits({ node: "KF-T" }));
  assert.equal(r.ok, true);
  assert.equal(typeof r.workspaceRoot, "string");
  assert.equal(typeof r.workspaceRootVia, "string");
  assert.equal(r.total, 1);
});

test("read_units: filtra por node e status", () => {
  resetLedger();
  const todas = readUnits({ node: "KF-T" });
  assert.equal(todas.ok, true);
  assert.equal(todas.total, 1);
  const vazias = readUnits({ node: "KF-T", status: "deprecated" });
  assert.equal(vazias.total, 0);
});

test("deprecate_unit: marca com substituidoPor validado", () => {
  resetLedger();
  const r = deprecateUnit({ id: "KF-T.U1", motivo: "contradicao", substituidoPor: "KF-T", evidencia: "teste" });
  assert.equal(r.ok, true);
  assert.equal(r.deprecated.substituidoPor, "KF-T");
  assert.equal(r.deprecated.fonte, "lila-grafo-mcp");
});

test("deprecate_unit: erros estruturados", () => {
  resetLedger();
  assert.equal(deprecateUnit({ id: "NOPE.U1", motivo: "remocao" }).ok, false);
  assert.match(deprecateUnit({ id: "KF-T.U1", motivo: "x" }).error, /motivo/);
  assert.match(deprecateUnit({ id: "KF-T.U1", motivo: "remocao", substituidoPor: "NAO-EXISTE" }).error, /substituidoPor/);
  const r1 = deprecateUnit({ id: "KF-T.U1", motivo: "remocao" });
  assert.equal(r1.ok, true);
  assert.match(deprecateUnit({ id: "KF-T.U1", motivo: "remocao" }).error, /já está deprecated/);
});

test("register_unit: ID alinhado ao snapshot e próximo índice livre", () => {
  resetLedger();
  const alinhado = registerUnit({ node: "KF-T", tipo: "decisao", texto: "Dado D, quando E, então F" });
  assert.equal(alinhado.ok, true);
  assert.equal(alinhado.id, "KF-T.U2");
  assert.equal(alinhado.alinhadoAoSnapshot, true);
  const novo = registerUnit({ node: "KF-T", tipo: "comportamento", texto: "Dado G, quando H, então I" });
  assert.equal(novo.id, "KF-T.U3");
  assert.match(registerUnit({ node: "KF-T", tipo: "decisao", texto: "Dado D, quando E, então F" }).error, /duplicada/);
  assert.match(registerUnit({ node: "KF-NOPE", tipo: "decisao", texto: "x" }).error, /não encontrado/);
  assert.match(registerUnit({ node: "KF-T", tipo: "invalido", texto: "x" }).error, /tipo/);
});

test("update_node: whitelist, validação de estado e gravação seletiva", () => {
  resetLedger();
  const r = updateNode({ id: "KF-T", fields: { estado: "🟡", nota: "mutação de teste" } });
  assert.equal(r.ok, true);
  assert.equal(r.gravado, true);
  assert.equal(r.antes.estado, "🟢");
  const g = JSON.parse(fs.readFileSync(path.join(tmp, "grafo.json"), "utf8"));
  assert.equal(g.keyframes[0].estado, "🟡");
  assert.equal(g.keyframes[0].nota, "mutação de teste");
  assert.match(updateNode({ id: "KF-T", fields: { estado: "azul" } }).error, /estado inválido/);
  // T8A: depende_de agora é whitelist ESTRUTURAL — com id válido não rejeita por whitelist;
  // campo genuinamente fora da whitelist continua rejeitado
  assert.equal(updateNode({ id: "KF-T", fields: { depende_de: [] } }).ok, true);
  assert.match(updateNode({ id: "KF-T", fields: { campo_inexistente: ["x"] } }).error, /whitelist/);
  assert.match(updateNode({ id: "KF-NOPE", fields: { nota: "x" } }).error, /não encontrado/);
});

test("update_node: snapshot e log_execucao aceitos (strings não vazias; null remove)", () => {
  resetLedger();
  const r = updateNode({ id: "KF-T", fields: { snapshot: "snap/KF-T.md", log_execucao: "KF-T-log.md" } });
  assert.equal(r.ok, true);
  const g = JSON.parse(fs.readFileSync(path.join(tmp, "grafo.json"), "utf8"));
  assert.equal(g.keyframes[0].snapshot, "snap/KF-T.md");
  assert.equal(g.keyframes[0].log_execucao, "KF-T-log.md");
  assert.match(updateNode({ id: "KF-T", fields: { snapshot: "" } }).error, /snapshot deve ser string/);
  assert.match(updateNode({ id: "KF-T", fields: { log_execucao: 7 } }).error, /log_execucao deve ser string/);
  const r2 = updateNode({ id: "KF-T", fields: { log_execucao: null } });
  assert.equal(r2.ok, true);
});


test("read_node: status derivado do ledger (morre quando tudo deprecated)", () => {
  resetLedger();
  const vivo = readNode({ id: "KF-T" });
  assert.equal(vivo.ok, true);
  assert.equal(vivo.ledger.statusDocumento, "parcial");
  deprecateUnit({ id: "KF-T.U1", motivo: "remocao" });
  const morto = readNode({ id: "KF-T" });
  assert.equal(morto.ledger.statusDocumento, "morre");
  assert.equal(readNode({ id: "KF-NOPE" }).ok, false);
});

test("protocolo JSON-RPC: initialize + tools/list (spawn)", async () => {
  const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, [path.resolve(__dirname, "..", "lila-grafo-mcp.cjs")], { stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let nextId = 1;
  child.stdout.on("data", (buf) => {
    for (const line of buf.toString("utf8").split("\n").filter(Boolean)) {
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  const call = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  try {
    const init = await call("initialize", { protocolVersion: "2024-11-05" });
    assert.equal(init.result.serverInfo.name, "lila-grafo-mcp");
    // S7 (2026-09-06): fingerprint do código no handshake — detecta server stale vs repo.
    assert.match(init.result.serverFingerprint || "", /^[0-9a-f]{16}$/);
    // Anuncio do workspace no inicio da execucao: o modelo ve para onde o
    // servidor aponta antes de consumir qualquer tool.
    assert.equal(typeof init.result.workspaceRoot, "string");
    assert.equal(typeof init.result.workspaceRootVia, "string");
    const list = await call("tools/list", {});
    const nomes = list.result.tools.map((t) => t.name);
    assert.deepEqual(nomes.sort(), ["create_nodes", "deprecate_unit", "read_node", "read_units", "register_unit", "update_node"]);
    const desconhecida = await call("tools/call", { name: "nao_existe", arguments: {} });
    assert.equal(desconhecida.error.code, -32601);
  } finally {
    // espera o exit antes do cleanup: processo vivo segurando o cwd/fixture no
    // Windows = EPERM no rm (2026-09-12).
    if (child.exitCode === null && child.signalCode === null) {
      const exit = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await Promise.race([
        exit,
        new Promise((resolve) => setTimeout(resolve, 2000).unref())
      ]);
    }
  }
});

test("read_node: campo estruturado do nó vence a derivação do ledger (parcial correto)", () => {
  resetLedger();
  // nó com decisoes_deprecated={total: 3, unidades: 1} — ledger tem 1/1 deprecated,
  // mas o snapshot tem 3 unidades → truth = parcial (campo do nó, não do ledger)
  const gPath = path.join(tmp, "grafo.json");
  const g = JSON.parse(fs.readFileSync(gPath, "utf8"));
  g.keyframes[0].decisoes_deprecated = { total: 3, unidades: 1, em: "2026-08-27", ledger: "test" };
  fs.writeFileSync(gPath, JSON.stringify(g, null, 2) + "\n", "utf8");
  const r = readNode({ id: "KF-T" });
  assert.equal(r.ledger.statusDocumento, "parcial");
  assert.equal(r.node.decisoes_deprecated.total, 3);
  // nó com deprecated (documento inteiro) → morre, mesmo sem unidades no ledger
  const hPath = path.join(tmp, "grafo-historico.json");
  const h = { keyframes: [{ id: "KF-MORTO", estado: "🟢", deprecated: { em: "2026-08-27", motivo: "contradicao", substituido_por: "KF-T" } }], sprints: [], frames: [] };
  fs.writeFileSync(hPath, JSON.stringify(h, null, 2) + "\n", "utf8");
  const morto = readNode({ id: "KF-MORTO" });
  assert.equal(morto.ok, true);
  assert.equal(morto.ledger.statusDocumento, "morre");
});

test("update_node: idempotência — segunda gravação idêntica não muda arquivo", () => {
  resetLedger();
  updateNode({ id: "KF-T", fields: { nota: "idempotente" } });
  const antes = fs.readFileSync(path.join(tmp, "grafo.json"), "utf8");
  const r = updateNode({ id: "KF-T", fields: { nota: "idempotente" } });
  assert.equal(r.gravado, false);
  assert.equal(fs.readFileSync(path.join(tmp, "grafo.json"), "utf8"), antes);
});

test("update_node: campos estruturais (T8A) — aceita ids resolvíveis, rejeita não resolvível e prefixo ausente", () => {
  resetLedger();
  // aceitação: pai/depende_de/desbloqueia/frames_negocio com ids do universo
  const ok = updateNode({ id: "KF-T", fields: { depende_de: ["KF-T"], desbloqueia: ["KF-T"], frames_negocio: [] } });
  assert.equal(ok.ok, true);
  const g1 = JSON.parse(fs.readFileSync(path.join(tmp, "grafo.json"), "utf8"));
  assert.deepEqual(g1.keyframes.find((n) => n.id === "KF-T").depende_de, ["KF-T"]);
  // rejeição: id não resolvível
  assert.match(updateNode({ id: "KF-T", fields: { depende_de: ["NAO-EXISTE"] } }).error, /não resolvível/);
  // rejeição: frames_negocio sem prefixo FR-
  assert.match(updateNode({ id: "KF-T", fields: { frames_negocio: ["STT-N05"] } }).error, /prefixo FR-/);
  // rejeição: tipo inválido
  assert.match(updateNode({ id: "KF-T", fields: { desbloqueia: "FR-X" } }).error, /array de strings/);
  // rejeição: pai não resolvível
  assert.match(updateNode({ id: "KF-T", fields: { pai: "NAO-EXISTE" } }).error, /pai não resolvível/);
  // regra antiga preservada: campo fora da whitelist continua rejeitado
  assert.match(updateNode({ id: "KF-T", fields: { campo_inexistente: ["x"] } }).error, /whitelist/);
  // T8B: delegacoes_tecnicas — strings livres (prosa/ids), sem exigência de resolução
  const okDeleg = updateNode({ id: "KF-T", fields: { delegacoes_tecnicas: ["STT-N01 hook", "FR-X"] } });
  assert.equal(okDeleg.ok, true);
  assert.match(updateNode({ id: "KF-T", fields: { delegacoes_tecnicas: [42] } }).error, /array de strings/);
  // veredito humano 2026-08-31: codigo formalizado — validação de FORMA (caminho pode não existir)
  const okCodigo = updateNode({ id: "KF-T", fields: { codigo: ["backend/src/services/tool-planner.ts"] } });
  assert.equal(okCodigo.ok, true, "codigo aceita caminho inexistente (declaração histórica)");
  assert.match(updateNode({ id: "KF-T", fields: { codigo: "x" } }).error, /array de strings/);
  assert.match(updateNode({ id: "KF-T", fields: { codigo: [""] } }).error, /array de strings/);
  // deprecated: exige evidência do veredito humano
  const okDep = updateNode({ id: "KF-T", fields: { deprecated: { em: "2026-08-31", motivo: "remocao", substituido_por: null, evidencia: "veredito humano de teste" } } });
  assert.equal(okDep.ok, true);
  assert.match(updateNode({ id: "KF-T", fields: { deprecated: { em: "2026-08-31", motivo: "remocao" } } }).error, /evidencia/);
  assert.match(updateNode({ id: "KF-T", fields: { deprecated: { em: "31-08-2026", motivo: "remocao", evidencia: "x" } } }).error, /em deve ser/);
  assert.match(updateNode({ id: "KF-T", fields: { deprecated: { em: "2026-08-31", motivo: "chuto", evidencia: "x" } } }).error, /motivo/);
  assert.match(updateNode({ id: "KF-T", fields: { deprecated: { em: "2026-08-31", motivo: "remocao", evidencia: "x", substituido_por: "NAO-EXISTE" } } }).error, /substituido_por/);
});

test("update_node: freeze guard — nó do histórico sem flag → GRAPH_FROZEN e arquivo inalterado", () => {
  resetLedger();
  const hPath = path.join(tmp, "grafo-historico.json");
  if (!JSON.parse(fs.readFileSync(hPath, "utf8")).keyframes.some((n) => n.id === "KF-FOSSEL")) {
    const h = JSON.parse(fs.readFileSync(hPath, "utf8"));
    h.keyframes.push({ id: "KF-FOSSEL", estado: "🟢", snapshot: null });
    fs.writeFileSync(hPath, JSON.stringify(h, null, 2) + "\n", "utf8");
  }
  const antes = fs.readFileSync(hPath, "utf8");
  const r = updateNode({ id: "KF-FOSSEL", fields: { nota: "tentativa" } });
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, "GRAPH_FROZEN");
  assert.match(r.message, /grafo congelado/);
  assert.equal(fs.readFileSync(hPath, "utf8"), antes);
});

test("update_node: overrideFrozen:true grava no histórico e loga o override", () => {
  const hPath = path.join(tmp, "grafo-historico.json");
  const antes = fs.readFileSync(hPath, "utf8");
  const r = updateNode({ id: "KF-FOSSEL", fields: { nota: "override autorizado" }, overrideFrozen: true });
  assert.equal(r.ok, true);
  assert.equal(r.overrideFrozenLog.id, "KF-FOSSEL");
  assert.match(r.overrideFrozenLog.aviso, /overrideFrozen/);
  assert.notEqual(fs.readFileSync(hPath, "utf8"), antes);
});

test("update_node: nó do grafo ativo permanece inalterado (regressão zero)", () => {
  resetLedger();
  const r = updateNode({ id: "KF-T", fields: { nota: "regressao-zero" } });
  assert.equal(r.ok, true);
  assert.equal(r.grafo, "atual");
  assert.equal(r.overrideFrozenLog, undefined);
});

test("create_nodes: cria lote KF→SP→FR no grafo ativo com pai no lote", () => {
  resetLedger();
  const r = createNodes({ nodes: [
    { id: "KF-N2", nivel: "keyframe", estado: "🟡", snapshot: "snap/KF-N2.md" },
    { id: "SP-N2", nivel: "sprint", pai: "KF-N2", snapshot: "snap/SP-N2.md" },
    { id: "FR-N2", nivel: "frame", pai: "SP-N2", snapshot: "snap/FR-N2.md", desbloqueia: ["SP-N2"] }
  ] });
  assert.equal(r.ok, true);
  assert.equal(r.criados.length, 3);
  assert.equal(r.criados[2].colecao, "frames");
  const g = JSON.parse(fs.readFileSync(path.join(tmp, "grafo.json"), "utf8"));
  const fr = g.frames.find((n) => n.id === "FR-N2");
  assert.equal(fr.pai, "SP-N2");
  assert.equal(fr.estado, "🔴"); // default determinístico
  assert.deepEqual(fr.desbloqueia, ["SP-N2"]);
  // idempotência estrutural: recriar rejeita
  assert.match(createNodes({ nodes: [{ id: "FR-N2", nivel: "frame", pai: "SP-N2" }] }).error, /já existe/);
});

test("create_nodes: erros estruturados (pai ausente, nivel inválido, colisão com histórico, estado, alvo)", () => {
  resetLedger();
  assert.match(createNodes({ nodes: [] }).error, /array não vazio/);
  assert.match(createNodes({ nodes: [{ id: "SP-X", nivel: "sprint" }] }).error, /exige pai/);
  assert.match(createNodes({ nodes: [{ id: "SP-X", nivel: "sprint", pai: "KF-INEXISTENTE" }] }).error, /pai não encontrado/);
  assert.match(createNodes({ nodes: [{ id: "X1", nivel: "outro" }] }).error, /nivel/);
  // colisão de namespace com o histórico
  const hPath = path.join(tmp, "grafo-historico.json");
  const h = JSON.parse(fs.readFileSync(hPath, "utf8"));
  h.keyframes.push({ id: "KF-FOSSEL", estado: "🟢", snapshot: null });
  fs.writeFileSync(hPath, JSON.stringify(h, null, 2) + "\n", "utf8");
  assert.match(createNodes({ nodes: [{ id: "KF-FOSSEL", nivel: "keyframe" }] }).error, /universo consolidado/);
  assert.match(createNodes({ nodes: [{ id: "KF-N3", nivel: "keyframe", estado: "azul" }] }).error, /estado inválido/);
  assert.match(createNodes({ nodes: [{ id: "KF-N3", nivel: "keyframe", depende_de: ["NAO-EXISTE"] }] }).error, /não resolvível/);
});


// ── Resolução de workspace root — cadeia git-aware (PROMPT-MCP-AUTOROOT-20260911 / F3) ──
// Cadeia: LILA_WORKSPACE_ROOT > git toplevel do CWD > LILA_GRAFO_ROOT (deprecated) > __dirname/..
// O cwd é HERDADO no spawn — os degraus são exercitados em processo filho com cwd/env
// controlados (mesmo caminho de código: resolveRoot()).

const SERVIDOR = path.resolve(__dirname, "..", "lila-grafo-mcp.cjs");
const ROOT_INSTALACAO = path.resolve(path.dirname(SERVIDOR), "..");

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
    ["-e", `process.stdout.write(require(${JSON.stringify(SERVIDOR)}).resolveRoot());`],
    { cwd: cwd || ROOT_INSTALACAO, env: envFinal, encoding: "utf8" }
  );
  return { root: String(r.stdout || "").trim(), stderr: String(r.stderr || ""), status: r.status };
}

/** Repo git efêmero + worktree linkado (cenário real de paralelismo por worktree). */
function makeGitRepoComWorktree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lila-grafo-root-"));
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lila-grafo-ws-"));
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lila-grafo-fora-"));
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

test("resolveRoot (F3.4): LILA_GRAFO_ROOT segue funcional como legado (degrau 3)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lila-grafo-legado-"));
  try {
    const r = resolveRootChild({ cwd: dir, env: { GIT_CEILING_DIRECTORIES: dir, LILA_GRAFO_ROOT: dir } });
    assert.equal(r.status, 0);
    assert.ok(mesmaPasta(r.root, dir), `esperado ${dir}, obtido ${r.root}`);
    assert.match(r.stderr, /via=LILA_GRAFO_ROOT\(deprecated\)/);
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

test("caminhos(): ledger/grafo defaults derivam do root resolvido por git toplevel (sem env)", () => {
  const chaves = ["LILA_WORKSPACE_ROOT", "LILA_GRAFO_ROOT", "LILA_GRAFO_LEDGER", "LILA_GRAFO_PATH", "LILA_GRAFO_HISTORICO"];
  const antes = chaves.map((k) => process.env[k]);
  for (const k of chaves) delete process.env[k];
  try {
    const toplevel = String(
      spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" }).stdout || ""
    ).trim();
    const c = caminhos();
    assert.ok(mesmaPasta(c.root, toplevel), `root ${c.root} deveria ser o toplevel ${toplevel}`);
    assert.ok(mesmaPasta(c.ledger, path.join(c.root, "LILA-DEV", "planejamento", "decisoes-ledger.json")));
    assert.ok(mesmaPasta(c.atual, path.join(c.root, "LILA-DEV", "planejamento", "grafo.json")));
    assert.ok(mesmaPasta(c.historico, path.join(c.root, "LILA-DEV", "planejamento", "grafo-historico.json")));
  } finally {
    chaves.forEach((k, i) => {
      if (antes[i] === undefined) delete process.env[k]; else process.env[k] = antes[i];
    });
  }
});

