"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "..", "validar-referencias-grafo.cjs");

function fixture(ativo, historico) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "validar-refs-"));
  fs.writeFileSync(path.join(tmp, "grafo.json"), JSON.stringify(ativo, null, 2));
  fs.writeFileSync(path.join(tmp, "grafo-historico.json"), JSON.stringify(historico, null, 2));
  return tmp;
}

function rodar(tmp, args) {
  return spawnSync(process.execPath, [SCRIPT].concat(args || []), {
    encoding: "utf8",
    env: { ...process.env, LILA_GRAFO_PATH: path.join(tmp, "grafo.json"), LILA_GRAFO_HISTORICO: path.join(tmp, "grafo-historico.json") }
  });
}

test("validar-referencias-grafo: ERRO sem-prefixo-FR no ativo (STT-N05) + WARNINGs fósseis do histórico", () => {
  const tmp = fixture(
    { // ativo
      keyframes: [],
      sprints: [{ id: "SP-STT-NOHANDS", estado: "🟢", frames_negocio: ["FR-STT-N01", "STT-N05"] }],
      frames: [{ id: "FR-STT-N01", estado: "🟢" }]
    },
    { // histórico (fóssil)
      keyframes: [{ id: "KF-TEST-QUALITY", estado: "🟢" }],
      sprints: [
        { id: "SP-TEST-03", estado: "🟢", frames_negocio: ["FR-TEST-NOPE-01", "FR-TEST-NOPE-02"] },
        { id: "SP-TEST-05", estado: "🟢", substituido_por: "PATH-GATE" }
      ],
      frames: []
    }
  );
  const r = rodar(tmp);
  assert.equal(r.status, 1, "exit 1 — ERRO no ativo");
  assert.match(r.stdout, /ERRO\s+\| ativo \| sprints \| SP-STT-NOHANDS \| frames_negocio \| STT-N05 \| sem-prefixo-FR/);
  assert.match(r.stdout, /WARNING \| historico \| sprints \| SP-TEST-03 \| frames_negocio \| FR-TEST-NOPE-01 \| nao-resolvivel/);
  assert.match(r.stdout, /WARNING \| historico \| sprints \| SP-TEST-05 \| substituido_por \| PATH-GATE \| nao-resolvivel/);
  assert.match(r.stdout, /sem-prefixo-FR: 1/);
  // FR-STT-N01 resolvível não é listado
  assert.doesNotMatch(r.stdout, /FR-STT-N01/);
});

test("validar-referencias-grafo: universo resolvível → exit 0 e lista vazia", () => {
  const tmp = fixture(
    {
      keyframes: [{ id: "KF-X", estado: "🟢" }],
      sprints: [{ id: "SP-X", estado: "🟢", pai: "KF-X", frames_negocio: ["FR-X01"] }],
      frames: [{ id: "FR-X01", estado: "🟢", pai: "SP-X", depende_de: [] }]
    },
    { keyframes: [], sprints: [], frames: [] }
  );
  const r = rodar(tmp);
  assert.equal(r.status, 0, "exit 0 — sem erros no ativo");
  assert.match(r.stdout, /OK — todas as referências resolvem/);
});

test("validar-referencias-grafo: substituido_por aninhado em node.deprecated é validado (A3)", () => {
  const tmp = fixture(
    { keyframes: [], sprints: [], frames: [] },
    { // histórico (fóssil): alvo-conceito PATH-GATE escrito pelo batch em node.deprecated
      keyframes: [],
      sprints: [{ id: "SP-TEST-05", estado: "🟢", deprecated: { em: "2026-08-27", motivo: "contradicao", substituido_por: "PATH-GATE", fonte: "grafo-normalize" } }],
      frames: []
    }
  );
  const r = rodar(tmp);
  assert.equal(r.status, 0, "exit 0 — WARNING fóssil não bloqueia");
  assert.match(r.stdout, /WARNING \| historico \| sprints \| SP-TEST-05 \| deprecated\.substituido_por \| PATH-GATE \| nao-resolvivel/);
});

