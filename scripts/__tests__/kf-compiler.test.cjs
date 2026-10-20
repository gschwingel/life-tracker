// scripts/__tests__/kf-compiler.test.cjs
// Fase A2 (fase de estado): prova dos gates G1..G4 do compilador de KFs-área.
// v1.3 (deliberate event 2026-09-18): fail-closed do ESTADO (FR viva exige ESTADO) + isenção de
// tombstones — extensão da suíte (nunca redução): o contrato LEGACY_SEM_ESTADO do B1 foi
// REESCRITO e os campos `diagnosticos`/`legacy_sem_estado` morreram no schema de saída.
// Runner do repo: npm run test:scripts (node --test sobre scripts/__tests__/*.test.cjs).
// Tabela fixture -> gate -> exit provada aqui; determinismo provado por recompilacao (2x).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("node:child_process");

const COMPILER = path.join(__dirname, "..", "kf-compiler.cjs");
const FIXTURES = path.join(__dirname, "fixtures", "kf");
const FONTE = path.join(FIXTURES, "fonte-mini.yaml");

function tmpDir(prefixo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
}

// Roda o compilador (nunca interativo) e devolve { status, rel } com o relatório JSON parseado.
function rodar(args) {
  const r = spawnSync(process.execPath, [COMPILER, ...args], { encoding: "utf8" });
  let rel;
  try {
    rel = JSON.parse(r.stdout);
  } catch {
    rel = { bruto: r.stdout, stderr: r.stderr };
  }
  return { status: r.status, rel };
}

function compilar(fixture, out) {
  return rodar(["--fonte", FONTE, "--decisoes", path.join(FIXTURES, fixture), "--out", out]);
}

// Copia uma fixture para um diretorio temporario (testes de mutacao nao tocam o repo).
function copiarFixture(fixture) {
  const destino = tmpDir("kf-fix-");
  for (const nome of fs.readdirSync(path.join(FIXTURES, fixture))) {
    fs.copyFileSync(path.join(FIXTURES, fixture, nome), path.join(destino, nome));
  }
  return destino;
}

const CASOS_GATE = [
  ["area-ausente", "G1", "AREA_TATICA ausente"],
  ["area-duplicada", "G1", "AREA_TATICA duplicada"],
  ["area-invalida", "G1", "fora do particionamento"],
  ["supersede-orfao", "G2", "ID inexistente"],
  ["supersede-ciclo", "G2", "ciclico"],
];

for (const [fixture, gate, trecho] of CASOS_GATE) {
  test("fixture " + fixture + " -> " + gate + " violado, exit 1", () => {
    const out = tmpDir("kf-out-");
    const { status, rel } = compilar(fixture, out);
    assert.equal(status, 1, "exit code esperado 1: " + JSON.stringify(rel));
    assert.equal(rel.ok, false);
    const v = rel.violacoes.find((x) => x.gate === gate);
    assert.ok(v, "violacao " + gate + " ausente: " + JSON.stringify(rel.violacoes));
    assert.match(v.detalhe, new RegExp(trecho));
    assert.equal(fs.existsSync(path.join(out, "kf-doc.md")), false, "gate violado nao escreve KF");
  });
}

