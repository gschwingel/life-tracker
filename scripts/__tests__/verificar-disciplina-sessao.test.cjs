// scripts/__tests__/verificar-disciplina-sessao.test.cjs
// Self-test da guarda de disciplina de sessão (scripts/verificar-disciplina-sessao.cjs).
// FR-SESSAO-ISOLADA-WORKTREE-20260921 — decisão Igor 2026-09-21.
//
// Cobre: classificador de push-direto (squash "(#NNN)" legítimo vs direto);
// worktree órfã (branch mergeada) vs ativa; parse do porcelain; .sessao.json
// desalinhado; relatório nunca silencioso; main() exit 0 SEMPRE com varredura
// (repo-real) e exit 2 fail-closed.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "verificar-disciplina-sessao.cjs"));
const { classificarCommits, classificarWorktrees, parseWorktrees, parseLog, coletarAchados, formatar, main } = mod;

const BASE = "b".repeat(40);

test("classificarCommits: squash (#NNN) é legítimo; assunto sem (#NNN) é push direto", () => {
  const commits = [
    { hash: "a1", assunto: "ACT: higiene de estado do grafo (#653)" },
    { hash: "a2", assunto: "chore: marcador preto (#658)" },
    { hash: "a3", assunto: "commit direto na main — viola o fluxo" },
    { hash: "a4", assunto: "outro (#65x) falso positivo deve casar? (#12)" },
  ];
  const achados = classificarCommits(commits);
  assert.deepStrictEqual(achados.map((a) => a.detalhe.slice(0, 2)), ["a3"]);
  assert.ok(classificarCommits(parseLog("a1|fix: com PR (#1)\n")).length === 0);
});

test("classificarWorktrees: mergeada+limpa é órfã; ativa, principal, main e suja não são órfãs", () => {
  const entries = [
    { caminho: "/repo", head: BASE, branch: null, principal: true },
    { caminho: "/repo/../lila-velha", head: "c2", branch: "zcode/velha", principal: false },
    { caminho: "/repo/../lila-ativa", head: "c3", branch: "zcode/ativa", principal: false },
    { caminho: "/repo/../lila-main", head: BASE, branch: "main", principal: false },
    { caminho: "/repo/../lila-suja", head: "c4", branch: "zcode/suja", principal: false },
  ];
  const achados = classificarWorktrees(entries, (branch) => ({
    merged: branch !== "zcode/ativa",
    dirty: branch === "zcode/suja",
  }));
  assert.ok(achados.some((a) => a.tipo === "worktree-orfa" && a.detalhe.includes("zcode/velha")), "mergeada+limpa = órfã");
  assert.ok(!achados.some((a) => a.detalhe.includes("zcode/ativa")), "ativa não é achado");
  assert.ok(!achados.some((a) => a.detalhe.includes("lila-main")), "branch main nunca é sessão");
  assert.ok(achados.some((a) => a.tipo === "worktree-mergeada-suja" && a.detalhe.includes("zcode/suja")), "mergeada+suja = alerta separado (não descartar às cegas)");
  assert.ok(!achados.some((a) => a.detalhe.includes("/repo ")), "worktree principal nunca é achado");
});

test("parseWorktrees: porcelain → ordem, main e branch sem refs/heads/", () => {
  const saida = [
    "worktree /repo",
    "HEAD " + BASE,
    "",
    "worktree /repo/../lila-x",
    "HEAD c1",
    "branch refs/heads/zcode/x",
    "",
  ].join("\n");
  const entries = parseWorktrees(saida);
  assert.strictEqual(entries.length, 2);
  assert.ok(entries[0].principal && entries[0].branch === null);
  assert.strictEqual(entries[1].branch, "zcode/x");
  assert.ok(!entries[1].principal);
});

test("coletarAchados: .sessao.json desalinhado (base fora do HEAD) vira achado", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-disciplina-"));
  fs.writeFileSync(path.join(tmp, ".sessao.json"), JSON.stringify({ base: "f".repeat(40), branch: "zcode/x" }));
  const gitExec = (args) => {
    if (args[0] === "log") return "a1|fix: com PR (#1)";
    if (args[0] === "worktree") return "worktree " + tmp + "\nHEAD " + BASE + "\n";
    if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
      if (args[2] === "f".repeat(40)) throw new Error("não ancestral");
      return "";
    }
    return "";
  };
  const achados = coletarAchados({ gitExec, repoRoot: tmp });
  const tipo = achados.find((a) => a.tipo === "sessao-base-desalinhada");
  assert.ok(tipo, "rebase/reset sem re-abertura é visível");
});

test("coletarAchados: branch da própria sessão (tip = base, sem commits) NÃO vira órfã suja", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-disciplina2-"));
  const gitExec = (args) => {
    if (args[0] === "log") return "a1|fix: com PR (#1)";
    if (args[0] === "worktree") return "worktree " + tmp + "\nHEAD " + BASE + "\nbranch refs/heads/zcode/minha-sessao\n";
    if (args[0] === "merge-base") throw new Error("não ancestral");
    if (args[0] === "-C") return ""; // status limpo
    return "";
  };
  const achados = coletarAchados({ gitExec, repoRoot: tmp });
  assert.ok(!achados.some((a) => a.tipo === "worktree-orfa"), "branch não-mergeada não é órfã");
});

