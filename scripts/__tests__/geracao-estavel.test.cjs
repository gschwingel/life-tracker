"use strict";
// Suite: política skip-write (fim do churn de timestamp — drenagem 2026-10-06).
// Regen com conteúdo-útil idêntico NÃO reescreve o gerado: o timestamp congela
// na última mudança real de conteúdo e a regen dupla em árvore imutável produz
// diff ZERO. Validadores seguem content-based (stripam/mascaram os voláteis).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lerExistente, jsonIgualSemVolateis, textoIgualMascarado } = require("../lib/conteudo-estavel.cjs");

const VOLATEIS = new Set(["geradoEm", "generatedAt", "data_geracao"]);
const RE_GERADO = /(<!--\s*gerado:\s*)(\S+)(\s*\|)/;
const WORKTREE = path.join(__dirname, "..", "..");

// ── lib: JSON ─────────────────────────────────────────────────────────────────
test("jsonIgualSemVolateis: igual módulo geradoEm em qualquer nível → true", () => {
  const novo = { geradoEm: "2026-10-06T12:00:00Z", total: 3, nos: { a: { geradoEm: "X", v: 1 } } };
  const existente = JSON.stringify({ geradoEm: "2026-01-01T00:00:00Z", total: 3, nos: { a: { geradoEm: "Y", v: 1 } } });
  assert.equal(jsonIgualSemVolateis(novo, existente, VOLATEIS), true);
});

test("jsonIgualSemVolateis: diferença real de conteúdo → false", () => {
  const novo = { geradoEm: "2026-10-06T12:00:00Z", total: 3 };
  const existente = JSON.stringify({ geradoEm: "2026-10-06T12:00:00Z", total: 4 });
  assert.equal(jsonIgualSemVolateis(novo, existente, VOLATEIS), false);
});

test("jsonIgualSemVolateis: existente corrompido (marcador de conflito) → false (auto-cura)", () => {
  assert.equal(jsonIgualSemVolateis({ a: 1 }, "<<<<<<< HEAD", VOLATEIS), false);
  assert.equal(jsonIgualSemVolateis({ a: 1 }, "{ quebrado", VOLATEIS), false);
});

test("jsonIgualSemVolateis: existente ausente → false (primeiro render escreve)", () => {
  assert.equal(jsonIgualSemVolateis({ a: 1 }, null, VOLATEIS), false);
});

test("lerExistente: ausente = null, presente = conteúdo", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "estavel-t-"));
  const f = path.join(d, "x.json");
  assert.equal(lerExistente(f), null);
  fs.writeFileSync(f, "conteudo");
  assert.equal(lerExistente(f), "conteudo");
});

// ── lib: texto mascarado ──────────────────────────────────────────────────────
test("textoIgualMascarado: igual módulo do valor de gerado: → true (tolerante a CRLF/EOF)", () => {
  const novo = "# doc\n\n<!-- gerado: 2026-10-06T12:00:00-03:00 | arvore_hash: abc | arquivos: 1 | fonte: x -->\n";
  const existente = "# doc\r\n\r\n<!-- gerado: 2026-01-01T00:00:00Z | arvore_hash: abc | arquivos: 1 | fonte: x -->";
  assert.equal(textoIgualMascarado(novo, existente, RE_GERADO), true);
});

test("textoIgualMascarado: arvore_hash mudou (árvore mudou de verdade) → false", () => {
  const novo = "<!-- gerado: 2026-10-06T12:00:00Z | arvore_hash: NOVO | arquivos: 2 | fonte: x -->";
  const existente = "<!-- gerado: 2026-01-01T00:00:00Z | arvore_hash: velho | arquivos: 1 | fonte: x -->";
  assert.equal(textoIgualMascarado(novo, existente, RE_GERADO), false);
});

// ── integração: gerar-indice-rastreabilidade (repo real + tmp via INDICES_OUT_DIR) ──
function tmpOut() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "churn-t-"));
  fs.mkdirSync(path.join(d, "LILA-DEV"), { recursive: true });
  return d;
}
function rodarRastreabilidade(outDir) {
  return spawnSync(
    process.execPath,
    [path.join(WORKTREE, "scripts", "gerar-indice-rastreabilidade.cjs")],
    { cwd: WORKTREE, encoding: "utf8", env: { ...process.env, INDICES_OUT_DIR: outDir } },
  );
}

test("integração: regen sobre cópia idêntica (geradoEm velho) = arquivo intocado BYTE-A-BYTE", () => {
  const out = tmpOut();
  const alvo = path.join(out, "LILA-DEV", "indice-rastreabilidade.json");
  const real = JSON.parse(fs.readFileSync(path.join(WORKTREE, "LILA-DEV", "indice-rastreabilidade.json"), "utf8"));
  real.geradoEm = "2020-01-01T00:00:00.000Z";
  const semente = JSON.stringify(real, null, 2);
  fs.writeFileSync(alvo, semente);

  const r = rodarRastreabilidade(out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /conteúdo idêntico/);
  assert.equal(fs.readFileSync(alvo, "utf8"), semente);
});

test("integração: mudança real de conteúdo reescreve com geradoEm fresco", () => {
  const out = tmpOut();
  const alvo = path.join(out, "LILA-DEV", "indice-rastreabilidade.json");
  fs.writeFileSync(alvo, JSON.stringify({ geradoEm: "2020-01-01T00:00:00.000Z", totalNos: 0, nos: {} }, null, 2));

  const r = rodarRastreabilidade(out);
  assert.equal(r.status, 0, r.stderr);
  const escrito = JSON.parse(fs.readFileSync(alvo, "utf8"));
  assert.ok(escrito.totalNos > 0);
  assert.notEqual(escrito.geradoEm, "2020-01-01T00:00:00.000Z");
});

// ── integração (fixture): CONTRATO do gerador do manifest — determinismo + máscara ──
// FRONTEIRA (FRAME-GATES-ROTINAS-DIARIAS-20261015 D1/D2 + PATCH-FRESCOR-SUITE-FIXTURE-20261016):
// a relação "commitado == render" é do watchdog textual DIÁRIO (dono do frescor) — esta suíte
// não afirma mais frescor do repo real. O que se cobre aqui: mesma fonte → mesmo conteúdo fora
// do `gerado:`; e a máscara mascara SÓ o volátil (conteúdo real continua mordendo).
test("integração (fixture): render do manifest é determinístico e só o `gerado:` é volátil", () => {
  const gerador = require("../gerar-manifest-esqueleto.cjs");
  const yaml = require("js-yaml");
  const fonte = yaml.load(fs.readFileSync(path.join(WORKTREE, "docs", "manifest-fonte.yaml"), "utf8"));
  const md = gerador.render(fonte);
  assert.equal(textoIgualMascarado(md, gerador.render(fonte), RE_GERADO), true, "render não é determinístico");

  const pert = md.replace(RE_GERADO, "$1" + "1999-01-01T00:00:00Z" + "$3");
  assert.notEqual(pert, md, "render sem rodapé `gerado:` — o caso volátil não valeria");
  assert.equal(textoIgualMascarado(md, pert, RE_GERADO), true, "timestamp volátil deveria ser mascarado");
  assert.equal(
    textoIgualMascarado(md + "\nlinha nova\n", pert, RE_GERADO),
    false,
    "conteúdo real NUNCA é mascarado",
  );
});