test("validar-referencias-grafo: gradiente por estado — dono 🟡 → WARNING pendente-materializacao, exit 0", () => {
  const tmp = fixture(
    { // ativo: sprint 🟡 em execução com forward refs para frames ainda não materializados
      keyframes: [],
      sprints: [{ id: "SP-RITUAIS-PERSISTENCIA", estado: "🟡", frames_negocio: ["FR-RITUAIS-P-N01"], desbloqueia: ["FR-RITUAIS-P-N01"] }],
      frames: []
    },
    { keyframes: [], sprints: [], frames: [] }
  );
  const r = rodar(tmp);
  assert.equal(r.status, 0, "exit 0 — WARNING não bloqueia");
  assert.match(r.stdout, /WARNING \| ativo\s+\| sprints \| SP-RITUAIS-PERSISTENCIA \| frames_negocio \| FR-RITUAIS-P-N01 \| nao-resolvivel \(pendente-materializacao/);
  assert.match(r.stdout, /Exit 0/);
});

test("validar-referencias-grafo --schema: A4 frames deslocados + A5 desbloqueia-frame em 🟢 = ERRO; exceção por nota; 🟡 = WARNING", () => {
  const tmp = fixture(
    { // ativo
      keyframes: [],
      sprints: [
        { id: "SP-SEM-01", estado: "🟢", frames_negocio: [], delegacoes_tecnicas: ["Implementa FR-SEM-01-1 e FR-SEM-01-2", "FR-SEM-01", "FR-SEM-02", "FR-SEM-03"] },
        { id: "SP-SEM-02", estado: "🟢", frames_negocio: [], delegacoes_tecnicas: ["FR-SEM-04"] },
        { id: "SP-SEM-03", estado: "🟢", frames_negocio: [], delegacoes_tecnicas: ["FR-SEM-05"] },
        { id: "SP-SEM-04", estado: "🟢", frames_negocio: [], delegacoes_tecnicas: ["FR-SEM-06", "FR-SEM-07"] },
        { id: "SP-18-Hardening", estado: "🟢", frames_negocio: ["FR-18-A"], desbloqueia: ["FR-18-A"], nota: "" },
        { id: "SP-18B-SEM-FALSO", estado: "🟢", frames_negocio: [], delegacoes_tecnicas: ["FR-18-HARD-N01"] },
        { id: "SP-EXCECAO", estado: "🟢", frames_negocio: ["FR-X01"], desbloqueia: ["FR-X01"], nota: "Legítimo: sprint que desbloqueia frame declarado — exceção com nota explícita" },
        { id: "SP-EM-CURSO", estado: "🟡", frames_negocio: ["FR-CURSO-01"], desbloqueia: ["FR-CURSO-01"] }
      ],
      frames: [{ id: "FR-18-A", estado: "🟢" }, { id: "FR-X01", estado: "🟢" }, { id: "FR-CURSO-01", estado: "🟢" }]
    },
    { keyframes: [], sprints: [], frames: [] }
  );
  const r = rodar(tmp, ["--schema"]);
  assert.equal(r.status, 1, "exit 1 — ERROs de schema em nós 🟢");
  // Regra 1 (A4): família casa → deslocados; texto livre sem prefixo não conta
  assert.match(r.stdout, /SP-SEM-01 \| delegacoes_tecnicas \| FR-SEM-01 \| frames-deslocados-de-campo/);
  assert.match(r.stdout, /SP-SEM-01 \| delegacoes_tecnicas \| FR-SEM-02 \| frames-deslocados-de-campo/);
  assert.match(r.stdout, /SP-SEM-01 \| delegacoes_tecnicas \| FR-SEM-03 \| frames-deslocados-de-campo/);
  assert.match(r.stdout, /SP-SEM-02 \| delegacoes_tecnicas \| FR-SEM-04 \| frames-deslocados-de-campo/);
  assert.match(r.stdout, /SP-SEM-03 \| delegacoes_tecnicas \| FR-SEM-05 \| frames-deslocados-de-campo/);
  assert.match(r.stdout, /SP-SEM-04 \| delegacoes_tecnicas \| FR-SEM-06 \| frames-deslocados-de-campo/);
  assert.match(r.stdout, /SP-SEM-04 \| delegacoes_tecnicas \| FR-SEM-07 \| frames-deslocados-de-campo/);
  // Falso positivo guardado: família "18-Hardening" não casa com "18-HARD-*"
  assert.doesNotMatch(r.stdout, /SP-18B-SEM-FALSO/);
  assert.doesNotMatch(r.stdout, /Implementa FR-SEM-01/);
  // Regra 2 (A5): desbloqueia com FR-* em dono 🟢
  assert.match(r.stdout, /SP-18-Hardening \| desbloqueia \| FR-18-A \| desbloqueia-frame/);
  // Exceção por nota: nada listado
  assert.doesNotMatch(r.stdout, /SP-EXCECAO/);
  // Gradiente: dono 🟡 → WARNING pendente-materializacao
  assert.match(r.stdout, /WARNING \| ativo \| sprints \| SP-EM-CURSO \| desbloqueia \| FR-CURSO-01 \| desbloqueia-frame \(pendente-materializacao/);
  assert.match(r.stdout, /frames-deslocados-de-campo: 7/);
  assert.match(r.stdout, /desbloqueia-frame: 2/);
  assert.match(r.stdout, /Resumo: 8 ERRO\(s\), 1 WARNING\(s\)/);
});

test("validar-referencias-grafo --schema: universo limpo → exit 0", () => {
  const tmp = fixture(
    { keyframes: [], sprints: [{ id: "SP-OK", estado: "🟢", frames_negocio: ["FR-OK01"], desbloqueia: ["SP-OUTRA"] }], frames: [{ id: "FR-OK01", estado: "🟢" }] },
    { keyframes: [], sprints: [], frames: [] }
  );
  const r = rodar(tmp, ["--schema"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /OK — nenhum desvio de schema/);
});

test("validar-referencias-grafo: campo com formato inválido é classificado", () => {
  const tmp = fixture(
    { keyframes: [], sprints: [{ id: "SP-BAD", estado: "🟢", desbloqueia: { quebra: true } }], frames: [] },
    { keyframes: [], sprints: [], frames: [] }
  );
  const r = rodar(tmp);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SP-BAD \| desbloqueia \| .* \| formato-invalido/);
});
