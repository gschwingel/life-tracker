// scripts/__tests__/verificar-saude-corpus-jev.test.cjs
// PATCH-JEV-CORPUS-GUARD-20261004 — suíte node:test da guarda de saúde do corpus JEV.
// Sem banco: a guarda aceita JEV_CORPUS_ROWS_JSON (fixture) — determinístico. Os casos
// cobrem as TRÊS saídas do contrato: ACHADO (incidente), ✅ (saudável) e FALHA DE
// INFRAESTRUTURA (nunca "verde mudo"). Exit é SEMPRE 0 (não-bloqueante).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const GUARDA = path.join(__dirname, "..", "verificar-saude-corpus-jev.cjs");
const { montarQuery } = require("../verificar-saude-corpus-jev.cjs");

/** Diretórios temporários criados pela suíte — removidos no exit (higiene da suíte). */
const DIRS_TMP = [];
process.on("exit", () => {
  for (const d of DIRS_TMP) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* higiene best-effort: nunca falha a suíte por limpeza */
    }
  }
});

function tmpFile(nome, conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jev-guarda-"));
  DIRS_TMP.push(dir);
  const p = path.join(dir, nome);
  fs.writeFileSync(p, conteudo, "utf8");
  return p;
}

function rodar(args, env = {}) {
  // Env limpo das fontes: cada caso decide explicitamente a fonte (fixture ou nenhuma).
  const base = { ...process.env };
  delete base.JEV_CORPUS_ROWS_JSON;
  delete base.JEV_DATABASE_URL;
  delete base.DATABASE_PUBLIC_URL;
  delete base.DATABASE_URL;
  return spawnSync(process.execPath, [GUARDA, ...args], { encoding: "utf8", env: { ...base, ...env } });
}

function fixtureIncidente(n = 869) {
  return JSON.stringify(
    Array.from({ length: n }, () => ({
      auto_mode: true,
      jev_choice: null,
      jev_confidence: null,
      jev_probabilities: null,
      jev_model: "typesafe/jev-1.13-20260917",
      fallback_reason: "jev_contract_mismatch",
    })),
  );
}

function fixtureSaudavel() {
  return JSON.stringify(
    [0.57, 0.23, 0.61, 0.25, 0.58, 0.35, 0.52].map((c) => ({
      auto_mode: true,
      jev_choice: null,
      jev_confidence: c,
      jev_probabilities: { L1: 0.7, L2: 0.2, L3: 0.1 },
      jev_model: "typesafe/jev-1.13-20260917",
      fallback_reason: "low_confidence",
    })),
  );
}

test("incidente (869 Auto, confiança 100% NULL) produz ACHADO e exit 0", () => {
  const fx = tmpFile("incidente.json", fixtureIncidente());
  const r = rodar([], { JEV_CORPUS_ROWS_JSON: fx });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /ACHADO \| CORPUS_SEM_CONFIANCA/);
  assert.match(r.stdout, /ACHADO \| CORPUS_SEM_PROBABILIDADES/);
  assert.match(r.stdout, /ACHADO \| CORPUS_CONTRACT_MISMATCH_ALTO/);
  assert.match(r.stdout, /AVISO \| CORPUS_SEM_DECISAO/);
  assert.match(r.stdout, /3 ACHADO\(S\)/);
});

test("corpus saudável produz ✅ e exit 0", () => {
  const fx = tmpFile("saudavel.json", fixtureSaudavel());
  const r = rodar([], { JEV_CORPUS_ROWS_JSON: fx });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /✅ corpus saudavel/);
  assert.doesNotMatch(r.stdout, /ACHADO \|/);
});

test("sem fonte de dados => FALHA DE INFRAESTRUTURA (nunca 'sem achados'), exit 0", () => {
  const r = rodar([]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /FALHA DE INFRAESTRUTURA/);
  assert.match(r.stdout, /NAO tratar como "sem achados"/);
  assert.doesNotMatch(r.stdout, /✅/);
});

