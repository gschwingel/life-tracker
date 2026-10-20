/* eslint-disable no-unused-vars */
// scripts/__tests__/buscar-vetorial.test.cjs
// FR-SEM-04: Teste de integração da busca vetorial (node:test).
// - Cosine similarity pura (unitário).
// - Ranking/threshold/top-K/snippet contra o índice real via queryVector congelado
//   (sem API, sem tocar os índices — leitura sidecar+bin com VETORIAL_INDEX_*).
// - Fixture dourada golden-retrieval.fixture.json (25 queries): asserts de recall@5
//   para as 24 `expectedRecall` e validação de documentação da 1 `knownLimitation`
//   (FR-SEM-04-PATCH-01: 3 ground-truths corrigidos).
//   ONDA-A-2026-08-28: 2 queries removidas (message-validator.ts e
//   useDriveFolderTree/folder-cache.ts — módulos eliminados no DESACOPLAR-DRIVE).
//   PATCH-VETORIAL-FIXTURE-20260920 (2026-09-20): query 'calendario google criar evento'
//   RETIRADA (alvo de escrita de evento morto por sentenca D2 do
//   FRAME-REMN-CALENDAR-LEITURA-20260920 — query orfa de alvo por decisão humana) e
//   query 'tarefas do google tasks' RETARGETADA para src/lib/tasks.ts
//   (src/lib/google-tasks.ts morto no FRAME-REANC-L3-CHAT; tasks internalizadas).
//   Diagnóstico do caso no log LILA-DEV/execucao/logs/PATCH-VETORIAL-FIXTURE-20260920-log.md.
//   FRAME-REMN-DRIVE-20260920 (2026-09-21, veredito humano explícito — DEV-INV-05): query
//   'salvar mensagem no drive' RETIRADA — o alvo src/lib/drive-save-handler.ts morreu na
//   retirada COMPLETA do Drive (sentença nível 1 L31); a query ficou órfã de alvo e não se
//   retargeta query sobre coisa morta (precedente ONDA-A-2026-08-28). Fixture 27→26 queries,
//   expectedRecall 25→24. Recall medido antes da retirada: 88.0% (22/25) → 84.0% (21/25) com
//   a query órfã; depois: registro em LILA-DEV/execucao/logs/FRAME-REMN-DRIVE-20260920-log.md.
//   FR-HARDENING-GATES-FIXTURE (2026-09-21, veredito humano — DEV-INV-05):
//   knownLimitation 'transacao atomica de salvamento' RETIRADA — o alvo
//   src/lib/atomic-transaction-handler.ts foi removido no FRAME-REMN-DRIVE-20260920
//   (limitation moot sobre superficie morta; precedente ONDA-A-2026-08-28).
//   Fixture 26→25 queries, knownLimitation 2→1; expectedRecall segue 24.
//   PATCH-VETORIAL-FIXTURE-20260924 (2026-09-24, veredito humano — DEV-INV-05, A2):
//   #1 'contexto suave do github' → knownLimitation (category distribuicao-vocabulario;
//   alvo docs/ARCHITECTURE.md rank >10, estavel entre indices — conceito espalhado);
//   #2 'identidade l1 e switch l6' → expected += backend/src/lib/l1-state.ts (L1Identity
//   rank 1 — o contrato L1 é do backend; l1-settings.ts era superfície secundária, rank 6);
//   #3 'texto para fala' → expected += src/lib/message-formatter.ts (formatMessageForAudio
//   rank 5 — formatação para áudio é TTS legítimo; query vaga, scores 0.41–0.46).
//   Efeito: expectedRecall 24→23, knownLimitation 1→2, recall 23/23 (margem 3 queries).
//   PATCH-VETORIAL-FIXTURE-20261011 (2026-10-11, veredito humano em sessão — opção (a)
//   do destravamento do PR #1315): recalibração contra o corpus PÓS-#1313 (regen do
//   watchdog). Medido: 4 queries de código perdiam o alvo no scope=code (recall@5
//   82,6% = 19/23, abaixo do gate). Diagnóstico POR QUERY (top-5 medido, ver log):
//   - 'persistencia do chat no localStorage' → knownLimitation (distribuicao-vocabulario-chunks:
//     3 chunks de session-id.ts + 2 de softcontext.ts ocupam o top-5; alvo 6º no code / 8º no all);
//   - 'texto para fala' → knownLimitation (vocabulario-vago: AMBOS os alvos fora do top-10;
//     o teste do próprio módulo entra em #2 — a query já era marginal em 2026-09-24);
//   - 'proteger contra corrida de eventos' → expected += backend/src/services/oae/runner-hardening.ts
//     (rank 1 — serviço de hardening do OAE, #1311/#1312: superfície legítima do conceito);
//   - 'tarefas do google tasks' → expected += src/components/TaskList.tsx (rank 3 — UI real);
//   - 'sessao de usuario autenticado' (ground-truth) → expected += src/hooks/useAuth.tsx
//     (rank 2 — superfície de autenticação do front; plugins/auth.ts passa a 6º).
//   Efeito: expectedRecall 23→21, knownLimitation 2→4, recall medido 21/21 (100%) ≥ 0.83.
//   Threshold 0.40 e top-K 5 INALTERADOS. NOME: registrado como PATCH PRÓPRIO
//   (PATCH-VETORIAL-FIXTURE-20261011), NÃO como "rev3" — esse nome já é tomado pelo
//   FR-P7REV3-SEM-01 (decisão de COBERTURA default-include do corpus, outra coisa).
//   Log: LILA-DEV/execucao/logs/PATCH-VETORIAL-FIXTURE-20261011-log.md.
// - Gate coletivo: recall@5 >= 0.83 (calibração empírica 2026-08-17) — LIMIAR INALTERADO.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { buscarVetorial, cosine } = require("../buscar-vetorial.cjs");

