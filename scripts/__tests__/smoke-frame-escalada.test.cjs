"use strict";

// Testes do smoke por frame com escalada conservadora (C7 do
// PATCH-OTIMIZACAO-PR-CI-FAILFAST-20260911). Invariantes: smoke consome o
// classificador canônico (select-tests) e ESCALA para o gate integral quando não
// pode provar seleção segura (classificador indisponível, plano inválido,
// fullSuite, tiers doc-only/doc-gate); escalada NÃO é verde (exit != 0);
// typecheck reprovado reprova o smoke (bug corrigido no C7: o exit era ignorado);
// o JSON mantém as chaves antigas (ok/testsRun/durationMs) usadas por patch-ship.
//
// Hermético: repositório-fixture em tmp (git init + add) + shim de `npx` fora do
// repo (PATH) — nenhum teste roda vitest/tsc reais nem toca a rede.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SMOKE = path.resolve(__dirname, "..", "smoke-frame.cjs");
const SELECT = path.resolve(__dirname, "..", "select-tests.cjs");

function sh(args, cwd) {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `fixture: ${args.join(" ")} falhou — ${r.stderr}`);
}

/** Shim de npx (fora do repo para não virar arquivo não rastreado). */
function shimNpx(exitCode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-shim-"));
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(dir, "npx.cmd"), `@echo shim npx\r\n@exit /b ${exitCode}\r\n`);
  } else {
    const p = path.join(dir, "npx");
    fs.writeFileSync(p, `#!/bin/sh\nexit ${exitCode}\n`);
    fs.chmodSync(p, 0o755);
  }
  return dir;
}

/**
 * Repositório-fixture com smoke-frame (e opcionalmente select-tests) copiados.
 * files: lista de caminhos relativos escritos e staged.
 */
function fixtureRepo({ files, comSelectTests = true }) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-repo-"));
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  fs.copyFileSync(SMOKE, path.join(repo, "scripts", "smoke-frame.cjs"));
  if (comSelectTests) fs.copyFileSync(SELECT, path.join(repo, "scripts", "select-tests.cjs"));
  sh(["git", "init", "-q"], repo);
  // Os scripts copiados são o ARNÊS do teste, não o diff do frame: sem excluí-los
  // do `ls-files --others` o classificador os veria como classe `scripts` e o
  // cenário deixaria de ser singleClass (docs_only/doc_gate nunca disparariam).
  fs.writeFileSync(path.join(repo, ".git", "info", "exclude"), "scripts/\n");
  for (const rel of files) {
    const abs = path.join(repo, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "// fixture\n");
  }
  if (files.length) sh(["git", "add", ...files], repo);
  return repo;
}

function runSmoke(repo, shimDir) {
  const r = spawnSync(process.execPath, [path.join(repo, "scripts", "smoke-frame.cjs")], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH}` },
  });
  const linha = String(r.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  return { status: r.status, stderr: r.stderr || "", json: linha ? JSON.parse(linha) : null };
}

test("C7: nada staged -> exit 2 com reason (contrato antigo preservado)", () => {
  const repo = fixtureRepo({ files: [] });
  const r = runSmoke(repo, shimNpx(0));
  assert.equal(r.status, 2);
  assert.equal(r.json.reason, "nada staged");
});

test("C7: classificador indisponível -> ESCALA (nunca smoke verde por erro de detecção)", () => {
  const repo = fixtureRepo({ files: ["src/lib/x.ts"], comSelectTests: false });
  const r = runSmoke(repo, shimNpx(0));
  assert.equal(r.status, 1);
  assert.equal(r.json.escalou, true);
  assert.match(r.json.motivoEscalada, /indisponível/);
  assert.match(r.json.aviso, /NÃO substitui o gate integral/);
});

test("C7: config compartilhada (package.json) -> ESCALA com o motivo do plano", () => {
  const repo = fixtureRepo({ files: ["package.json"] });
  const r = runSmoke(repo, shimNpx(0));
  assert.equal(r.status, 1);
  assert.equal(r.json.escalou, true);
  assert.match(r.json.motivoEscalada, /config_shared|config de teste/);
});

test("C7: documentação pura (tier 1) -> ESCALA (não há teste a selecionar)", () => {
  const repo = fixtureRepo({ files: ["docs/guia.md"] });
  const r = runSmoke(repo, shimNpx(0));
  assert.equal(r.status, 1);
  assert.equal(r.json.escalou, true);
  assert.match(r.json.motivoEscalada, /doc-only/);
});

test("C7: tier doc-gate (grafo/índices) -> ESCALA apontando o gate integral", () => {
  const repo = fixtureRepo({ files: ["LILA-DEV/planejamento/grafo.json"] });
  const r = runSmoke(repo, shimNpx(0));
  assert.equal(r.status, 1);
  assert.equal(r.json.escalou, true);
  assert.match(r.json.motivoEscalada, /doc-gate/);
});

test("C7: seleção parcial segura -> smoke verde com escopo/selecionados/naoExecutados + aviso", () => {
  const repo = fixtureRepo({ files: ["src/lib/x.ts"] });
  const r = runSmoke(repo, shimNpx(0));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.escalou, false);
  assert.equal(r.json.motivoEscalada, null);
  assert.equal(r.json.escopo.frontend, 1);
  assert.ok(r.json.selecionados.includes("npx tsc --noEmit (raiz)"));
  assert.ok(r.json.naoExecutados.some((s) => /gate integral/.test(s)));
  assert.match(r.json.aviso, /NÃO substitui o gate integral/);
});

test("C7: typecheck reprovado REPROVA o smoke (exit ignorado era gate sumindo)", () => {
  const repo = fixtureRepo({ files: ["src/lib/x.ts"] });
  const r = runSmoke(repo, shimNpx(1));
  assert.equal(r.status, 1);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.escalou, false);
});
