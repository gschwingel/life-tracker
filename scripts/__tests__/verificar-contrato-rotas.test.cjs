// scripts/__tests__/verificar-contrato-rotas.test.cjs
// C25-03 item 3 / HB-020 (2026-09-28) — núcleo PURO do gate de contrato de rotas
// front×back. A prova negativa (drift detectado) é o aceite do item: o gate
// precisa REPROVAR uma rota que o backend não registra.
const { test } = require("node:test");
const assert = require("node:assert");
const {
  casaRota,
  extrairChamadasFront,
  extrairRotasBackend,
  compararContratos,
  limparPath,
  ehExcecaoDeclarada,
} = require("../verificar-contrato-rotas.cjs");

test("casaRota: exato casa; path diferente não casa", () => {
  assert.equal(casaRota("/api/v1/chat/send", "/api/v1/chat/send"), true);
  assert.equal(casaRota("/api/v1/chat/send", "/api/v1/chat/other"), false);
  assert.equal(casaRota("/api/v1/chat/send", "/api/v1/chat"), false);
});

test("casaRota: segmento dinâmico do backend casa literal do front", () => {
  assert.equal(casaRota("/api/v1/l1/diffs/abc/approve", "/api/v1/l1/diffs/:id/approve"), true);
  assert.equal(casaRota("/api/v1/attachments/x/blob", "/api/v1/attachments/:attachmentId/blob"), true);
});

test("casaRota: curinga do template do front casa segmento do backend", () => {
  assert.equal(casaRota("/api/v1/attachments/${id}/blob", "/api/v1/attachments/:attachmentId/blob"), true);
  assert.equal(casaRota("/api/v1/reasoning/shadow/last${query}", "/api/v1/reasoning/shadow/last"), true);
});

test("casaRota: modo PREFIXO (path montado por concatenação) aceita continuação", () => {
  assert.equal(casaRota("/api/v1/attachments", "/api/v1/attachments/:id/blob", true), true);
  assert.equal(casaRota("/api/v1/attachments", "/api/v1/other/:id", true), false);
});

test("extrairChamadasFront: chamada multi-linha, genérico, buildUrl e constante", () => {
  const fonte = [
    'const r = await get<PricingResponse>(',
    '  "/api/v1/models/pricing");',
    'const base = buildUrl("/api/v1/chat/send");',
    'const API_PATH = "/api/v1/attachments";',
    'void fetch("/api/v1/health");',
  ].join("\n");
  const achados = extrairChamadasFront(fonte);
  const paths = achados.map((a) => a.path).sort();
  assert.deepEqual(paths, [
    "/api/v1/attachments",
    "/api/v1/chat/send",
    "/api/v1/health",
    "/api/v1/models/pricing",
  ]);
  assert.equal(achados.find((a) => a.path === "/api/v1/attachments").prefixo, true);
  assert.equal(achados.find((a) => a.path === "/api/v1/chat/send").prefixo, false);
});

test("extrairRotasBackend: registro multi-linha com parâmetro dinâmico", () => {
  const fonte = [
    "function rotas(app) {",
    "  app.put(",
    '    "/api/v1/attachments/:attachmentId/blob",',
    "    async (request, reply) => reply.send({ ok: true }),",
    "  );",
    "  app.get(\"/api/v1/health\", async () => ({}));",
    "}",
  ].join("\n");
  const rotas = extrairRotasBackend(fonte).map((r) => r.path).sort();
  assert.deepEqual(rotas, ["/api/v1/attachments/:attachmentId/blob", "/api/v1/health"]);
});

test("compararContratos: PROVA NEGATIVA — rota inexistente no backend vira drift", () => {
  const chamadas = [
    { path: "/api/v1/ghost/rota", arquivo: "src/x.ts", linha: 7 },
    { path: "/api/v1/health", arquivo: "src/x.ts", linha: 8 },
  ];
  const rotas = [{ path: "/api/v1/health", arquivo: "backend/src/plugins/health.ts", linha: 1 }];
  const drift = compararContratos(chamadas, rotas);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].path, "/api/v1/ghost/rota");
  assert.equal(drift[0].linha, 7);
});

test("compararContratos: exceções declaradas (datadas) não reprovam — e ficam visíveis", () => {
  assert.equal(ehExcecaoDeclarada("/api/v1/chat/image?x=1"), true);
  assert.equal(ehExcecaoDeclarada("/api/v1/chat/verify-key"), true);
  assert.equal(ehExcecaoDeclarada("/api/v1/chat/nova-rota"), false);
  const drift = compararContratos(
    [{ path: "/api/v1/chat/verify-key", arquivo: "src/lib/api-client.ts", linha: 1 }],
    [],
  );
  assert.equal(drift.length, 0);
});

test("limparPath: remove query string e barra final", () => {
  assert.equal(limparPath("/api/v1/models/latency?ids=a,b"), "/api/v1/models/latency");
  assert.equal(limparPath("/api/v1/models/"), "/api/v1/models");
});

// FRAME-BRACOS-ARM-MCP-20261014 (D2 — extinção do ciclo OAE, snapshot aprovado
// com vereditos humanos de 2026-10-14): a superfície /api/v1/oae/* sobrevive
// APENAS como transporte runner-local enxuto — pareamento (codes/redeem),
// presença (status), revogação (revoke) e heartbeat. As rotas do ciclo
// (contratos, execuções, ack, dispatch, toggle) morreram junto com o ciclo; as
// do runner (redeem/heartbeat) não têm chamador no front por desenho (quem
// chama o runner é a máquina do usuário). Esta declaração garante que TODAS as
// rotas do transporte seguem DESCOBERTAS no backend real — remover ou renomear
// qualquer uma deixa este teste (e o gate) vermelhos antes do consumidor.
// F4 (dispatch slim, 2026-10-17): a fila de TEXTO acrescenta 4 rotas — 2 de
// SESSÃO (braco/pending, braco/result) e 2 de RUNNER por credencial de cabeçalho
// (runner/pending, runner/result). Continua SEM contrato/execução/auditoria.
test("declaração: rotas /api/v1/oae/* são descobertas no backend real", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const fonte = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "backend", "src", "routes", "oae.ts"),
    "utf8",
  );
  const rotas = extrairRotasBackend(fonte)
    .map((r) => r.path)
    .sort();
  assert.deepEqual(rotas, [
    "/api/v1/oae/braco/pending",
    "/api/v1/oae/braco/result",
    "/api/v1/oae/pairing/codes",
    "/api/v1/oae/pairing/redeem",
    "/api/v1/oae/runner/heartbeat",
    "/api/v1/oae/runner/pending",
    "/api/v1/oae/runner/result",
    "/api/v1/oae/runner/revoke",
    "/api/v1/oae/runner/status",
  ]);
});