test("formatar: nunca silencioso — lista achados e declara a proteção vigente da main", () => {
  const texto = formatar(
    [{ tipo: "push-direto", detalhe: "a3b4c5d6 commit direto" }, { tipo: "worktree-orfa", detalhe: "/lila-velha" }],
    "/repo"
  );
  assert.ok(texto.includes("ACHADO | push-direto"));
  assert.ok(texto.includes("worktree-orfa"));
  assert.ok(texto.includes("NÃO-bloqueante (exit 0)"));
  assert.ok(texto.includes("PROTEGIDA") && texto.includes("enforce_admins"), "proteção vigente declarada");
});

test("push-direto: vigilância vale desde a canonização (2026-09-21) — histórico pré-PR é fóssil", () => {
  assert.strictEqual(mod.DESDE_PADRAO, "2026-09-21");
  const gitExec = (args) => {
    if (args[0] === "log") {
      assert.ok(args.some((a) => a.startsWith("--since=2026-09-21")), "log filtrado pelo desde da canonização");
      return "a1|commit dentro da janela sem PR";
    }
    return "";
  };
  const achados = coletarAchados({ gitExec, repoRoot: "/repo" });
  assert.strictEqual(achados.length, 1);
  assert.strictEqual(achados[0].tipo, "push-direto");
});

test("main() repo-real: exit 0 SEMPRE com varredura concluída (não-bloqueante)", () => {
  const stdoutAntes = process.stdout.write;
  const saida = [];
  process.stdout.write = (c) => { saida.push(String(c)); return true; };
  let codigo;
  try { codigo = main(); } finally { process.stdout.write = stdoutAntes; }
  assert.strictEqual(codigo, 0);
  assert.ok(saida.join("").includes("disciplina de sessão isolada"));
});

// ─── sessao-abandonada (FRAME-LACO-ESTADO-20261002) ─────────────────────────

const DIA = 24 * 60 * 60 * 1000;

test("sessao-abandonada: não-mergeada + dirty + último commit > 7d é achado; recente, clean ou sem ts não é", () => {
  const agora = Date.parse("2026-10-02T12:00:00Z");
  const entries = [
    { caminho: "/repo", head: BASE, branch: null, principal: true },
    { caminho: "/repo/../lila-morto", head: "c1", branch: "frame/morta", principal: false },
    { caminho: "/repo/../lila-viva", head: "c2", branch: "frame/viva", principal: false },
    { caminho: "/repo/../lila-limpa", head: "c3", branch: "frame/limpa", principal: false },
    { caminho: "/repo/../lila-semts", head: "c4", branch: "frame/semts", principal: false },
  ];
  const ts = { "frame/morta": Math.floor((agora - 10 * DIA) / 1000), "frame/viva": Math.floor((agora - 2 * DIA) / 1000), "frame/limpa": Math.floor((agora - 10 * DIA) / 1000), "frame/semts": NaN };
  const achados = classificarWorktrees(
    entries,
    (branch) => ({ merged: false, dirty: branch !== "frame/limpa", ultimoCommitTs: Number.isNaN(ts[branch]) ? undefined : ts[branch] }),
    agora,
    mod.DIAS_ABANDONO_PADRAO
  );
  const mortos = achados.filter((a) => a.tipo === "sessao-abandonada");
  assert.strictEqual(mortos.length, 1, "só a morta é achado");
  assert.ok(mortos[0].detalhe.includes("frame/morta"));
  assert.ok(mortos[0].detalhe.includes("10 dias"));
  assert.ok(!achados.some((a) => a.detalhe.includes("frame/viva")), "recente não é abandono");
  assert.ok(!achados.some((a) => a.detalhe.includes("frame/limpa")), "clean (commitado) é recuperável — não é achado");
  assert.ok(!achados.some((a) => a.detalhe.includes("frame/semts")), "sem timestamp não gera falso positivo");
});

test("sessao-abandonada: limiar --dias é respeitado (8d de idade com --dias=14 não é achado)", () => {
  const agora = Date.parse("2026-10-02T12:00:00Z");
  const entries = [{ caminho: "/w", head: "c1", branch: "frame/x", principal: false }];
  const estado = () => ({ merged: false, dirty: true, ultimoCommitTs: Math.floor((agora - 8 * DIA) / 1000) });
  assert.strictEqual(classificarWorktrees(entries, estado, agora, 7).length, 1);
  assert.strictEqual(classificarWorktrees(entries, estado, agora, 14).length, 0);
  assert.strictEqual(mod.DIAS_ABANDONO_PADRAO, 7, "default da sugestão aprovada");
});

test("coletarAchados: último commit da branch alimenta ultimoCommitTs (falha vira NaN — sem achado)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-disc-abandono-"));
  const gitExec = (args) => {
    if (args[0] === "log" && args[1] === "origin/main") return "";
    if (args[0] === "worktree") {
      return "worktree /repo\nHEAD " + BASE + "\n\nworktree /repo/../lila-morta\nHEAD c1\nbranch refs/heads/frame/morta\n";
    }
    if (args[0] === "merge-base") throw new Error("não mergeada");
    if (args[0] === "-C") return " M arquivo.md"; // dirty
    if (args[0] === "log") return String(Math.floor(Date.now() / 1000)); // %ct
    return "";
  };
  const achados = coletarAchados({ gitExec, repoRoot: tmp, diasAbandono: 7 });
  assert.ok(!achados.some((a) => a.tipo === "sessao-abandonada"), "commit recente NÃO é abandono");
  assert.strictEqual(achados.length, 0);
});
