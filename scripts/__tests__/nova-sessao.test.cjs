// scripts/__tests__/nova-sessao.test.cjs
// Self-test da abertura de sessão isolada (scripts/nova-sessao.cjs).
// FR-SESSAO-ISOLADA-WORKTREE-20260921 — decisão Igor 2026-09-21.
//
// Cobre: validação de branch; fluxo feliz com git/fs injetados (fetch → base
// do remote → worktree → .sessao.json → bootstrap); recusas explícitas
// (branch existente, caminho existente, fetch indisponível, branch inválida);
// main() fail-closed. Sem operação git real.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "nova-sessao.cjs"));
const { validarBranch, caminhoDefault, abrirSessao, main } = mod;

const BASE = "a".repeat(40);

function ambienteFake() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-nova-sessao-"));
  const root = path.join(tmp, "repo");
  fs.mkdirSync(root);
  const comandos = [];
  const gitExec = (args) => {
    comandos.push(args.join(" "));
    if (args[0] === "fetch") return "";
    if (args[0] === "rev-parse" && args[1] === "origin/main") return BASE + "\n";
    if (args[0] === "rev-parse" && args[1] === "--verify") throw new Error("não existe (esperado no fluxo feliz)");
    if (args[0] === "worktree") {
      // materializa o destino no fs fake (o git real faria isso)
      const i = args.indexOf("-b");
      const destino = args[i + 2];
      fs.mkdirSync(destino, { recursive: true });
      return "";
    }
    return "";
  };
  const bootstrapChamados = [];
  const execNode = (script, a) => { bootstrapChamados.push(script + " " + a.join(" ")); return ""; };
  return { tmp, root, comandos, bootstrapChamados, gitExec, execNode };
}

test("validarBranch: exige prefixo/tema, sem espaços, charset seguro", () => {
  assert.strictEqual(validarBranch("zcode/tema"), null);
  assert.strictEqual(validarBranch("patch/fix-1.2"), null);
  assert.ok(validarBranch(""));
  assert.ok(validarBranch("sem-slash"));
  assert.ok(validarBranch("zcode/tema com espaço"));
  assert.ok(validarBranch("/sem-prefixo"));
  assert.ok(validarBranch("zcode/"));
  assert.ok(validarBranch("zcode/tema;rm -rf"));
  assert.ok(validarBranch("zcode/a..b"));
});

test("caminhoDefault: ../lila-<tema> a partir da raiz do repo", () => {
  const p = caminhoDefault("/c/lila-zcode", "zcode/Meu_Tema-1");
  assert.ok(p.endsWith("/lila-meu_tema-1") || p.endsWith("\\lila-meu_tema-1"));
});

test("fluxo feliz: fetch → base do remote → worktree → .sessao.json → bootstrap", () => {
  const env = ambienteFake();
  const agora = new Date("2026-09-21T12:00:00Z");
  const sessao = abrirSessao({
    branch: "zcode/teste-sessao",
    caminho: path.join(env.tmp, "sessao-x"),
    gitExec: env.gitExec,
    execNode: env.execNode,
    fsImpl: fs,
    repoRoot: env.root,
    agora,
  });
  assert.strictEqual(sessao.base, BASE);
  assert.strictEqual(sessao.branch, "zcode/teste-sessao");
  assert.ok(env.comandos.some((c) => c.startsWith("fetch origin main")), "fetch antes de tudo");
  assert.ok(env.comandos.some((c) => c.startsWith("worktree add -b zcode/teste-sessao")), "worktree ancorada na base");
  const gravado = JSON.parse(fs.readFileSync(path.join(env.tmp, "sessao-x", ".sessao.json"), "utf8"));
  assert.strictEqual(gravado.base, BASE, "GATE-BASE gravado como fato");
  assert.strictEqual(gravado.branch, "zcode/teste-sessao");
  assert.ok(env.bootstrapChamados.length === 1, "bootstrap de ambiente executado");
});

