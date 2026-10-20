const { test } = require("node:test");
const assert = require("node:assert");
const {
  normalizarTexto, semAcentos, classificarLinhaSecao, dividirFrases, separarAnotacoes,
  extrairMetadataUnidade, extrairUnidades, palavrasChave, casaUnidade,
  declaracoesDoNo, declaracoesTopo, extrairDeclaracaoLimpezaOs, familiaDe
} = require("../grafo-normalize.cjs");

test("normalizarTexto: entidades, escapes e EOL", () => {
  assert.equal(normalizarTexto("a&#x20;b\r\nc\\-d\\_e"), "a b\nc-d_e");
  assert.equal(normalizarTexto("R&amp;D &lt;x&gt; &quot;q&quot;"), 'R&D <x> "q"');
});

test("semAcentos: remove diacríticos mantendo caixa", () => {
  assert.equal(semAcentos("DECISÕES de Negócio"), "DECISOES de Negocio");
});

test("classificarLinhaSecao: variantes canônicas", () => {
  assert.equal(classificarLinhaSecao("DECISÕES DE NEGÓCIO:").tipo, "decisao");
  assert.equal(classificarLinhaSecao("## Decisões de Negócio").tipo, "decisao");
  assert.equal(classificarLinhaSecao("DECISOES DE NEGOCIO:").tipo, "decisao");
  assert.equal(classificarLinhaSecao("DECISÕES DE NEGÓCIO CONSOLIDADAS:").tipo, "decisao");
  assert.equal(classificarLinhaSecao("DECISÕES DE REMEDIAÇÃO:").tipo, "decisao");
  assert.equal(classificarLinhaSecao("COMPORTAMENTO ESPERADO:").tipo, "comportamento");
  assert.equal(classificarLinhaSecao("COMPORTAMENTO RESULTANTE:").tipo, "comportamento");
  assert.equal(classificarLinhaSecao("## Comportamento Esperado").tipo, "comportamento");
  assert.equal(classificarLinhaSecao("TESTES DE VALIDACAO:").tipo, "skip");
  assert.equal(classificarLinhaSecao("CHECKS:").tipo, "skip");
  assert.equal(classificarLinhaSecao("ARQUIVOS PRODUZIDOS:").tipo, "skip");
  assert.equal(classificarLinhaSecao("## Frames de Negócio").tipo, "skip");
  assert.equal(classificarLinhaSecao("- Dado campo vazio, quando..."), null);
  assert.equal(classificarLinhaSecao("Texto comum de prosa."), null);
});

test("dividirFrases: fronteira pontuação + maiúscula", () => {
  const fs1 = dividirFrases("Primeira frase aqui. Segunda frase! Terceira? Final sem ponto");
  assert.equal(fs1.length, 4);
  assert.equal(fs1[0].texto, "Primeira frase aqui.");
  assert.equal(fs1[3].texto, "Final sem ponto");
});

test("dividirFrases: não quebra em sigla/ponto de arquivo", () => {
  const fs2 = dividirFrases("Usa google-drive.ts e RA-DD-MM-YYYY no Drive.");
  assert.equal(fs2.length, 1);
});

test("separarAnotacoes: extrai anotação e registra posição", () => {
  const r = separarAnotacoes("Frase deprecated termina aqui. → DEPRECATED 2026-08-22: motivo X Histórico persiste depois.");
  assert.equal(r.anotacoes.length, 1);
  assert.equal(r.anotacoes[0].data, "2026-08-22");
  assert.equal(r.anotacoes[0].motivo, "motivo X Histórico persiste depois.");
  assert.ok(!r.limpo.includes("DEPRECATED"));
});

test("extrairMetadataUnidade: tomada por nos dois estilos", () => {
  const a = extrairMetadataUnidade("Dado x, então y → tomada por: humano | data: 2026-04-28");
  assert.deepEqual([a.tomadaPor, a.data], ["humano", "2026-04-28"]);
  const b = extrairMetadataUnidade("Dado x, então y — tomada por: humano | 2026-08-26 (LIMPEZA-OS §2.7)");
  assert.deepEqual([b.tomadaPor, b.data], ["humano", "2026-08-26"]);
});

