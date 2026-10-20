// scripts/__tests__/verificar-relacao-decisoes.test.cjs
// Self-test do gate da declaração de relação com decisões ativas
// (scripts/verificar-relacao-decisoes.cjs — FRAME-LACO-ESTADO-20261002).
//
// Cobre: parse do name-status com renames; filtro de ADICIONADOS sob snapshots/
// (M/R/C isentos — sem retroatividade); campo ausente; valor fora do enum;
// sem-contradicao ok; substitui com/sem IDs; ID inexistente e não-deprecated no
// ledger; índice do ledger; âncora ^ da chave (menção em prosa não conta);
// snapshot real do frame passa no próprio gate.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const mod = require(path.join(__dirname, "..", "verificar-relacao-decisoes.cjs"));
const { parseNameStatus, snapshotsAdicionados, lerCampo, idsSubstituidos, validarSnapshot, indiceUnidades } = mod;

test("parseNameStatus: A/M simples e R100 com dois caminhos", () => {
  const entries = parseNameStatus("A\tLILA-DEV/planejamento/snapshots/frames/X.md\nM\tLILA-DEV/planejamento/snapshots/sprints/Y.md\nR100\tLILA-DEV/planejamento/snapshots/frames/old.md\tLILA-DEV/planejamento/snapshots/frames/new.md");
  assert.strictEqual(entries.length, 3);
  assert.deepStrictEqual(entries[0], { status: "A", paths: ["LILA-DEV/planejamento/snapshots/frames/X.md"] });
  assert.strictEqual(entries[2].status, "R100");
  assert.strictEqual(entries[2].paths.length, 2);
});

test("snapshotsAdicionados: só status A sob snapshots/ com .md; M/R/C isentos", () => {
  const entries = parseNameStatus([
    "A\tLILA-DEV/planejamento/snapshots/frames/NOVO.md",
    "A\tdocs/outro.md",
    "A\tLILA-DEV/planejamento/snapshots/frames/SEMEXT.txt",
    "M\tLILA-DEV/planejamento/snapshots/frames/EDITADO.md",
    "R100\tLILA-DEV/planejamento/snapshots/frames/VELHO.md\tLILA-DEV/planejamento/snapshots/frames/NOVO-NOME.md",
    "C75\tLILA-DEV/planejamento/snapshots/sprints/COPIA.md\tLILA-DEV/planejamento/snapshots/sprints/DESTINO.md",
  ].join("\n"));
  assert.deepStrictEqual(snapshotsAdicionados(entries), ["LILA-DEV/planejamento/snapshots/frames/NOVO.md"]);
});

test("lerCampo: ausente, enum ok, enum inválido; âncora ^ ignora menção em prosa", () => {
  assert.strictEqual(lerCampo("texto sem campo").valor, null);
  const ok = lerCampo("prefixo\nRelacao decisoes ativas: sem-contradicao — verificacao: grafo area ferramentas\n");
  assert.strictEqual(ok.tipo, "sem-contradicao");
  const sub = lerCampo("Relacao decisoes ativas: substitui FRAME-X.U1, FRAME-Y.U2 — deprecacao: via MCP no fechamento");
  assert.strictEqual(sub.tipo, "substitui");
  const invalido = lerCampo("Relacao decisoes ativas: nao sei");
  assert.strictEqual(invalido.tipo, null);
  // menção em prosa (meio de linha) NÃO é o campo — âncora ^ obrigatória
  const prosa = lerCampo("DECISAO: D1 — campo `Relacao decisoes ativas:` é obrigatório\n");
  assert.strictEqual(prosa.valor, null);
});

test("idsSubstituidos: extrai formato <NODE>.U<n>, deduplica, ignora lixo", () => {
  assert.deepStrictEqual(
    idsSubstituidos(" FRAME-X.U1, FRAME-Y-01.U2 — deprecacao: via MCP"),
    ["FRAME-X.U1", "FRAME-Y-01.U2"]
  );
  assert.deepStrictEqual(idsSubstituidos(" FRAME-X.U1 FRAME-X.U1"), ["FRAME-X.U1"]);
  assert.deepStrictEqual(idsSubstituidos("sem id algum aqui"), []);
});