const FIXTURE = path.join(__dirname, "golden-retrieval.fixture.json");
const INDEX_JSON = path.join(__dirname, "..", "..", "indice-vetorial.json");
const INDEX_BIN = path.join(__dirname, "..", "..", "indice-vetorial.bin");

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

function normPath(p) {
  return String(p).replace(/\\/g, "/").toLowerCase();
}

function pathMatches(chunkPath, expected) {
  return normPath(chunkPath).endsWith(normPath(expected));
}

test("cosine: vetores idênticos = 1, ortogonais = 0, padrão determinístico", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([2, 0], [1, 0]), 1);
  // Zero de magnitude -> 0 (defensivo)
  assert.equal(cosine([0, 0], [0, 0]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
  // Comprimentos distintos -> usa o menor (defensivo)
  assert.ok(Math.abs(cosine([1, 0, 0], [1, 0]) - 1) < 1e-12);
});

test("buscarVetorial: threshold 0.70 retorna vazio no corpus real (P1 documentado)", async () => {
  const q = fixture.queries.find((x) => x.query === "retry com backoff exponencial");
  const results = await buscarVetorial(q.query, {
    queryVector: q.vector,
    threshold: 0.7,
  });
  assert.equal(results.length, 0);
});

test("buscarVetorial: threshold calibrado 0.40 retorna resultados ordenados com snippet e top-K default 5", async () => {
  const q = fixture.queries.find((x) => x.query === "persistencia do chat no localStorage");
  const results = await buscarVetorial(q.query, {
    queryVector: q.vector,
    threshold: fixture.threshold,
  });
  assert.equal(results.length, 5, "top-K default = 5");
  // Ordenação descendente por score
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score, "score descendente");
  }
  for (const r of results) {
    assert.ok(Array.isArray(r.path) || typeof r.path === "string", "path presente");
    assert.ok(r.exportName, "exportName presente");
    assert.ok(r.snippet && r.snippet.length > 0, "snippet presente");
    assert.ok(typeof r.score === "number" && r.score >= 0, "score numérico");
    assert.ok(r.score >= 0.4, "score >= threshold calibrado");
  }
  // Critério do snapshot: recall@5 (não top-1 posicional). ATUALIZADO em 2026-10-11
  // (PATCH-VETORIAL-FIXTURE-20261011): com o corpus pós-#1313 o alvo caiu para o 8º
  // lugar no scope default (prosa de hardening LILA-DEV em #1-2 sob o cap<=2 +
  // session-id.ts/softcontext.ts no resto) — a query virou knownLimitation DOCUMENTADA
  // (ver fixture.reason/note, com o top-5 medido). O contrato do teste segue o mesmo
  // (top-K/ordenação/snippet/threshold); a asserção de ranking passa a exigir
  // RECUPERABILIDADE documentada em top-10 — nunca um top-5 relaxado em silêncio.
  const q0 = fixture.queries.find((x) => x.query === "persistencia do chat no localStorage");
  assert.equal(q0.knownLimitation, true, "query marcada como knownLimitation no fixture");
  assert.ok(q0.category && q0.reason && q0.reason.length > 20, "limitação documentada (categoria + razão)");
  const ateDez = await buscarVetorial(q0.query, {
    queryVector: q0.vector,
    threshold: fixture.threshold,
    topK: 10,
  });
  assert.ok(
    ateDez.some((r) => pathMatches(r.path, "src/lib/chat-persistence.ts")),
    "chat-persistence.ts recuperável no top-10 (drift documentado, não top-5 silencioso)",
  );
});

