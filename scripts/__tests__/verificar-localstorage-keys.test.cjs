"use strict";
// Suite: verificar-localstorage-keys — nucleo puro (parse do inventario, extracao
// de tokens, casamento) + execucao real do script contra fixtures temporarias
// (verde e vermelho). PATCH-STORAGE-KEYS-GATE-20260910.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  casa,
  extraiTokens,
  parseDoc,
  compara,
  buildReport,
} = require("../verificar-localstorage-keys.cjs");

const SCRIPT = path.resolve(__dirname, "..", "verificar-localstorage-keys.cjs");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ls-keys-"));
}

// ── casa (casamento codigo x documento) ──────────────────────────────────────
test("casa: padrao do doc com curinga aceita a chave concreta do codigo", () => {
  assert.equal(casa("lila_model_selection_executor", "lila_model_selection_*"), true);
});

test("casa: constante de prefixo casa o padrao documentado", () => {
  assert.equal(casa("lila-attachments", "lila-attachments-*"), true);
  assert.equal(casa("lila_loaded_history_", "lila_loaded_history_*"), true);
});

test("casa: token com curinga NAO cobre chave concreta do doc (anti falso-negativo)", () => {
  assert.equal(casa("lila-artista-*", "lila-artista-state"), false);
});

test("casa: chaves concretas exigem identidade exata", () => {
  assert.equal(casa("lila_auth_token", "lila_auth_token"), true);
  assert.equal(casa("lila_auth_toke", "lila_auth_token"), false);
  assert.equal(casa("lila_auth_token_v2", "lila_auth_token"), false);
});

test("casa: token com curinga casa padrao com curinga equivalente", () => {
  assert.equal(casa("lila_session_id_*", "lila_session_id_*"), true);
  assert.equal(casa("lila_l1_identity_*", "lila_l1_identity_*"), true);
});

// ── extraiTokens (string literals) ───────────────────────────────────────────
test("extraiTokens: literal simples, template dinamico e constante de prefixo", () => {
  const src = [
    'const KEY = "lila_auth_token";',
    "localStorage.getItem(`lila_session_id_${chat}`);",
    'const PREFIX = "lila-attachments";',
  ].join("\n");
  const tokens = extraiTokens(src).map((t) => t.token);
  assert.deepEqual(tokens, ["lila_auth_token", "lila_session_id_*", "lila-attachments"]);
});

test("extraiTokens: ignora chaves citadas em comentario (nao ha string)", () => {
  const src = "// chave morta lila_folder_tree_cache removida em 2026\nconst x = 1;\n";
  assert.deepEqual(extraiTokens(src), []);
});

// ── parseDoc ─────────────────────────────────────────────────────────────────
const DOC_FIXTURE = [
  "# Inventario",
  "",
  "## Keys de Produção (inventário verificado no código)",
  "",
  "| Chave | Estrutura | Módulo |",
  "|---|---|---|",
  "| `lila_auth_token` | JWT | `api-client.ts` |",
  "| `lila-attachments-{executor\\|governor}` | lista | `attachments-store.ts` |",
  "",
  "## Exceções do gate (identificadores que casam com `lila*` mas NÃO são chaves)",
  "",
  "| Token | Onde | Por quê |",
  "|---|---|---|",
  "| `lila-governor` | asset | imagem |",
  "",
  "## Convenção",
  "",
  "- **Prefixo obrigatório**: `lila-` para novas chaves",
].join("\n");

test("parseDoc: producao vira padrao com curinga e a secao de excecoes fica separada", () => {
  const doc = parseDoc(DOC_FIXTURE);
  assert.deepEqual(doc.producao, ["lila_auth_token", "lila-attachments-*"]);
  assert.deepEqual(doc.excecoes, ["lila-governor"]);
  assert.ok(doc.universo.includes("lila_auth_token"));
  assert.ok(doc.universo.includes("lila-attachments-*"));
  // excecao NAO entra no universo e prefixo puro `lila-` nao vira curinga global
  assert.ok(!doc.universo.includes("lila-governor"));
  assert.ok(!doc.universo.includes("lila-*"));
});

// ── compara (duas direcoes) ──────────────────────────────────────────────────
test("compara: verde quando codigo e documento coincidem", () => {
  const doc = parseDoc(DOC_FIXTURE);
  const tokens = [
    { token: "lila_auth_token", arquivo: "src/a.ts", linha: 1 },
    { token: "lila-attachments", arquivo: "src/b.ts", linha: 2 },
  ];
  const r = compara(doc, tokens);
  assert.equal(r.ok, true);
  assert.deepEqual(r.naoDocumentadas, []);
  assert.deepEqual(r.fantasmas, []);
});

test("compara: aponta chave do codigo ausente do inventario", () => {
  const doc = parseDoc(DOC_FIXTURE);
  const tokens = [
    { token: "lila_auth_token", arquivo: "src/a.ts", linha: 1 },
    { token: "lila-attachments", arquivo: "src/b.ts", linha: 2 },
    { token: "lila_nova_chave", arquivo: "src/c.ts", linha: 7 },
  ];
  const r = compara(doc, tokens);
  assert.equal(r.ok, false);
  assert.equal(r.naoDocumentadas.length, 1);
  assert.equal(r.naoDocumentadas[0].token, "lila_nova_chave");
});