test("FRAME-LF-CANONICO: sessao fixa core.autocrlf=false no config local do repo", () => {
  const env = ambienteFake();
  abrirSessao({
    branch: "zcode/teste-autocrlf",
    caminho: path.join(env.tmp, "sessao-y"),
    gitExec: env.gitExec,
    execNode: env.execNode,
    fsImpl: fs,
    repoRoot: env.root,
  });
  assert.ok(
    env.comandos.some((c) => c === "config core.autocrlf false"),
    "autocrlf=false fixado no config local (registro #1153: CRLF da maquina global poluiu medicoes wc dos geradores)"
  );
});

test("recusa: branch já existente (sessão exige trabalho novo)", () => {
  const env = ambienteFake();
  const gitExec = (args) => {
    if (args[0] === "rev-parse" && args[1] === "--verify") return BASE; // branch existe
    if (args[0] === "fetch") return "";
    if (args[0] === "rev-parse" && args[1] === "origin/main") return BASE;
    return "";
  };
  assert.throws(
    () => abrirSessao({ branch: "zcode/velha", gitExec, execNode: env.execNode, fsImpl: fs, repoRoot: env.root }),
    /já existe/
  );
});

test("recusa: caminho destino já existe", () => {
  const env = ambienteFake();
  const destino = path.join(env.tmp, "ocupado");
  fs.mkdirSync(destino);
  assert.throws(
    () => abrirSessao({ branch: "zcode/nova", caminho: destino, gitExec: env.gitExec, execNode: env.execNode, fsImpl: fs, repoRoot: env.root }),
    /já existe/
  );
});

test("recusa: fetch indisponível — nunca segue com base duvidosa", () => {
  const env = ambienteFake();
  const gitExec = (args) => { if (args[0] === "fetch") throw new Error("rede indisponível"); return BASE; };
  assert.throws(
    () => abrirSessao({ branch: "zcode/nova", gitExec, execNode: env.execNode, fsImpl: fs, repoRoot: env.root }),
    /rede indisponível/
  );
});

test("recusa: branch inválida antes de qualquer operação", () => {
  const env = ambienteFake();
  assert.throws(
    () => abrirSessao({ branch: "sem-slash", gitExec: env.gitExec, execNode: env.execNode, fsImpl: fs, repoRoot: env.root }),
    /prefixo/
  );
  assert.strictEqual(env.comandos.length, 0, "nada executou");
});

test("main(): branch ausente sai com exit 1 e instrução de uso", () => {
  const stderrAntes = process.stderr.write;
  const saida = [];
  process.stderr.write = (c) => { saida.push(String(c)); return true; };
  try { assert.strictEqual(main([]), 1); } finally { process.stderr.write = stderrAntes; }
  assert.ok(saida.join("").includes("uso:"), "instrução de uso no stderr");
});

// ─── superficiarGuarda (FRAME-LACO-ESTADO-20261002) ─────────────────────────

test("superficiarGuarda: imprime achados da guarda e retorna true", () => {
  const stdoutAntes = process.stdout.write;
  const saida = [];
  process.stdout.write = (c) => { saida.push(String(c)); return true; };
  try {
    const ok = mod.superficiarGuarda("/repo", () => "ACHADO | sessao-abandonada | /lila-morta (frame/morta …)\nResultado: 1 achado(s).");
    assert.strictEqual(ok, true);
  } finally { process.stdout.write = stdoutAntes; }
  const texto = saida.join("");
  assert.ok(texto.includes("guarda de disciplina"), "cabeçalho da surface");
  assert.ok(texto.includes("sessao-abandonada"), "achado impresso");
});

test("superficiarGuarda: guarda sem achados imprime a varredura; falha de infraestrutura NUNCA bloqueia a abertura", () => {
  const stdoutAntes = process.stdout.write;
  const saida = [];
  process.stdout.write = (c) => { saida.push(String(c)); return true; };
  try {
    assert.strictEqual(mod.superficiarGuarda("/repo", () => "Nenhum achado — disciplina de sessão íntegra.\n"), true);
    assert.strictEqual(mod.superficiarGuarda("/repo", () => { throw new Error("git indisponível"); }), false);
  } finally { process.stdout.write = stdoutAntes; }
  const texto = saida.join("");
  assert.ok(texto.includes("Nenhum achado"));
  assert.ok(texto.includes("best-effort, nunca bloqueia"), "falha avisada, abertura preservada");
});