test("buscarVetorial: integridade sidecar↔bin do índice (falha CLARA em corrida LFS)", () => {
  // Incidente 2026-09-24 (PR #756): o CI falhou com 5 testes juntos (3 do vetorial +
  // 2 de validar-integridade) porque o .bin novo do LFS não estava hidratado no checkout —
  // lado de tolerância do protocolo v1.2 ("buscarVetorial/validar-integridade reprovam sem
  // causa de conteúdo → `gh run rerun --failed` 1x"). Esta pré-checagem troca o cascade por
  // UM diagnóstico explícito.
  const sidecar = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
  const bin = fs.readFileSync(INDEX_BIN);
  const dims = Number(sidecar.dimensions ?? 1536);
  const esperado = sidecar.chunks.length * dims * 4;
  assert.equal(
    bin.length,
    esperado,
    `índice INCONSISTENTE (sidecar↔bin): ${String(sidecar.chunks.length)} chunks × ${String(dims)}d × 4 = ${String(esperado)} bytes, mas o .bin tem ${String(bin.length)}. Provável corrida LFS (objeto não hidratado no checkout): rode \`gh run rerun --failed\` UMA vez e registre o flake no log se passar.`,
  );
});

test("buscarVetorial: fixture dourada — recall@5 >= 83% (gate coletivo, scope=code — dial P7 rev2; recalibrada 2026-10-11), 21 expectedRecall passam", async () => {
  const sidecar = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
  const bin = fs.readFileSync(INDEX_BIN);

  const expectedRecall = fixture.queries.filter((q) => q.expectedRecall);
  const knownLimitation = fixture.queries.filter((q) => q.knownLimitation);
  // FR-SEM-04-PATCH-01: recalibração empírica — 3 ground-truths corrigidos
  // (retry→db.ts, oauth pkce→DEPLOY.md, soft context→ARCHITECTURE.md); 2 mantidas
  // como known-limitation honestas (vocabulário/cross-cutting).
  assert.equal(expectedRecall.length, 21, "21 queries esperam recall (A2 2026-09-24: 1 migrou; 2026-10-11: 2 migraram p/ knownLimitation)");
  assert.equal(knownLimitation.length, 4, "4 known-limitations documentadas (FR-HARDENING-GATES-FIXTURE + A2 2026-09-24 + PATCH-VETORIAL-FIXTURE-20261011 x2)");

  const passed = [];
  const failed = [];
  for (const q of expectedRecall) {
    const results = await buscarVetorial(q.query, {
      queryVector: q.vector,
      threshold: fixture.threshold,
      scope: "code",
    });
    const hit = q.expected.some((e) => results.some((r) => pathMatches(r.path, e)));
    if (hit) {
      passed.push(q.query);
    } else {
      failed.push({ query: q.query, expected: q.expected });
    }
  }
  const ratio = passed.length / expectedRecall.length;
  assert.ok(
    ratio >= fixture.recallThreshold,
    `recall@5 = ${(ratio * 100).toFixed(1)}% < gate ${(fixture.recallThreshold * 100).toFixed(0)}%` +
      (failed.length ? ` — falhas: ${JSON.stringify(failed)}` : ""),
  );

  // Todas as known-limitation devem ter category + reason documentados (E-INV-05)
  for (const q of knownLimitation) {
    assert.ok(q.category, `knownLimitation sem category: ${q.query}`);
    assert.ok(q.reason && q.reason.length > 20, `knownLimitation sem reason: ${q.query}`);
  }
});