test("extrairUnidades: modo bullet com continuação e anotação inline", () => {
  const conteudo = [
    "NÓ: X", "", "DECISÕES DE NEGÓCIO:",
    "- Dado campo vazio, quando usuário tenta acionar Send, então",
    "  botão permanece desabilitado",
    "  → tomada por: humano | data: 2026-04-28",
    "- Dado histórico >30, quando envia, então trunca",
    "  → DEPRECATED 2026-08-22: nunca implementado",
    "", "ARQUIVOS PRODUZIDOS:", "- src/lib/store.ts"
  ].join("\n");
  const r = extrairUnidades(conteudo, "X");
  assert.equal(r.unidades.length, 2);
  assert.equal(r.unidades[0].id, "X.U1");
  assert.equal(r.unidades[0].tipo, "decisao");
  assert.equal(r.unidades[0].tomadaPor, "humano");
  assert.equal(r.unidades[1].anotacao.data, "2026-08-22");
  assert.ok(r.unidades[1].texto.includes("trunca"));
  assert.ok(!r.unidades[1].texto.includes("store.ts"));
});

test("extrairUnidades: modo prosa (frases) + delimitador header não classificado", () => {
  const conteudo = [
    "NÓ COLAPSADO: KF-X", "",
    "COMPORTAMENTO RESULTANTE:",
    "Usuário acessa o modal de Backlog e visualiza a lista carregada do Drive. Se o",
    "documento mestre não existir, o sistema o cria automaticamente.",
    "Usuário acessa a Agenda do Dia e visualiza eventos da Google Agenda.",
    "", "## Frames de Negócio", "", "| Frame | Testes |", "|---|---|",
    "", "DECISÕES DE REMEDIAÇÃO:",
    "- D-06 (2026-05-13): comportamento da câmera atualizado"
  ].join("\n");
  const r = extrairUnidades(conteudo, "KF-X");
  const frases = r.unidades.filter((u) => u.granularidade === "frase");
  assert.equal(frases.length, 3);
  assert.ok(frases[0].texto.startsWith("Usuário acessa o modal de Backlog"));
  assert.ok(frases[0].texto.includes("lista carregada do Drive."));
  assert.ok(frases[1].texto.startsWith("Se o documento mestre"));
  const remed = r.unidades.filter((u) => u.granularidade === "bullet");
  assert.equal(remed.length, 1);
  assert.ok(!r.unidades.some((u) => u.texto.includes("Frame | Testes")), "tabela não pode virar unidade");
});

test("casaUnidade: head, prefixo, >=2 tokens e não-casamento", () => {
  const kws = palavrasChave("decisões sobre o Backlog dedicado (BacklogModal + backlog-store no Drive)");
  assert.equal(kws[0], "backlog");
  assert.ok(casaUnidade("Usuário acessa o modal de Backlog e visualiza a lista.", kws).casa);
  assert.ok(casaUnidade("Documento mestre de backlogs não existir, o sistema cria.", kws).casa);
  assert.ok(!casaUnidade("Usuário acessa a Agenda do Dia e visualiza eventos da Google Agenda.", kws).casa);
  const kws2 = palavrasChave("WeeklyPlanModal (plano semanal) removido integralmente — gestão de agenda permanece via AgendaDoDia");
  assert.ok(casaUnidade("Usuário clica em PLANO SEMANAL e o modal abre com Planner.png", kws2).casa);
  assert.ok(!casaUnidade("Dado confirmação de sucesso da Google Agenda, então evento volta à opacidade normal.", kws2).casa
    || casaUnidade("Dado confirmação de sucesso da Google Agenda, então evento volta à opacidade normal.", kws2).motivo.includes("tokens"),
    "match por tokens genéricos deve ser rastreável no motivo");
});

test("palavrasChave: filtra stopwords e genéricas, head primeiro", () => {
  const kws = palavrasChave("decisões sobre Rituais (RA-DD-MM-YYYY/RF-DD-MM-YYYY gravados no Drive)");
  assert.equal(kws[0], "rituais");
  assert.ok(!kws.includes("decisoes") && !kws.includes("sobre"));
});