test("fixture malformada (não-array) => infra, não crash", () => {
  const fx = tmpFile("quebrada.json", '{"nao":"array"}');
  const r = rodar([], { JEV_CORPUS_ROWS_JSON: fx });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /FALHA DE INFRAESTRUTURA/);
  assert.match(r.stdout, /não é array JSON/);
});

test("--help sai 0 e imprime uso", () => {
  const r = rodar(["--help"]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Uso: node scripts\/verificar-saude-corpus-jev\.cjs/);
});

test("montarQuery: janela é NUMÉRICA validada (nunca interpola texto livre)", () => {
  assert.match(montarQuery(7), /interval '7 days'/);
  assert.match(montarQuery(30), /interval '30 days'/);
  assert.match(montarQuery(7), /FROM reasoning_shadow_log/);
  assert.match(montarQuery(7), /json_agg/);
});

test("a guarda NÃO imprime a URL do banco (só fixture/psql no rótulo)", () => {
  const fx = tmpFile("incidente2.json", fixtureIncidente(3));
  const r = rodar([], { JEV_CORPUS_ROWS_JSON: fx, DATABASE_URL: "postgresql://user:segredo@host:5432/db" });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /segredo/);
  assert.doesNotMatch(r.stderr + r.stdout, /segredo/);
});

// ── --loud (decisão Igor 2026-10-08 — watchdog agendado, CRON nunca required check) ──

test("--loud: incidente (ACHADO) sai exit 1", () => {
  const fx = tmpFile("loud-incidente.json", fixtureIncidente(30));
  const r = rodar(["--loud"], { JEV_CORPUS_ROWS_JSON: fx });
  assert.strictEqual(r.status, 1, `esperado 1, saiu ${String(r.status)}: ${r.stdout}`);
  assert.match(r.stdout, /ACHADO \| CORPUS_SEM_CONFIANCA/);
  assert.match(r.stdout, /Modo --loud: exit 1/);
});

test("--loud: corpus saudável sai exit 0", () => {
  const fx = tmpFile("loud-saudavel.json", fixtureSaudavel());
  const r = rodar(["--loud"], { JEV_CORPUS_ROWS_JSON: fx });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /✅ corpus saudavel/);
});

test("--loud: FALHA DE INFRAESTRUTURA sai exit 1 (nunca verde mudo)", () => {
  const r = rodar(["--loud"]);
  assert.strictEqual(r.status, 1, `esperado 1, saiu ${String(r.status)}: ${r.stdout}`);
  assert.match(r.stdout, /FALHA DE INFRAESTRUTURA/);
  assert.match(r.stdout, /Modo --loud: exit 1/);
});

test("--loud: só AVISO (âmbar) sai exit 0 — loud é para defeito, não para calibração", () => {
  // 25 Auto com confiança/probabilities/modelo presentes e SEM mismatch, mas
  // jev_choice sempre null => CORPUS_SEM_DECISAO é AVISO (âmbar), não ACHADO.
  const rows = Array.from({ length: 25 }, () => ({
    auto_mode: true,
    jev_choice: null,
    jev_confidence: 0.42,
    jev_probabilities: { L1: 0.5, L2: 0.3, L3: 0.2 },
    jev_model: "typesafe/jev-1.13-20260917",
    fallback_reason: "low_confidence",
  }));
  const fx = tmpFile("loud-aviso.json", JSON.stringify(rows));
  const r = rodar(["--loud"], { JEV_CORPUS_ROWS_JSON: fx });
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /AVISO \| CORPUS_SEM_DECISAO/);
});

test("sem --loud o contrato padrão permanece: incidente sai exit 0", () => {
  const fx = tmpFile("padrao-incidente.json", fixtureIncidente(30));
  const r = rodar([], { JEV_CORPUS_ROWS_JSON: fx });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /Alerta NAO-bloqueante \(exit 0\)/);
});
