// scripts/__tests__/gerar-indice-manifest.test.cjs
// Testes do gerador do indice do AI-Manifest (node:test).
// Cobre: parse de secoes (faixas, ultima = EOF, header aninhado), buildIndex
// (formato + version do meta), drift detection (--check exit 1/0), ausencia de cauda meta_*.
// Os testes NUNCA tocam os arquivos reais (env MANIFEST_PATH/MANIFEST_INDEX_PATH).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("node:child_process");

const { parseSections, buildIndex, extractVersion } = require("../gerar-indice-manifest.cjs");

const SCRIPT = path.join(__dirname, "..", "gerar-indice-manifest.cjs");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gerar-indice-manifest-"));
}

// Fixture minimalista cobrindo headers reais, aninhado (#0.1) e NOTA (sem cauda meta_*).
const FIXTURE = `# AI-PROJECT-MANIFEST — Lila C137
meta: format=AI-AI | version=2.25 | last_update=2026-08-27 | status=APPROVED

#0 RUNTIME CONTEXT
concept: entry bootstrap auth routes state chat_flow save_to_drive env persistence

#0.1 SOFT CONTEXT
concept: softcontext inject

#1 IDENTITY
name: Lila C137

#15 AREAS TATICAS
concept: particionamento documentacao

# NOTA LIMPEZA-OS (2026-08-26)
ESPECIALISTAS: removidos
`;

test("parseSections: faixas corretas (startLine = header, endLine = proximo header - 1)", () => {
  const sections = parseSections(FIXTURE);
  // #0 -> linhas 4-6 (proximo header #0.1 na linha 7)
  const s0 = sections.find((s) => s.name === "0");
  assert.equal(s0.startLine, 4);
  assert.equal(s0.endLine, 6);
  // #0.1 -> linhas 7-9 (proximo header #1 na linha 10)
  const s01 = sections.find((s) => s.name === "0.1");
  assert.equal(s01.startLine, 7);
  assert.equal(s01.endLine, 9);
  // #1 -> linhas 10-12 (proximo header #15 na linha 13)
  const s1 = sections.find((s) => s.name === "1");
  assert.equal(s1.startLine, 10);
  assert.equal(s1.endLine, 12);
});

test("parseSections: cauda meta_* extinta — nenhuma pseudo-secao; NOTA vai ate EOF", () => {
  const sections = parseSections(FIXTURE);
  // Ausencia de tail: nenhuma secao sintetica de changelog e criada.
  assert.ok(!sections.some((s) => s.name.includes("cauda")), "nenhuma pseudo-secao de cauda");
  assert.ok(!sections.some((s) => s.header.includes("cauda")), "nenhum header de cauda");

  const nota = sections.find((s) => s.name === "NOTA LIMPEZA-OS");
  assert.ok(nota, "NOTA LIMPEZA-OS deve existir");
  // Fixture tem 17 linhas reais (newline final descartado pelo parser) -> NOTA de 16 a 17 = EOF
  assert.equal(nota.startLine, 16);
  assert.equal(nota.endLine, 17);
  // A desc crua do parseSections nao tem marcador — o marcador e adicionado no buildIndex.
  assert.equal(nota.desc, "ESPECIALISTAS: removidos");
});

test("parseSections: linha com forma de cauda legada e conteudo normal (sem split)", () => {
  // DECOY (prova de ausencia): a forma "meta_<chave>: <data> | ..." NAO deve mais
  // iniciar pseudo-secao — permanece conteudo integral da secao que a contem.
  const comDecoy = [
    "#0 RUNTIME CONTEXT",
    "concept: x",
    "meta_updated_001: 2026-08-27 | decoy",
    "",
    "#1 IDENTITY",
    "name: Lila",
  ].join("\n");
  const sections = parseSections(comDecoy);
  assert.equal(sections.length, 2);
  assert.ok(!sections.some((s) => s.name.includes("cauda")));
  const s0 = sections.find((s) => s.name === "0");
  assert.equal(s0.startLine, 1);
  assert.equal(s0.endLine, 4); // o decoy permanece dentro da secao #0
});

test("parseSections: ultima secao = EOF e desc = primeira linha de conteudo truncada", () => {
  const sections = parseSections(FIXTURE);
  const s0 = sections.find((s) => s.name === "0");
  assert.equal(s0.desc, "concept: entry bootstrap auth routes state chat_flow save_to_drive env persisten");
  const s01 = sections.find((s) => s.name === "0.1");
  assert.equal(s01.desc, "concept: softcontext inject");
});