test("validarSnapshot: sem campo, enum inválido, substitui órfão e não-deprecated", () => {
  const unidades = { "FRAME-X.U1": { status: "deprecated" }, "FRAME-Y.U2": { status: "ativa" } };

  const semCampo = validarSnapshot("f.md", "# snapshot sem campo\n", unidades);
  assert.strictEqual(semCampo.ok, false);
  assert.ok(semCampo.problemas[0].includes("SEM o campo"));

  const enumRuim = validarSnapshot("f.md", "Relacao decisoes ativas: talvez\n", unidades);
  assert.strictEqual(enumRuim.ok, false);
  assert.ok(enumRuim.problemas[0].includes("fora do enum"));

  assert.strictEqual(validarSnapshot("f.md", "Relacao decisoes ativas: sem-contradicao — verificacao: grafo\n", unidades).ok, true);

  const semId = validarSnapshot("f.md", "Relacao decisoes ativas: substitui — deprecacao: pendente\n", unidades);
  assert.ok(semId.problemas[0].includes("sem ID"));

  const orfao = validarSnapshot("f.md", "Relacao decisoes ativas: substitui FRAME-Z.U9\n", unidades);
  assert.ok(orfao.problemas[0].includes("não existe no decisoes-ledger"));

  const ativo = validarSnapshot("f.md", "Relacao decisoes ativas: substitui FRAME-Y.U2\n", unidades);
  assert.ok(ativo.problemas[0].includes("deprecate_unit"));

  const ok = validarSnapshot("f.md", "Relacao decisoes ativas: substitui FRAME-X.U1 — deprecacao: registrada\n", unidades);
  assert.strictEqual(ok.ok, true);
});

test("validarSnapshot: variante em NEGRITO do campo tem mensagem própria (#1194)", () => {
  // campo em negrito abrindo a linha: violação, mas com conserto apontado —
  // NUNCA "SEM o campo" (o campo está lá, só não abre a linha)
  const bold = validarSnapshot("f.md", "**Relacao decisoes ativas:** sem-contradicao — verificacao: plano aprovado\n", {});
  assert.strictEqual(bold.ok, false);
  assert.ok(bold.problemas[0].includes("NEGRITO"));
  assert.ok(bold.problemas[0].includes("sem `**`"));
  assert.ok(!bold.problemas[0].includes("SEM o campo"));

  // bold no MEIO da linha não é âncora — segue como campo ausente comum
  const meio = validarSnapshot("f.md", "texto com **Relacao decisoes ativas:** no meio\n", {});
  assert.strictEqual(meio.ok, false);
  assert.ok(meio.problemas[0].includes("SEM o campo"));

  // negrito na chave + valor no enum: ainda inválido (a forma canônica é sem `**`)
  const boldSub = validarSnapshot("f.md", "**Relacao decisoes ativas:** substitui FRAME-X.U1\n", {});
  assert.strictEqual(boldSub.ok, false);
  assert.ok(boldSub.problemas[0].includes("NEGRITO"));
});

test("indiceUnidades: mapa id→status do ledger real do repo", () => {
  const ledgerPath = path.join(__dirname, "..", "..", "LILA-DEV", "planejamento", "decisoes-ledger.json");
  const mapa = indiceUnidades(fs.readFileSync(ledgerPath, "utf8"));
  const ids = Object.keys(mapa);
  assert.ok(ids.length > 400, "ledger tem centenas de unidades");
  assert.ok(ids.every((id) => /\.[Uu]\d+$/.test(id)), "todas as IDs no formato .U<n>");
  assert.ok(Object.values(mapa).some((u) => u.status === "deprecated"));
});

test("o snapshot deste frame (adicionado no PR) passa no próprio gate", () => {
  const snapPath = path.join(__dirname, "..", "..", "LILA-DEV", "planejamento", "snapshots", "frames", "FRAME-LACO-ESTADO-20261002.md");
  const conteudo = fs.readFileSync(snapPath, "utf8");
  const ledgerPath = path.join(__dirname, "..", "..", "LILA-DEV", "planejamento", "decisoes-ledger.json");
  const r = validarSnapshot("FRAME-LACO-ESTADO-20261002.md", conteudo, indiceUnidades(fs.readFileSync(ledgerPath, "utf8")));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(lerCampo(conteudo).tipo, "sem-contradicao");
});