test("declaracoesDoNo: nota DEPRECATED substituicao, remocao e superseded_by", () => {
  const sub = declaracoesDoNo({ node: { nota: "DEPRECATED. Substituído por KF-TEST-REGRESSION. Norte antigo era 80% global — descartado." } });
  assert.equal(sub.length, 1);
  assert.equal(sub[0].origem, "nota");
  assert.equal(sub[0].tipo, "substituicao");
  assert.equal(sub[0].alvo, "KF-TEST-REGRESSION");
  const rem = declaracoesDoNo({ node: { nota: "DEPRECATED. Fora de escopo FASE 2." } });
  assert.equal(rem[0].tipo, "remocao");
  assert.equal(rem[0].alvo, null);
  const sup = declaracoesDoNo({ node: { superseded_by: "FR-TEST-REGR-01-01" } });
  assert.equal(sup[0].tipo, "substituicao");
  assert.equal(sup[0].alvo, "FR-TEST-REGR-01-01");
  assert.equal(declaracoesDoNo({ node: { nota: "17º keyframe. Backend auth." } }).length, 0,
    "nota sem DEPRECATED inicial não é declaração");
});

test("declaracoesTopo: mapeia nota_kf_test e marca inexistente como informativo", () => {
  const nos = new Map([["KF-TEST", { node: {}, grafo: "historico", nivel: "keyframe" }]]);
  const out = declaracoesTopo({ nota_kf_test: "DEPRECATED. Substituído por KF-TEST-REGRESSION.", nota_foo: "DEPRECATED. Substituído por X." }, nos);
  assert.equal(out.length, 2);
  assert.equal(out[0].node, "KF-TEST");
  assert.equal(out[0].tipo, "substituicao");
  assert.equal(out[1].node, null);
  assert.equal(out[1].tipo, "informativo");
});

test("extrairDeclaracaoLimpezaOs: variantes substituídas/substituído", () => {
  const d1 = extrairDeclaracaoLimpezaOs("DEPRECATED (SP-LIMPEZA-OS — 2026-08-26): decisões sobre o Backlog dedicado (BacklogModal + backlog-store no Drive) substituídas por FR-LIMPEZA-08 — fonte passa a ser Google Tasks.");
  assert.deepEqual([d1.data, d1.alvo], ["2026-08-26", "FR-LIMPEZA-08"]);
  assert.ok(d1.sujeito.includes("BacklogModal"));
  const d2 = extrairDeclaracaoLimpezaOs("DEPRECATED (SP-LIMPEZA-OS — 2026-08-26): WeeklyPlanModal (plano semanal) removido integralmente — modal + testes; gestão de agenda permanece. Substituído por FR-LIMPEZA-05.");
  assert.equal(d2.alvo, "FR-LIMPEZA-05");
  assert.equal(extrairDeclaracaoLimpezaOs("Texto sem declaração."), null);
});

test("filtrarJaNormalizados: remove já-deprecated (mesmo alvo), mantém reprovado/ativa e nó não feito", () => {
  const { filtrarJaNormalizados } = require("../grafo-normalize.cjs");
  const ledger = {
    unidades: [
      { id: "KF-X.U1", status: "deprecated", deprecated: { substituidoPor: "NOVO-1" } },
      { id: "KF-X.U2", status: "ativa", revisao: { status: "reprovado" } }
    ],
    nodos: [{ id: "KF-VIEJO" }]
  };
  const candidatos = [
    { node: "KF-X", granularidade: "unidade", unidadeId: "KF-X.U1", alvo: "NOVO-1" },   // já feito → remove
    { node: "KF-X", granularidade: "unidade", unidadeId: "KF-X.U2", alvo: "NOVO-1" },   // reprovado → reapresenta
    { node: "KF-X", granularidade: "unidade", unidadeId: "KF-X.U1", alvo: "OUTRO" },    // alvo diferente → mantém (novo redirecionamento)
    { node: "KF-VIEJO", granularidade: "nodo", unidadeId: null },                        // nó terminal → remove
    { node: "KF-NOVO", granularidade: "unidade", unidadeId: "KF-NOVO.U1", alvo: null }  // novo → mantém
  ];
  const restantes = filtrarJaNormalizados(candidatos, ledger);
  assert.deepEqual(restantes.map((c) => c.node + "|" + c.unidadeId).sort(),
    ["KF-NOVO|KF-NOVO.U1", "KF-X|KF-X.U1", "KF-X|KF-X.U2"]);
});

