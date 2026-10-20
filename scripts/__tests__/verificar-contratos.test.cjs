// scripts/__tests__/verificar-contratos.test.cjs
// Self-test do verificador de elegibilidade mecanica do PATCH (F1 —
// EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922).
//
// Cobre o contrato declarado no snapshot do evento:
//   match exato | match por glob | registry ausente (exit 2) | registry vazio
//   (exit 0) | sem match (exit 0) | modo consulta --area (exit 0) | uso invalido.
// Fixture em tmp, registry injetado por CONTRATOS_JSON — sem tocar o registry real.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "verificar-contratos.cjs"));
const { globToRegExp, casarPadrao, avaliar, carregarRegistry, lerArgs, main } = mod;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-contratos-"));
const REGISTRY = path.join(tmp, "registry.json");
const REGISTRY_VAZIO = path.join(tmp, "registry-vazio.json");
const REGISTRY_ILEGIVEL = path.join(tmp, "registry-ilegivel.json");
const AUSENTE = path.join(tmp, "nao-existe.json");

const ENTRADAS = [
  {
    id: "CT-GITHUB-001",
    area: "github",
    tipo: "contrato-exportado",
    padrao: "backend/src/services/github-write.ts",
    descricao: "gate de escrita GitHub",
  },
  {
    id: "CT-GITHUB-002",
    area: "github",
    tipo: "contrato-exportado",
    padrao: "backend/src/services/github-*.ts",
    descricao: "familia de servicos github",
  },
  { id: "CT-CHAT-001", area: "chat", tipo: "schema", padrao: "src/lib/api-types.ts", descricao: "DTOs" },
  {
    id: "CT-SNAPSHOT-001",
    area: "snapshot",
    tipo: "snapshot",
    padrao: "LILA-DEV/planejamento/snapshots/**",
    descricao: "snapshots de decisao",
  },
];

fs.writeFileSync(
  REGISTRY,
  JSON.stringify({ schema: "contratos-afetados/v1", entradas: ENTRADAS }, null, 2),
  "utf8",
);
fs.writeFileSync(REGISTRY_VAZIO, JSON.stringify({ schema: "contratos-afetados/v1", entradas: [] }), "utf8");
fs.writeFileSync(REGISTRY_ILEGIVEL, "{{ json quebrado", "utf8");

/** Roda main() com o registry injetado; captura stdout/stderr e devolve o exit code. */
function rodar(argv, registryPath) {
  const outAntes = console.log;
  const errAntes = console.error;
  const envAntes = process.env.CONTRATOS_JSON;
  const texto = [];
  console.log = (...a) => texto.push(a.join(" "));
  console.error = (...a) => texto.push(a.join(" "));
  process.env.CONTRATOS_JSON = registryPath;
  try {
    return { codigo: main(argv), texto: texto.join("\n") };
  } finally {
    console.log = outAntes;
    console.error = errAntes;
    if (envAntes === undefined) delete process.env.CONTRATOS_JSON;
    else process.env.CONTRATOS_JSON = envAntes;
  }
}

// ── Unidades puras ──────────────────────────────────────────────────────────

test("globToRegExp: '**' atravessa diretorios, '*' fica no segmento, '?' e' 1 caractere", () => {
  const familia = globToRegExp("backend/src/services/github-*.ts");
  assert.ok(familia.test("backend/src/services/github-write.ts"), "glob de familia casa arquivo do segmento");
  assert.ok(!familia.test("backend/src/services/github-write.tsx"), "extensao fora do glob nao casa");
  assert.ok(!familia.test("backend/src/services/sub/github-write.ts"), "'*' nao atravessa diretorio");
  const tree = globToRegExp("LILA-DEV/planejamento/snapshots/**");
  assert.ok(tree.test("LILA-DEV/planejamento/snapshots/frames/FR-X.md"), "'**' atravessa subdiretorios");
  assert.ok(globToRegExp("a/b?.ts").test("a/b1.ts"), "'?' e' 1 caractere");
  assert.ok(!globToRegExp("a/b?.ts").test("a/b12.ts"), "'?' nao engole 2 caracteres");
});

test("casarPadrao: exato, glob e caminho absoluto dentro do repo normalizado", () => {
  assert.ok(casarPadrao("src/lib/api-types.ts", "src/lib/api-types.ts"), "igualdade exata");
  assert.ok(!casarPadrao("src/lib/api-types.ts", "src/lib/api-types.tsx"), "exato nao casa prefixo");
  assert.ok(casarPadrao("src/lib/api-types.ts", "./src/lib/api-types.ts"), "prefixo ./ e' ruido");
  assert.ok(casarPadrao("src/lib/api-types.ts", "src\\lib\\api-types.ts"), "barras invertidas normalizadas");
  assert.ok(
    casarPadrao("src/lib/api-types.ts", path.join(mod.REPO_ROOT, "src", "lib", "api-types.ts")),
    "caminho absoluto dentro do repo vira relativo",
  );
  assert.ok(!casarPadrao("", "src/lib/api-types.ts"), "padrao vazio nunca casa");
});

