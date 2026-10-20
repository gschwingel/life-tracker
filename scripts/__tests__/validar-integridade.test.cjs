// scripts/__tests__/validar-integridade.test.cjs
// Suíte node:test para validar-integridade.cjs (dívida registrada — scripts/README.md).
// Estratégia: o script resolve caminhos relativos ao cwd → spawnSync com `cwd` em sandbox
// temporário. Cobre o modo --indices-only (read-only): caso válido (exit 0) e corrupções
// (exit 1). O modo completo (grafo/logs/ownership) tem ruído perene e não é alvo aqui.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const VALIDAR = path.join(__dirname, "..", "validar-integridade.cjs");

function rodar(args, cwd) {
  return spawnSync(process.execPath, [VALIDAR, ...args], { encoding: "utf8", cwd });
}

function sandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "valint-"));
}

// Fixture válida mínima de índices: vetorial sidecar↔bin íntegro.
// REANC-L4 / I1 (2026-09-20): a fixture do índice reverso saiu com a superfície
// (indice-reverso/ + gerador + lookup + lib/fragmentacao.cjs morreram).
function fixtureValida(tmp) {
  fs.writeFileSync(path.join(tmp, "indice-vetorial.json"), JSON.stringify({
    dimensions: 1536,
    chunks: [{ offset: 0, length: 1536 }],
  }));
  fs.writeFileSync(path.join(tmp, "indice-vetorial.bin"), Buffer.alloc(1536 * 4));
}

test("validar-integridade --help sai com 0 e imprime uso", () => {
  const tmp = sandbox();
  try {
    const r = rodar(["--help"], tmp);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Uso: node scripts\/validar-integridade\.cjs \[--indices-only\] \[--full\]/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("validar-integridade --indices-only com índices íntegros sai com 0", () => {
  const tmp = sandbox();
  try {
    fixtureValida(tmp);
    const r = rodar(["--indices-only"], tmp);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Índice vetorial sidecar↔bin consistente \(1 chunks × 1536d × 4 = 6144 bytes\)/);
    assert.match(r.stdout, /Total: 🟢 OK — 0 erro\(s\) encontrado\(s\)/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test("validar-integridade --indices-only detecta vetorial dessincronizado (exit 1)", () => {
  const tmp = sandbox();
  try {
    fixtureValida(tmp);
    // Corrompe: sidecar espera 6144 bytes, .bin tem 100
    fs.writeFileSync(path.join(tmp, "indice-vetorial.bin"), Buffer.alloc(100));
    const r = rodar(["--indices-only"], tmp);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout, /Índice vetorial dessincronizado: sidecar espera 6144 bytes, \.bin tem 100/);
    assert.match(r.stdout, /Total: 🔴 FALHA/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