test("familiaDe: famílias TEST e OUTRA", () => {
  assert.equal(familiaDe("KF-TEST"), "TEST");
  assert.equal(familiaDe("KF-TEST-BACKEND"), "TEST");
  assert.equal(familiaDe("FR-TEST-01-01"), "TEST");
  assert.equal(familiaDe("SP-TEST-B05"), "TEST");
  assert.equal(familiaDe("KF-03"), "OUTRA");
});

// ── FR-GRAFO-T7A (A10): backfill de tomadaPor/data ────────────────────────────

const fs7 = require("node:fs");
const os7 = require("node:os");
const path7 = require("node:path");

const NORMALIZE_T7A = path7.resolve(__dirname, "..", "grafo-normalize.cjs");

function fixtureLedger(unidades) {
  const tmp = fs7.mkdtempSync(path7.join(os7.tmpdir(), "normalize-t7a-"));
  const ledgerPath = path7.join(tmp, "decisoes-ledger.json");
  fs7.writeFileSync(ledgerPath, JSON.stringify({ schema: "v1", unidades, nodos: [] }, null, 2));
  return { tmp, ledgerPath };
}

function rodarBackfill(ledgerPath) {
  return spawnSync(process.execPath, [NORMALIZE_T7A, "--backfill-tomada-por"], {
    encoding: "utf8",
    env: { ...process.env, LILA_GRAFO_LEDGER: ledgerPath }
  });
}

test("grafo-normalize (T7A/A10): backfill preenche tomadaPor/data do trailer, SEM alterar textos; idempotente", () => {
  const f = fixtureLedger([
    { id: "X.U1", texto: "Dado x, quando y, então z — tomada por: humano | 2026-08-30 (SNAPSHOT-BUDGET-TOAST; commit 151cc537)", tomadaPor: null, data: null },
    { id: "X.U2", texto: "Dado a, quando b, então c (sem trailer)", tomadaPor: null, data: null },
    { id: "X.U3", texto: "Dado p, quando q, então r", tomadaPor: "humano", data: "2026-08-29" }
  ]);
  const r1 = rodarBackfill(f.ledgerPath);
  assert.equal(r1.status, 0);
  assert.match(r1.stdout, /Unidades preenchidas a partir do trailer do texto: 1/);
  assert.match(r1.stdout, /X\.U1/);
  const ledger1 = JSON.parse(fs7.readFileSync(f.ledgerPath, "utf8"));
  assert.equal(ledger1.unidades[0].tomadaPor, "humano");
  assert.equal(ledger1.unidades[0].data, "2026-08-30");
  assert.equal(ledger1.unidades[0].texto, "Dado x, quando y, então z — tomada por: humano | 2026-08-30 (SNAPSHOT-BUDGET-TOAST; commit 151cc537)");
  assert.equal(ledger1.unidades[1].tomadaPor, null, "sem trailer permanece null");
  assert.equal(ledger1.unidades[2].tomadaPor, "humano", "já preenchida intacta");
  assert.equal(ledger1.unidades[2].data, "2026-08-29");
  // idempotência: segunda execução → 0 preenchimentos
  const r2 = rodarBackfill(f.ledgerPath);
  assert.match(r2.stdout, /Unidades preenchidas a partir do trailer do texto: 0/);
});

const { spawnSync } = require("node:child_process");
const fs4 = require("node:fs");
const os4 = require("node:os");
const path4 = require("node:path");