test("avaliar: um arquivo pode casar mais de uma entrada (registry inteiro)", () => {
  const matches = avaliar(["backend/src/services/github-write.ts"], ENTRADAS);
  assert.deepStrictEqual(
    matches.map((m) => m.entrada.id),
    ["CT-GITHUB-001", "CT-GITHUB-002"],
    "match exato + glob da familia",
  );
});

test("carregarRegistry: classe de falha explicita por cenario", () => {
  assert.strictEqual(carregarRegistry(REGISTRY).ok, true);
  assert.strictEqual(carregarRegistry(REGISTRY).entradas.length, 4);
  assert.strictEqual(carregarRegistry(AUSENTE).motivo, "registry ausente");
  assert.match(carregarRegistry(REGISTRY_ILEGIVEL).motivo, /ilegivel/);
  assert.strictEqual(carregarRegistry(REGISTRY_VAZIO).ok, true);
});

test("lerArgs: --files vazio, sem argumento e --area pura", () => {
  assert.match(lerArgs([]).erro, /informe --files/);
  assert.match(lerArgs(["--files", ""]).erro, /lista vazia|informe/);
  assert.deepStrictEqual(lerArgs(["--area", "github"]), {
    help: false,
    erro: null,
    arquivos: null,
    area: "github",
    verbose: false,
  });
  assert.deepStrictEqual(lerArgs(["--files", "a.ts , b.ts "]).arquivos, ["a.ts", "b.ts"]);
  assert.strictEqual(lerArgs(["--help"]).help, true);
});

// ── Exit codes do CLI ───────────────────────────────────────────────────────

test("match exato -> exit 1 com contrato, area e instrucao de escalada", () => {
  const r = rodar(["--files", "backend/src/services/github-write.ts"], REGISTRY);
  assert.strictEqual(r.codigo, 1);
  assert.match(r.texto, /INELEGIVEL/);
  assert.match(r.texto, /\[CT-GITHUB-001\]/);
  assert.match(r.texto, /area github/);
  assert.match(r.texto, /escalar para ESTRUTURAL/);
});

test("match por glob -> exit 1", () => {
  const r = rodar(["--files", "backend/src/services/github-pool2-read.ts"], REGISTRY);
  assert.strictEqual(r.codigo, 1);
  assert.match(r.texto, /\[CT-GITHUB-002\]/);
});

test("match por glob de arvore (snapshots/**) -> exit 1", () => {
  const r = rodar(["--files", "LILA-DEV/planejamento/snapshots/frames/FR-X.md"], REGISTRY);
  assert.strictEqual(r.codigo, 1);
  assert.match(r.texto, /\[CT-SNAPSHOT-001\]/);
});

test("zero matches -> exit 0 (ELEGIVEL)", () => {
  const r = rodar(["--files", "src/components/ChatInput.tsx,src/hooks/useChat.ts"], REGISTRY);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /ELEGIVEL/);
});

test("registry ausente -> exit 2 (falha FECHADA, nunca exit 0 silencioso)", () => {
  const r = rodar(["--files", "src/components/ChatInput.tsx"], AUSENTE);
  assert.strictEqual(r.codigo, 2);
  assert.match(r.texto, /registry ausente/);
  assert.match(r.texto, /Falha FECHADA/);
});

test("registry ilegivel -> exit 2", () => {
  const r = rodar(["--files", "src/components/ChatInput.tsx"], REGISTRY_ILEGIVEL);
  assert.strictEqual(r.codigo, 2);
  assert.match(r.texto, /ilegivel/);
});

test("registry vazio (sem entradas) -> exit 0 com a contagem explicita", () => {
  const r = rodar(["--files", "backend/src/services/github-write.ts"], REGISTRY_VAZIO);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /contra 0 contrato\(s\) registrado\(s\)/);
});

test("modo consulta --area -> exit 0 sempre, listando os contratos da area", () => {
  const r = rodar(["--area", "github"], REGISTRY);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /2 contrato\(s\) da area 'github'/);
  assert.match(r.texto, /\[CT-GITHUB-001\]/);
  assert.ok(!r.texto.includes("CT-CHAT-001"), "nao lista area alheia");
  const vazio = rodar(["--area", "infra"], REGISTRY);
  assert.strictEqual(vazio.codigo, 0);
  assert.match(vazio.texto, /nenhum contrato registrado para a area 'infra'/);
});

test("uso invalido (sem argumentos / --files vazio) -> exit 2", () => {
  assert.strictEqual(rodar([], REGISTRY).codigo, 2);
  assert.strictEqual(rodar(["--files", ""], REGISTRY).codigo, 2);
  assert.match(rodar([], REGISTRY).texto, /uso invalido/);
});

test("--area junto de --files NAO filtra (fail-closed) e avisa", () => {
  const r = rodar(["--files", "backend/src/services/github-write.ts", "--area", "chat"], REGISTRY);
  assert.strictEqual(r.codigo, 1, "contrato da area github continua bloqueando");
  assert.match(r.texto, /--area chat ignorado no cruzamento/);
});

test("--verbose lista cada arquivo verificado; --help sai 0", () => {
  const r = rodar(["--files", "src/components/ChatInput.tsx", "--verbose"], REGISTRY);
  assert.strictEqual(r.codigo, 0);
  assert.match(r.texto, /ChatInput\.tsx: sem match/);
  assert.strictEqual(rodar(["--help"], REGISTRY).codigo, 0);
});
