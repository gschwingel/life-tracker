"use strict";

// Testes do gate de drift do ambiente Node (HB-011 — M2 do sweep 2026-09-25).
// Estratégia: fixtures em tmp + spawn do script real com DRIFT_NODE_ROOT (o script
// lê a raiz do repo por padrão) — cobre a decisão end-to-end sem tocar o repo.
// Casos: .nvmrc ausente/vazio, engines divergente, hidden lockfile divergente do
// lock de topo (o drift FÍSICO que originou o HB-011), e o caminho verde.

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "..", "verificar-drift-node.cjs");
const CANON = "22.22.2";

/** Fixture de raiz: `.nvmrc` + package.json(engines) + lock + hidden lock. */
function fixture({
  nvmrc = CANON,
  engines = `>=${CANON}`,
  lockVersion = "1.0.0",
  hiddenVersion = "1.0.0",
  hidden = true,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-node-"));
  if (nvmrc !== null) fs.writeFileSync(path.join(dir, ".nvmrc"), nvmrc + "\n");
  const pkg = { name: "fx" };
  if (engines !== null) pkg.engines = { node: engines };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  const pacotes = { "node_modules/globals": { version: lockVersion } };
  fs.writeFileSync(
    path.join(dir, "package-lock.json"),
    JSON.stringify({ lockfileVersion: 3, packages: pacotes }, null, 2),
  );
  if (hidden) {
    fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "node_modules", ".package-lock.json"),
      JSON.stringify(
        { lockfileVersion: 3, packages: { "node_modules/globals": { version: hiddenVersion } } },
        null,
        2,
      ),
    );
  }
  return dir;
}

function run(dir, extra = []) {
  return spawnSync(process.execPath, [SCRIPT, ...extra], {
    encoding: "utf8",
    env: { ...process.env, DRIFT_NODE_ROOT: dir },
  });
}

test("sem drift: .nvmrc/engines/hidden lock alinhados → exit 0", () => {
  const r = run(fixture());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sem drift/);
});

test("drift FÍSICO (HB-011): hidden lock divergente do lock de topo → exit 1 com os valores", () => {
  const r = run(fixture({ lockVersion: "17.12.0", hiddenVersion: "15.15.0" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /drift físico node_modules/);
  assert.match(r.stderr, /instalado=15\.15\.0 lock=17\.12\.0/);
});

test("engines divergente da canônica → exit 1", () => {
  const r = run(fixture({ engines: ">=20.19.0" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /não referencia a versão canônica/);
});

test(".nvmrc ausente → exit 1 (canônica não declarada)", () => {
  const r = run(fixture({ nvmrc: null }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\.nvmrc ausente/);
});

test("node_modules ausente é AVISO, não falha (gate é de drift, não de instalação)", () => {
  const r = run(fixture({ hidden: false }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /ausente/);
});

test("--json emite o contrato legível por máquina", () => {
  const r = run(fixture(), ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.equal(data.ok, true);
  assert.equal(data.nodeCanonico, CANON);
  assert.equal(data.enginesNode, `>=${CANON}`);
});

test("fixture real do repo: `.nvmrc` vencedor governa o veredito (sem env override)", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(spawnSync(process.execPath, [SCRIPT, "--json"], { encoding: "utf8" }).stdout);
  assert.equal(data.nodeCanonico, fs.readFileSync(path.resolve(__dirname, "..", "..", ".nvmrc"), "utf8").trim());
});