const NORMALIZE = path4.resolve(__dirname, "..", "grafo-normalize.cjs");

function rodarNormalize(tmp, args) {
  return spawnSync(process.execPath, [NORMALIZE].concat(args || []), {
    encoding: "utf8",
    env: {
      ...process.env,
      LILA_GRAFO_PATH: path4.join(tmp, "grafo.json"),
      LILA_GRAFO_HISTORICO: path4.join(tmp, "grafo-historico.json"),
      LILA_GRAFO_LEDGER: path4.join(tmp, "decisoes-ledger.json")
    }
  });
}

function fixtureNormalize() {
  const tmp = fs4.mkdtempSync(path4.join(os4.tmpdir(), "normalize-t4-"));
  const snapDir = path4.join(tmp, "snap");
  fs4.mkdirSync(snapDir, { recursive: true });
  fs4.writeFileSync(path4.join(snapDir, "FR-ORFAO.md"), ["# FR-ORFAO", "", "## DECISÕES DE NEGÓCIO", "", "- Dado x, quando y, então z"].join("\n"));
  fs4.writeFileSync(path4.join(tmp, "grafo.json"), JSON.stringify({
    keyframes: [], sprints: [],
    frames: [{ id: "FR-ORFAO", estado: "🟢", superseded_by: "PATH-GATE", snapshot: "snap/FR-ORFAO.md" }]
  }, null, 2));
  fs4.writeFileSync(path4.join(tmp, "grafo-historico.json"), JSON.stringify({ keyframes: [], sprints: [], frames: [] }, null, 2));
  fs4.writeFileSync(path4.join(tmp, "decisoes-ledger.json"), JSON.stringify({ schema: "v1", unidades: [], nodos: [] }, null, 2));
  return tmp;
}

test("grafo-normalize (T4/A7): alvo não resolvível vai para informativos alvo-nao-resolvivel, NUNCA para candidatos", () => {
  const tmp = fixtureNormalize();
  const r = rodarNormalize(tmp);
  assert.equal(r.status, 0, "dry-run não bloqueia (exit 0)");
  assert.match(r.stdout, /alvo-nao-resolvivel: "PATH-GATE" não resolve no universo consolidado/);
  assert.match(r.stdout, /INFORMATIVOS/);
  assert.match(r.stdout, /RESUMO: 0 candidato/);
  // FR-ORFAO não vira candidato (não aparece com [Cn] na seção de famílias)
  assert.doesNotMatch(r.stdout, /\[C\d+\] FR-ORFAO/);
});

test("grafo-normalize (T4/A7): idempotência — dry-run 2× produz saída idêntica (precedente 3bb5b99)", () => {
  const tmp = fixtureNormalize();
  const r1 = rodarNormalize(tmp);
  const r2 = rodarNormalize(tmp);
  assert.equal(r1.status, 0);
  assert.equal(r2.status, 0);
  // Idempotência de CONTEÚDO: única diferença legítima é o timestamp "Gerado em".
  const semTimestamp = (s) => s.split("\n").filter((l) => !/^Gerado em: /.test(l)).join("\n");
  assert.equal(semTimestamp(r1.stdout), semTimestamp(r2.stdout));
});

test("grafo-normalize (T4/A7): classificação retroativa — deprecated.substituido_por para conceito vira informativo (PATH-GATE/KF-TEST-QUALITY)", () => {
  const tmp = fixtureNormalize();
  const h = JSON.parse(fs4.readFileSync(path4.join(tmp, "grafo-historico.json"), "utf8"));
  h.sprints.push({ id: "SP-TEST-05", estado: "🟢", deprecated: { em: "2026-08-27", motivo: "contradicao", substituido_por: "PATH-GATE", fonte: "grafo-normalize" } });
  fs4.writeFileSync(path4.join(tmp, "grafo-historico.json"), JSON.stringify(h, null, 2));
  const r = rodarNormalize(tmp);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /alvo-nao-resolvivel \(retroativo, sem mutação\): deprecated\.substituido_por = "PATH-GATE"/);
  assert.match(r.stdout, /SP-TEST-05/);
});