test("buildIndex: formato fixo + version extraida do meta", () => {
  const index = buildIndex(FIXTURE);
  const lines = index.split("\n");
  assert.equal(lines[0], "# AI-PROJECT-MANIFEST-INDEX");
  assert.match(lines[1], /meta: \{source=docs\/AI-PROJECT-MANIFEST\.md \| version=2\.25 \| last_update=\d{4}-\d{2}-\d{2} \| status=APPROVED \| authority=AI-PROJECT-MANIFEST\.md A1 \| generated=scripts\/gerar-indice-manifest\.cjs/);
  // HB-015: a data espelha a FONTE (nunca o relogio) e `generated_at` foi removido.
  assert.match(lines[1], /last_update=2026-08-27/);
  assert.doesNotMatch(lines[1], /generated_at/);
  assert.match(lines[4], /#0 RUNTIME CONTEXT \| L4-6 \| concept: entry bootstrap/);
  assert.match(lines[lines.length - 2], /# NOTA LIMPEZA-OS \(2026-08-26\) \| L16-17 \| ESPECIALISTAS: removidos — NAO consultar p\/ runtime/);
  // Ausencia de tail: o indice nao emite pseudo-secao nem linha de changelog meta_*.
  assert.ok(!index.includes("cauda"), "indice nao pode conter secao de cauda");
  assert.ok(!/^meta_[a-z0-9_]+:/m.test(index), "indice nao pode conter linha de changelog meta_*");
});

test("HB-015: last_update espelha a FONTE e o indice e deterministico (sem relogio)", () => {
  const a = buildIndex(FIXTURE);
  const b = buildIndex(FIXTURE);
  assert.equal(a, b, "mesma fonte -> mesmo byte-a-byte");
  assert.ok(a.includes("last_update=2026-08-27"), "data deve vir da fonte");
  const hojeUTC = new Date().toISOString().slice(0, 10);
  // Fixture declara 2026-08-27: a data do relogio de parede nunca entra no artefato.
  assert.ok(!a.includes(hojeUTC), "artefato nao pode carregar a data do relogio");
});

test("HB-015: fonte sem last_update cai no fallback deterministico (ultimo commit)", () => {
  const semData = FIXTURE.replace(" | last_update=2026-08-27", "");
  const meta = buildIndex(semData).split("\n")[1];
  assert.match(meta, /last_update=\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(meta, /generated_at/);
});

test("HB-015: --check segue exit 1 quando a data da FONTE muda (drift real nao mascarado)", () => {
  const dir = tmpDir();
  const manifestPath = path.join(dir, "manifest.md");
  const indexPath = path.join(dir, "index.md");
  const envBase = { ...process.env, MANIFEST_PATH: manifestPath, MANIFEST_INDEX_PATH: indexPath };
  const cwd = path.join(__dirname, "..", "..");

  fs.writeFileSync(manifestPath, FIXTURE);
  execFileSync(process.execPath, [SCRIPT], { env: envBase, cwd });

  fs.writeFileSync(manifestPath, FIXTURE.replace("last_update=2026-08-27", "last_update=2026-08-28"));
  let driftExit = null;
  try {
    execFileSync(process.execPath, [SCRIPT, "--check"], { env: envBase, cwd });
  } catch (err) {
    driftExit = err.status;
  }
  assert.equal(driftExit, 1, "--check deve acusar drift real da data da fonte");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("extractVersion: extrai do meta do manifesto", () => {
  assert.equal(extractVersion(FIXTURE), "2.25");
  assert.equal(extractVersion("meta: format=x | version=1.84 | status=APPROVED"), "1.84");
  assert.equal(extractVersion("sem version"), "unknown");
});

test("--check: exit 1 quando indice diverge, exit 0 quando igual (child process)", async () => {
  const dir = tmpDir();
  const manifestPath = path.join(dir, "manifest.md");
  const indexPath = path.join(dir, "index.md");
  fs.writeFileSync(manifestPath, FIXTURE);

  const envBase = { ...process.env, MANIFEST_PATH: manifestPath, MANIFEST_INDEX_PATH: indexPath };

  // 1) Gera o indice
  execFileSync(process.execPath, [SCRIPT], { env: envBase, cwd: path.join(__dirname, "..", "..") });

  // 2) --check exit 0 (igual)
  execFileSync(process.execPath, [SCRIPT, "--check"], { env: envBase, cwd: path.join(__dirname, "..", "..") });

  // 3) Altera o manifesto (drift) -> exit 1 no --check
  fs.writeFileSync(manifestPath, FIXTURE.replace("version=2.25", "version=2.26"));
  let driftExit = null;
  try {
    execFileSync(process.execPath, [SCRIPT, "--check"], { env: envBase, cwd: path.join(__dirname, "..", "..") });
  } catch (err) {
    driftExit = err.status;
  }
  assert.equal(driftExit, 1, "--check deve retornar exit 1 quando o manifesto diverge");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("--help: exit 0 sem tocar arquivos", () => {
  execFileSync(process.execPath, [SCRIPT, "--help"], { cwd: path.join(__dirname, "..", "..") });
});

