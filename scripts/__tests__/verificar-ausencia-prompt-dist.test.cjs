// scripts/__tests__/verificar-ausencia-prompt-dist.test.cjs
// C25-18 (Ciclo 2, sessao `structural/hardening-ciclo2-sessao-b`) — testes do
// GATE MECANICO de ausencia de prompt no artefato do cliente. A prova que
// importa e a NEGATIVA: o scanner precisa REPROVAR um artefato envenenado (senao
// o gate e decorativo) e precisa REPROVAR a ausencia do proprio artefato
// (fail-closed: passar por nao ter o que olhar seria verde falso).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  SENTINELAS,
  listarArquivos,
  ehBinario,
  escanear,
  verificarFontes,
  principal,
} = require("../verificar-ausencia-prompt-dist.cjs");

const RAIZ_REPO = path.join(__dirname, "..", "..");

function tmpDir(prefixo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
}

function escrever(dir, relativo, conteudo, binario = false) {
  const destino = path.join(dir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, binario ? Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(conteudo)]) : conteudo);
  return destino;
}

/** IO injetado que não toca nos globais do processo (sem patch de console/stdout). */
function ioFalso() {
  return { log: () => true, error: () => true };
}

/** IO injetado que ACUMULA a saída em arquivo (prova de evidência sem sequestrar globais). */
function ioArquivo(caminho) {
  return {
    log: (mensagem) => fs.appendFileSync(caminho, `${String(mensagem)}\n`),
    error: (mensagem) => fs.appendFileSync(caminho, `${String(mensagem)}\n`),
  };
}

test("catalogo: sentinelas nao vazias, unicas e com fonte declarada", () => {
  assert.ok(SENTINELAS.length >= 5, "catalogo pequeno demais para valer como gate");
  const vistas = new Set();
  for (const item of SENTINELAS) {
    assert.ok(item.sentinela.length >= 12, `sentinela curta demais (risco de falso-positivo): ${item.sentinela}`);
    assert.ok(item.fonte.endsWith(".md"), `fonte deve ser prompt .md: ${item.fonte}`);
    assert.ok(!vistas.has(item.sentinela), `sentinela duplicada: ${item.sentinela}`);
    vistas.add(item.sentinela);
  }
});

test("catalogo: toda sentinela existe na fonte declarada (auto-checagem real)", () => {
  const { ok, drift } = verificarFontes(SENTINELAS, RAIZ_REPO);
  assert.deepEqual(drift, [], "catalogo driftado — atualize as sentinelas para o texto vigente");
  assert.equal(ok, true);
});

test("verificarFontes: REPROVA sentinela ausente da fonte (catalogo morto nao passa)", () => {
  const raiz = tmpDir("gate-prompt-drift-");
  escrever(raiz, "src/prompts/Canonical/FDV-E.md", "texto sem a sentinela");
  const { ok, drift } = verificarFontes(
    [{ sentinela: "SENTINELA-QUE-NAO-EXISTE-NA-FONTE", fonte: "src/prompts/Canonical/FDV-E.md", classe: "canonical" }],
    raiz,
  );
  assert.equal(ok, false);
  assert.equal(drift.length, 1);
});

test("escanear: artefato limpo nao acusa nada (caso NEGATIVO)", () => {
  const dist = tmpDir("gate-prompt-limpo-");
  escrever(dist, "index.html", "<html><body>Lila</body></html>");
  escrever(dist, "assets/index-abc.js", "export const ola = 1;");
  escrever(dist, "assets/index-abc.css", ".x{color:red}");
  const r = escanear(dist);
  assert.deepEqual(r.achados, []);
  assert.equal(r.arquivosVarridos, 3);
});

test("escanear: sentinela no bundle REPROVA (caso POSITIVO — o gate tem dentes)", () => {
  const dist = tmpDir("gate-prompt-sujo-");
  escrever(dist, "assets/chunk-xyz.js", `const p = "${SENTINELAS[0].sentinela}";`);
  const r = escanear(dist);
  assert.equal(r.achados.length, 1);
  assert.equal(r.achados[0].sentinela, SENTINELAS[0].sentinela);
  assert.match(r.achados[0].arquivo, /chunk-xyz\.js$/);
});