test("compara: aponta chave de producao fantasma (sem uso no codigo)", () => {
  const doc = parseDoc(DOC_FIXTURE);
  const tokens = [{ token: "lila_auth_token", arquivo: "src/a.ts", linha: 1 }];
  const r = compara(doc, tokens);
  assert.equal(r.ok, false);
  assert.deepEqual(r.fantasmas, ["lila-attachments-*"]);
});

test("compara: excecao declarada cobre identificador que nao e chave", () => {
  const doc = parseDoc(DOC_FIXTURE);
  const tokens = [
    { token: "lila_auth_token", arquivo: "src/a.ts", linha: 1 },
    { token: "lila-attachments", arquivo: "src/b.ts", linha: 2 },
    { token: "lila-governor", arquivo: "src/c.ts", linha: 9 },
  ];
  const r = compara(doc, tokens);
  assert.equal(r.ok, true);
  assert.deepEqual(r.excecoesObsoletas, []);
});

test("compara: excecao sem uso no codigo vira aviso (nao bloqueia)", () => {
  const doc = parseDoc(DOC_FIXTURE);
  const tokens = [
    { token: "lila_auth_token", arquivo: "src/a.ts", linha: 1 },
    { token: "lila-attachments", arquivo: "src/b.ts", linha: 2 },
  ];
  const r = compara(doc, tokens);
  assert.equal(r.ok, true);
  assert.deepEqual(r.excecoesObsoletas, ["lila-governor"]);
});

// ── execucao real do script contra fixtures ──────────────────────────────────
function escreveFixture({ doc, fontes }) {
  const dir = tmpdir();
  const docPath = path.join(dir, "LOCALSTORAGE-KEYS.md");
  fs.writeFileSync(docPath, doc);
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  for (const [nome, conteudo] of Object.entries(fontes)) {
    fs.writeFileSync(path.join(srcDir, nome), conteudo);
  }
  return { dir, docPath, srcDir };
}

function roda(docPath, srcDir) {
  return spawnSync(process.execPath, [SCRIPT, "--doc", docPath, "--src", srcDir, "--json"], {
    encoding: "utf8",
  });
}

test("script: exit 0 e relatorio ok com fixture coerente", () => {
  const { docPath, srcDir } = escreveFixture({
    doc: DOC_FIXTURE,
    fontes: { "a.ts": 'const K = "lila_auth_token";\nconst P = "lila-attachments";\n' },
  });
  const out = roda(docPath, srcDir);
  assert.equal(out.status, 0, out.stderr);
  const rel = JSON.parse(out.stdout);
  assert.equal(rel.ok, true);
  assert.equal(rel.exitCode, 0);
  assert.equal(rel.fantasmas.length, 0);
});

test("script: exit 1 apontando chave nao documentada", () => {
  const { docPath, srcDir } = escreveFixture({
    doc: DOC_FIXTURE,
    fontes: { "a.ts": 'const K = "lila_auth_token";\nconst P = "lila-attachments";\nconst N = "lila_nova";\n' },
  });
  const out = roda(docPath, srcDir);
  assert.equal(out.status, 1, out.stderr);
  const rel = JSON.parse(out.stdout);
  assert.equal(rel.ok, false);
  assert.equal(rel.naoDocumentadas[0].token, "lila_nova");
  // A ocorrencia aponta arquivo:linha (path relativo ao repo; em fixture fora do
  // repo o prefixo e relativo — por isso o assert valida o sufixo).
  assert.ok(rel.naoDocumentadas[0].ocorrencias[0].endsWith("a.ts:3"), rel.naoDocumentadas[0].ocorrencias[0]);
});

test("script: exit 1 apontando fantasma quando o codigo perde a chave", () => {
  const { docPath, srcDir } = escreveFixture({
    doc: DOC_FIXTURE,
    fontes: { "a.ts": 'const K = "lila_auth_token";\n' },
  });
  const out = roda(docPath, srcDir);
  assert.equal(out.status, 1, out.stderr);
  const rel = JSON.parse(out.stdout);
  assert.deepEqual(rel.fantasmas, ["lila-attachments-*"]);
});

test("script: doc ausente falha com exit 1", () => {
  const out = roda(path.join(tmpdir(), "inexistente.md"), tmpdir());
  assert.equal(out.status, 1);
});

test("buildReport: expoe contagens e comandos do gate", () => {
  const doc = parseDoc(DOC_FIXTURE);
  const rel = buildReport({
    doc,
    tokens: [{ token: "lila_auth_token", arquivo: "src/a.ts", linha: 1 }],
    docPath: "docs/LOCALSTORAGE-KEYS.md",
    srcRoots: ["src"],
    verbose: true,
  });
  assert.equal(rel.comando, "node scripts/verificar-localstorage-keys.cjs");
  assert.equal(rel.doc, "docs/LOCALSTORAGE-KEYS.md");
  assert.equal(rel.chavesProducaoDoc, 2);
  assert.deepEqual(rel.tokens, ["lila_auth_token"]);
});