test("fixture valido -> exit 0, um KF por KF da fonte, secoes completas", () => {
  const out = tmpDir("kf-out-");
  const { status, rel } = compilar("valido", out);
  assert.equal(status, 0, "exit 0 esperado: " + JSON.stringify(rel));
  assert.deepEqual(
    rel.kfs.map((k) => k.slug),
    ["KF-DOC", "KF-INDICES", "KF-BACKEND"]
  );
  assert.deepEqual(
    rel.gates.map((g) => g.gate),
    ["G1", "G2", "G3", "G4"]
  );
  const doc = fs.readFileSync(path.join(out, "kf-doc.md"), "utf8");
  for (const secao of ["ESCOPO", "FRONTEIRAS", "DECISOES VIGENTES", "COMPORTAMENTOS ESPERADOS", "DECISOES DEPRECADAS", "MAPA DE ARQUIVOS"]) {
    assert.ok(doc.includes("## " + secao), "secao ausente: " + secao);
  }
  assert.ok(!/farol/i.test(doc), "KF-area nao carrega farol (§3)");
  assert.match(doc, /- FR-DOC-01\.D1 \| executor: FR-DOC-01\.D2 \| motivo: evolucao \| origem: framework/);
  const vazio = fs.readFileSync(path.join(out, "kf-backend.md"), "utf8");
  assert.match(vazio, /## DECISOES VIGENTES\n {2}\(none\)/, "secao vazia sai explicita, nunca omitida");
});

test("fixture framework-origin -> ORIGEM framework e projeto preservadas na saida", () => {
  const out = tmpDir("kf-out-");
  const { status } = compilar("framework-origin", out);
  assert.equal(status, 0);
  const doc = fs.readFileSync(path.join(out, "kf-doc.md"), "utf8");
  const back = fs.readFileSync(path.join(out, "kf-backend.md"), "utf8");
  assert.match(doc, /origem: framework/);
  assert.match(back, /origem: projeto/);
});

test("G3 determinismo: compilar 2x sobre a mesma arvore -> bytes identicos", () => {
  const a = tmpDir("kf-det-a-");
  const b = tmpDir("kf-det-b-");
  assert.equal(compilar("valido", a).status, 0);
  assert.equal(compilar("valido", b).status, 0);
  const nomes = fs.readdirSync(a).sort();
  assert.deepEqual(nomes, fs.readdirSync(b).sort());
  for (const nome of nomes) {
    assert.equal(fs.readFileSync(path.join(a, nome), "utf8"), fs.readFileSync(path.join(b, nome), "utf8"), nome);
  }
});

test("G4 frescor: compile grava hash_fonte; --check fica fresco; arvore mutada -> stale exit 1", () => {
  const registros = copiarFixture("hash-stale");
  const out = tmpDir("kf-out-");
  const args = ["--fonte", FONTE, "--decisoes", registros, "--out", out];
  assert.equal(rodar(args).status, 0);
  const fresco = rodar([...args, "--check"]);
  assert.equal(fresco.status, 0, "check sem mutacao deve ser fresco: " + JSON.stringify(fresco.rel));
  assert.equal(fresco.rel.modo, "check");
  const arquivo = path.join(registros, fs.readdirSync(registros)[0]);
  fs.appendFileSync(arquivo, "\nID: FR-DOC-07.D2\nDECISAO: Decisao nova pos-compile\nTIPO: tecnica\nAREA_TATICA: KF-DOC\nTOMADA_POR: Lila\nORIGEM: projeto\nSUPERSEDE: NENHUMA\nVALIDACAO: gate\nESTADO: PRESENTE\n");
  const stale = rodar([...args, "--check"]);
  assert.equal(stale.status, 1, "arvore mutada deve acusar stale");
  const v = stale.rel.violacoes.find((x) => x.gate === "G4");
  assert.ok(v, "violacao G4 ausente: " + JSON.stringify(stale.rel.violacoes));
  assert.match(v.detalhe, /stale/);
});


test("parse: fonte malformada (KFs sem lista) -> exit 2 com mensagem clara", () => {
  const dir = tmpDir("kf-fonte-ruim-");
  const fonte = path.join(dir, "fonte.yaml");
  fs.writeFileSync(fonte, "meta:\n  version: 0.1\nkfs_padrao: nao-e-lista\n", "utf8");
  const { status, rel } = rodar(["--fonte", fonte, "--decisoes", path.join(FIXTURES, "valido"), "--out", tmpDir("kf-out-")]);
  assert.equal(status, 2);
  assert.match(rel.erro, /lista de KFs/);
});

test("parse: fonte vazia de KFs -> exit 2", () => {
  const dir = tmpDir("kf-fonte-vazia-");
  const fonte = path.join(dir, "fonte.yaml");
  fs.writeFileSync(fonte, "meta:\n  version: 0.1\nkfs_padrao: []\n", "utf8");
  const { status, rel } = rodar(["--fonte", fonte, "--decisoes", path.join(FIXTURES, "valido"), "--out", tmpDir("kf-out-")]);
  assert.equal(status, 2);
  assert.match(rel.erro, /sem KFs declarados/);
});

test("parse: DECISAO fora de bloco ID -> exit 2 (registro sem identidade)", () => {
  const registros = tmpDir("kf-sem-id-");
  fs.writeFileSync(
    path.join(registros, "FR-X.md"),
    "DECISAO: sem identidade\nTIPO: tecnica\nAREA_TATICA: KF-DOC\nTOMADA_POR: Lila\nORIGEM: projeto\nSUPERSEDE: NENHUMA\nVALIDACAO: gate\n",
    "utf8"
  );
  const { status, rel } = rodar(["--fonte", FONTE, "--decisoes", registros, "--out", tmpDir("kf-out-")]);
  assert.equal(status, 2);
  assert.match(rel.erro, /fora de bloco ID/);
});

test("parse: campo obrigatorio ausente (ORIGEM) -> exit 2", () => {
  const registros = tmpDir("kf-sem-origem-");
  fs.writeFileSync(
    path.join(registros, "FR-Y.md"),
    "ID: FR-Y.D1\nDECISAO: sem origem\nTIPO: tecnica\nAREA_TATICA: KF-DOC\nTOMADA_POR: Lila\nSUPERSEDE: NENHUMA\nVALIDACAO: gate\n",
    "utf8"
  );
  const { status, rel } = rodar(["--fonte", FONTE, "--decisoes", registros, "--out", tmpDir("kf-out-")]);
  assert.equal(status, 2);
  assert.match(rel.erro, /obrigatorio ausente: ORIGEM/);
});

test("CLI: --check nao escreve KF no diretorio de saida", () => {
  const out = tmpDir("kf-check-out-");
  const { status } = rodar(["--fonte", FONTE, "--decisoes", path.join(FIXTURES, "valido"), "--out", out, "--check"]);
  assert.equal(status, 0);
  assert.equal(fs.readdirSync(out).length, 0, "--check nao deve materializar KF");
});

test("CLI: argumento desconhecido -> exit 2", () => {
  const { status, rel } = rodar(["--fonte", FONTE, "--out", tmpDir("kf-out-"), "--inventado"]);
  assert.equal(status, 2);
  assert.match(rel.erro, /argumento desconhecido/);
});

test("hook do gate semantico: sem flag reporta nao-integrado; com hook valido propaga veredito", () => {
  const out = tmpDir("kf-out-");
  const sem = compilar("valido", out);
  assert.match(sem.rel.gate_semantico, /nao-integrado/);
  const dir = tmpDir("kf-hook-");
  const hook = path.join(dir, "hook.cjs");
  fs.writeFileSync(
    hook,
    "module.exports = { verificar: (dados) => ({ modelo: 'stub', kfs: dados.kfs.length, pass: true }) };\n",
    "utf8"
  );
  const com = rodar(["--fonte", FONTE, "--decisoes", path.join(FIXTURES, "valido"), "--out", tmpDir("kf-out-"), "--gate-semantico-hook", hook]);
  assert.equal(com.status, 0);
  assert.deepEqual(com.rel.gate_semantico, { modelo: "stub", kfs: 3, pass: true });
});

// ── Frame B1 — ESTADO (PRESENTE | PLANEJAMENTO), PLANEJAMENTO PENDENTE, LEGACY_SEM_ESTADO
//    e paths repo-relative. Extensão da suíte: nenhum assert anterior foi reduzido.

test("B1: ESTADO: PRESENTE entra na secao vigente correspondente ao TIPO", () => {
  const out = tmpDir("kf-out-");
  const { status, rel } = compilar("estado-presente", out);
  assert.equal(status, 0, "exit 0 esperado: " + JSON.stringify(rel));
  const doc = fs.readFileSync(path.join(out, "kf-doc.md"), "utf8");
  const vigentes = doc.split("## DECISOES VIGENTES")[1].split("## ")[0];
  assert.match(vigentes, /- FR-EST-P\.D1 \| tipo: tecnica \| origem: projeto \| tomada_por: Lila \| validacao: gate/);
  assert.equal(rel.kfs.find((k) => k.slug === "KF-DOC").vigentes, 1);
});

test("B1: ESTADO: PLANEJAMENTO nao entra em vigentes/comportamentos e aparece em PLANEJAMENTO PENDENTE", () => {
  const out = tmpDir("kf-out-");
  const { status, rel } = compilar("estado-planejamento", out);
  assert.equal(status, 0, "exit 0 esperado: " + JSON.stringify(rel));
  const doc = fs.readFileSync(path.join(out, "kf-doc.md"), "utf8");
  assert.ok(doc.includes("## PLANEJAMENTO PENDENTE"), "secao pendente ausente");
  const pendente = doc.split("## PLANEJAMENTO PENDENTE")[1].split("## ")[0];
  assert.match(pendente, /- FR-EST-PJ\.D1 \| tipo: negocio \| origem: projeto \| tomada_por: humano \| validacao: observavel/);
  assert.match(pendente, / {2}Decisao de planejamento nao entra como estado presente/);
  const soVigentes = doc.split("## DECISOES VIGENTES")[1].split("## COMPORTAMENTOS ESPERADOS")[0];
  assert.ok(!soVigentes.includes("FR-EST-PJ"), "planejamento vazou em vigentes");
  const kfd = rel.kfs.find((k) => k.slug === "KF-DOC");
  assert.equal(kfd.vigentes, 0);
  assert.equal(kfd.planejamentos, 1);
});

test("B1: secao PLANEJAMENTO PENDENTE nao aparece quando vazia (condicional, nunca secao vazia)", () => {
  const out = tmpDir("kf-out-");
  const { status } = compilar("valido", out);
  assert.equal(status, 0);
  const doc = fs.readFileSync(path.join(out, "kf-doc.md"), "utf8");
  assert.ok(!doc.includes("## PLANEJAMENTO PENDENTE"), "secao condicional emitida vazia");
});

const CASOS_ESTADO = [
  ["estado-invalido", /ESTADO=SUPERSEDED fora do enum/],
  ["estado-vazio", /ESTADO vazio/],
  ["estado-duplicado", /ESTADO duplicado/],
  ["executora-com-estado", /ESTADO em registro executora de supersede/],
];
for (const [fixture, trecho] of CASOS_ESTADO) {
  test("B1 parse: " + fixture + " -> exit 2", () => {
    const out = tmpDir("kf-out-");
    const { status, rel } = compilar(fixture, out);
    assert.equal(status, 2, "exit code esperado 2: " + JSON.stringify(rel));
    assert.match(rel.erro, trecho);
    assert.equal(fs.existsSync(path.join(out, "kf-doc.md")), false, "parse invalido nao escreve KF");
  });
}

// v1.3 (Q2=B): a FR cassada NAO carrega ESTADO (o carimbo saiu da fixture) — o cenário
// "PLANEJAMENTO cassado" deixou de existir por contrato; a cadeia formal prevalece e a FR cassada
// vira tombstone. ESTADO em deprecada = exit 2 (teste dedicado no bloco v1.3 abaixo).
test("v1.3: FR cassada por executora vira tombstone (cadeia prevalece) e sai do pendente", () => {
  const out = tmpDir("kf-out-");
  const { status, rel } = compilar("planejamento-supersededo", out);
  assert.equal(status, 0, "exit 0 esperado: " + JSON.stringify(rel));
  const doc = fs.readFileSync(path.join(out, "kf-doc.md"), "utf8");
  assert.ok(!doc.includes("## PLANEJAMENTO PENDENTE"), "FR cassada nao pode ficar no pendente");
  const tomb = doc.split("## DECISOES DEPRECADAS (tombstone)")[1].split("## ")[0];
  assert.match(tomb, /- FR-EST-PS\.D1 \| executor: FR-EST-PS\.D2 \| motivo: evolucao/);
  const kfd = rel.kfs.find((k) => k.slug === "KF-DOC");
  assert.equal(kfd.planejamentos, 0);
  assert.equal(kfd.deprecadas, 1);
});

// ── Frame v1.3 — fail-closed do ESTADO (deliberate event 2026-09-18) + isenção de tombstones.
//    REESCRITA do contrato do B1 (nunca redução): o canal não-bloqueante LEGACY_SEM_ESTADO morreu e
//    os campos `diagnosticos`/`legacy_sem_estado` saíram do schema de saída. Os asserts de projeção
//    do B1 (comportamento, tombstone, KF-INDICES, executora isenta) foram PRESERVADOS abaixo.

test("v1.3: FR viva SEM ESTADO -> exit 2 nomeando arquivo, bloco e ID (fail-closed sem escape hatch)", () => {
  const out = tmpDir("kf-out-");
  const { status, rel } = compilar("viva-sem-estado", out);
  assert.equal(status, 2, "exit code esperado 2: " + JSON.stringify(rel));
  assert.match(rel.erro, /FR-V13-VS\.md:4: ESTADO ausente em FR viva \(ID FR-V13-VS\.D1\)/);
  assert.match(rel.erro, /fail-closed v1\.3/);
  assert.match(rel.erro, /sem flag de escape/);
  assert.equal(fs.existsSync(path.join(out, "kf-doc.md")), false, "exit 2 nao escreve KF");
  assert.equal(rel.diagnosticos, undefined, "campo diagnosticos morreu no v1.3");
  assert.equal(rel.legacy_sem_estado, undefined, "campo legacy_sem_estado morreu no v1.3");
});

test("v1.3: FR deprecada SEM ESTADO -> exit 0 (isenta), vira tombstone e nao vaza para vigentes", () => {
  const out = tmpDir("kf-out-");
  const { status, rel } = compilar("deprecada-sem-estado", out);
  assert.equal(status, 0, "exit 0 esperado: " + JSON.stringify(rel));
  const doc = fs.readFileSync(path.join(out, "kf-doc.md"), "utf8");
  assert.match(doc, /- FR-V13-DS\.D1 \| executor: FR-V13-DS\.D2 \| motivo: evolucao/);
  const kfd = rel.kfs.find((k) => k.slug === "KF-DOC");
  assert.equal(kfd.deprecadas, 1);
  assert.equal(kfd.vigentes, 0, "tombstone nao vaza para vigentes");
  assert.equal(kfd.planejamentos, 0, "tombstone nao vaza para o pendente");
});

test("v1.3: FR deprecada COM ESTADO -> exit 2 (erro de categoria, simetria com executora×ESTADO)", () => {
  const out = tmpDir("kf-out-");
  const { status, rel } = compilar("deprecada-com-estado", out);
  assert.equal(status, 2, "exit code esperado 2: " + JSON.stringify(rel));
  assert.match(rel.erro, /FR-V13-DC\.md:4: ESTADO em FR deprecada \(ID FR-V13-DC\.D1, cassada por FR-V13-DC\.D2\)/);
  assert.equal(fs.existsSync(path.join(out, "kf-doc.md")), false, "exit 2 nao escreve KF");
});

test("v1.3: corpus conforme (fixture valido) -> exit 0, projecao do B1 preservada e schema sem campos mortos", () => {
  const outA = tmpDir("kf-out-");
  const a = compilar("valido", outA);
  assert.equal(a.status, 0, "exit 0 esperado: " + JSON.stringify(a.rel));
  assert.equal(a.rel.compilador, "kf-compiler v1.3");
  assert.equal(a.rel.diagnosticos, undefined, "breaking change: diagnosticos removido do relatorio");
  assert.equal(a.rel.legacy_sem_estado, undefined, "breaking change: legacy_sem_estado removido do relatorio");
  // projeção do B1 preservada: B1 segue em COMPORTAMENTOS, D3 segue vigente no KF-INDICES e o
  // tombstone D1<-D2 segue intacto (D1 é o ALVO do executor; D2 é executora — isenta de ESTADO)
  const doc = fs.readFileSync(path.join(outA, "kf-doc.md"), "utf8");
  assert.match(doc, /- FR-DOC-01\.B1 \| origem: framework \| tomada_por: Lila \| validacao: observavel/);
  assert.match(doc, /- FR-DOC-01\.D1 \| executor: FR-DOC-01\.D2 \| motivo: evolucao/);
  const docIdx = fs.readFileSync(path.join(outA, "kf-indices.md"), "utf8");
  assert.match(docIdx, /- FR-DOC-01\.D3 \| tipo: tecnica \| origem: framework/);
  assert.equal(a.rel.kfs.find((k) => k.slug === "KF-DOC").deprecadas, 1, "tombstone unico e preservado");
  const b = compilar("valido", tmpDir("kf-out-"));
  assert.equal(b.status, 0);
  assert.equal(a.rel.hash_fonte, b.rel.hash_fonte, "hash_fonte deterministico");
});

test("v1.3: --check verde e sem campos mortos no JSON (exit code e gates intocados)", () => {
  const out = tmpDir("kf-out-");
  const args = ["--fonte", FONTE, "--decisoes", path.join(FIXTURES, "valido"), "--out", out];
  assert.equal(rodar(args).status, 0);
  const chk = rodar([...args, "--check"]);
  assert.equal(chk.status, 0, "--check com corpus conforme NAO pode bloquear: " + JSON.stringify(chk.rel));
  assert.equal(chk.rel.modo, "check");
  assert.equal(chk.rel.diagnosticos, undefined, "breaking change: campo removido tambem no --check");
  assert.equal(chk.rel.legacy_sem_estado, undefined, "breaking change: campo removido tambem no --check");
  assert.ok(!(chk.rel.violacoes || []).some((v) => /LEGACY|ESTADO/.test(v.detalhe || "")), "ESTADO nunca migra para violacoes de gate");
});

test("v1.3: fail-closed agrega TODAS as violacoes em ordem deterministica de ID", () => {
  const dir = tmpDir("kf-v13-multi-");
  fs.writeFileSync(
    path.join(dir, "FR-V13-MULTI.md"),
    "ID: FR-V13-MULTI.B1\nDECISAO: viva sem estado B\nTIPO: tecnica\nAREA_TATICA: KF-DOC\nTOMADA_POR: Lila\nORIGEM: projeto\nSUPERSEDE: NENHUMA\nVALIDACAO: gate\n\n" +
      "ID: FR-V13-MULTI.A1\nDECISAO: viva sem estado A\nTIPO: tecnica\nAREA_TATICA: KF-DOC\nTOMADA_POR: Lila\nORIGEM: projeto\nSUPERSEDE: NENHUMA\nVALIDACAO: gate\n",
    "utf8"
  );
  const { status, rel } = rodar(["--fonte", FONTE, "--decisoes", dir, "--out", tmpDir("kf-out-")]);
  assert.equal(status, 2, "exit code esperado 2: " + JSON.stringify(rel));
  const linhas = rel.erro.split("\n");
  assert.equal(linhas.length, 2, "as duas violacoes devem ser listadas: " + rel.erro);
  assert.match(linhas[0], /FR-V13-MULTI\.A1/, "ordem deterministica por ID");
  assert.match(linhas[1], /FR-V13-MULTI\.B1/);
});

test("B1: path repo-relative com separador / e invariante ao cwd de execucao", () => {
  const repo = tmpDir("kf-path-repo-");
  const fsr = path.join(repo, "LILA-DEV", "planejamento", "migracao", "frs-retroativos");
  fs.mkdirSync(fsr, { recursive: true });
  fs.writeFileSync(
    path.join(fsr, "FR-PATH.md"),
    "ID: FR-PATH.D1\nDECISAO: Registro para provar path repo-relative\nTIPO: tecnica\nAREA_TATICA: KF-DOC\nTOMADA_POR: Lila\nORIGEM: projeto\nSUPERSEDE: NENHUMA\nVALIDACAO: gate\nESTADO: PRESENTE\n",
    "utf8"
  );
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repo, encoding: "utf8" }).status, 0);
  const out1 = tmpDir("kf-path-out1-");
  const out2 = tmpDir("kf-path-out2-");
  // dois cwds DIFERENTES dentro do mesmo clone (raiz e scripts/): os paths nao podem mudar
  const r1 = spawnSync(process.execPath, [COMPILER, "--fonte", FONTE, "--decisoes", fsr, "--out", out1], { encoding: "utf8", cwd: path.join(__dirname, "..", "..") });
  const r2 = spawnSync(process.execPath, [COMPILER, "--fonte", FONTE, "--decisoes", fsr, "--out", out2], { encoding: "utf8", cwd: path.join(__dirname, "..") });
  assert.equal(r1.status, 0, "compile cwd raiz: " + JSON.stringify(r1.stdout || r1.stderr));
  assert.equal(r2.status, 0, "compile cwd tests: " + JSON.stringify(r2.stdout || r2.stderr));
  const doc1 = fs.readFileSync(path.join(out1, "kf-doc.md"), "utf8");
  const doc2 = fs.readFileSync(path.join(out2, "kf-doc.md"), "utf8");
  assert.match(doc1, /LILA-DEV\/planejamento\/migracao\/frs-retroativos\/FR-PATH\.md \| registros: 1/);
  assert.ok(!doc1.includes("\\"), "separador deve ser / (barra), nunca separador nativo de Windows");
  assert.equal(doc1, doc2, "cwd diferente alterou os paths — viola §9");
});

test("B1: G3 determinismo com ESTADO na entrada — 2 compilacoes, bytes identicos", () => {
  const a = tmpDir("kf-det-est-a-");
  const b = tmpDir("kf-det-est-b-");
  assert.equal(compilar("estado-planejamento", a).status, 0);
  assert.equal(compilar("estado-planejamento", b).status, 0);
  assert.equal(
    fs.readFileSync(path.join(a, "kf-doc.md"), "utf8"),
    fs.readFileSync(path.join(b, "kf-doc.md"), "utf8")
  );
});