test("escanear: varredura e recursiva (subdiretorio profundo nao escapa)", () => {
  const dist = tmpDir("gate-prompt-recursivo-");
  escrever(dist, "a/b/c/d/app.js", SENTINELAS[1].sentinela);
  const r = escanear(dist);
  assert.equal(r.achados.length, 1);
});

test("escanear: binario e ignorado (NUL byte), extensao desconhecida tambem", () => {
  const dist = tmpDir("gate-prompt-binario-");
  escrever(dist, "assets/font.woff2", SENTINELAS[0].sentinela, true);
  escrever(dist, "assets/nota.exotico", SENTINELAS[0].sentinela);
  const r = escanear(dist);
  assert.deepEqual(r.achados, []);
  assert.equal(r.arquivosIgnorados, 2);
  assert.equal(ehBinario(Buffer.from([0, 65, 66])), true);
  assert.equal(ehBinario(Buffer.from("texto")), false);
});

test("escanear: arquivo vazio e contado como ignorado, nunca crash", () => {
  const dist = tmpDir("gate-prompt-vazio-");
  escrever(dist, "assets/vazio.js", "");
  const r = escanear(dist);
  assert.deepEqual(r.achados, []);
  assert.equal(r.arquivosIgnorados, 1);
});

test("listarArquivos: diretorio inexistente devolve lista vazia (sem excecao)", () => {
  assert.deepEqual(listarArquivos(path.join(os.tmpdir(), "nao-existe-" + String(Date.now()))), []);
});

test("principal: dist ausente REPROVA com exit 1 (fail-closed, sem verde falso)", () => {
  const raiz = tmpDir("gate-prompt-sem-dist-");
  const { exitCode, relatorio } = principal([`--dist=${path.join(raiz, "nao-existe")}`], RAIZ_REPO, ioFalso());
  assert.equal(exitCode, 1);
  assert.equal(relatorio.veredito, "sem-artefato");
});

test("principal: artefato limpo -> exit 0; artefato envenenado -> exit 1 + evidencia JSON", () => {
  const raiz = tmpDir("gate-prompt-fluxo-");
  const distLimpo = path.join(raiz, "dist-limpo");
  const distSujo = path.join(raiz, "dist-sujo");
  escrever(distLimpo, "assets/app.js", "const ok = true;");
  escrever(distSujo, "assets/app.js", `${SENTINELAS[2].sentinela} -> vazou`);
  const destinoLimpo = path.join(raiz, "saida-limpa.txt");
  const destinoSujo = path.join(raiz, "saida-suja.txt");

  const limpo = principal([`--dist=${distLimpo}`, "--json"], RAIZ_REPO, ioArquivo(destinoLimpo));
  assert.equal(limpo.exitCode, 0);
  assert.equal(limpo.relatorio.veredito, "limpo");
  assert.equal(limpo.relatorio.schema, "verificar-ausencia-prompt-dist/v1");

  const sujo = principal([`--dist=${distSujo}`, "--json"], RAIZ_REPO, ioArquivo(destinoSujo));
  assert.equal(sujo.exitCode, 1);
  assert.equal(sujo.relatorio.veredito, "sentinela-no-artefato");
  assert.equal(sujo.relatorio.achados.length, 1);

  // Evidência JSON de fato impressa (e parseável) nas DUAS execuções, sem tocar globais.
  const evidenciaLimpa = JSON.parse(fs.readFileSync(destinoLimpo, "utf8"));
  const evidenciaSuja = JSON.parse(fs.readFileSync(destinoSujo, "utf8"));
  assert.equal(evidenciaLimpa.schema, "verificar-ausencia-prompt-dist/v1");
  assert.equal(evidenciaSuja.veredito, "sentinela-no-artefato");
  assert.ok(typeof evidenciaSuja.em === "string" && evidenciaSuja.em.endsWith("Z"), "evidencia datada");
});