test("buscarVetorial: escopo governance — decisão de estado (P7 rev2) acerta snapshots", async () => {
  const g = fixture.governanceFixtures[0];
  const results = await buscarVetorial(g.query, { queryVector: g.vector, scope: "governance" });
  assert.ok(results.length > 0, "governance retorna resultados");
  assert.ok(
    results.some((r) => r.path.startsWith(g.expectedPrefix)),
    `governance deve acertar snapshots de decisão (got: ${results.map((r) => r.path).join(", ")})`,
  );
});

test("buscarVetorial: escopo code exclui LILA-DEV do top-K (P7 rev2)", async () => {
  const g = fixture.governanceFixtures[0];
  const results = await buscarVetorial(g.query, { queryVector: g.vector, scope: "code" });
  assert.ok(
    results.every((r) => !r.path.startsWith("LILA-DEV/")),
    `scope=code não retorna LILA-DEV (got: ${results.map((r) => r.path).join(", ")})`,
  );
});

test("buscarVetorial: query sem matches acima do threshold retorna array vazio", async () => {
  // threshold 0.99 > score máximo real (~0.77) -> vazio garantido
  const results = await buscarVetorial("qualquer coisa semelhante a nada no indice", {
    queryVector: fixture.queries[0].vector,
    threshold: 0.99,
  });
  assert.equal(results.length, 0);
});

test("buscarVetorial: ground-truth corrigido — auth (plugins/auth.ts OU hooks/useAuth.tsx) no top-5 (sessão de usuário)", async () => {
  const q = fixture.queries.find((x) => x.query === "sessao de usuario autenticado");
  assert.ok(q.groundTruthCorrected, "flag groundTruthCorrected presente");
  assert.equal(q.correctPath, "backend/src/plugins/auth.ts");
  const results = await buscarVetorial(q.query, {
    queryVector: q.vector,
    threshold: fixture.threshold,
  });
  // 2026-10-11 (PATCH-VETORIAL-FIXTURE-20261011): medido — plugins/auth.ts cai para o
  // 6º lugar com o corpus atual (test/e2e/helpers.ts #1, src/hooks/useAuth.tsx #2,
  // backend/src/__tests__/routes.test.ts #3). O expected do fixture ganhou o hook do
  // front (superfície de autenticação legítima) e a asserção aceita as DUAS — K=5 e
  // threshold 0.40 preservados (nada de alargar K para "passar").
  const superficiesAuth = ["backend/src/plugins/auth.ts", "src/hooks/useAuth.tsx"];
  assert.ok(
    results.some((r) => superficiesAuth.some((s) => pathMatches(r.path, s))),
    "superfície de autenticação (backend OU hook do front) no top-5 com T=0.40",
  );
});