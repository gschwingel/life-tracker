"use strict";

// Testes do gate de lote no pre-push (HB-009, item 5 do checklist docs/TESTING.md).
// Invariantes: roda quando o diff toca código/config; docs-only/índices-only
// dispensa; falha bloqueia o push e aponta o comando canônico; o hook nunca
// muta arquivos. Dependências injetadas (nenhum teste roda o gate real).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decideLoteGate, runLoteGate } = require("../pre-push.cjs");

const BASE = "origin/main";
const ok = () => ({ status: 0 });

function silenciar(fn) {
  const out = process.stdout.write;
  const err = process.stderr.write;
  let buffer = "";
  process.stdout.write = (c) => {
    buffer += c;
  };
  process.stderr.write = (c) => {
    buffer += c;
  };
  try {
    const r = fn();
    return { retorno: r, saida: buffer };
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

test("HB-009: diff com src/** -> gate de lote RODA", () => {
  const d = decideLoteGate({ base: BASE, arquivos: ["src/lib/models.ts"] });
  assert.equal(d.rodar, true);
  assert.match(d.motivo, /código\/config/);
});

test("HB-009: diff com backend/src/** -> gate de lote RODA", () => {
  const d = decideLoteGate({ base: BASE, arquivos: ["backend/src/routes/chat.ts"] });
  assert.equal(d.rodar, true);
});

test("HB-009: diff com scripts/** -> gate de lote RODA", () => {
  const d = decideLoteGate({ base: BASE, arquivos: ["scripts/pre-push.cjs"] });
  assert.equal(d.rodar, true);
});

test("HB-009: diff docs-only -> gate de lote DISPENSADO", () => {
  const d = decideLoteGate({ base: BASE, arquivos: ["docs/TESTING.md", "README.md"] });
  assert.equal(d.rodar, false);
  assert.match(d.motivo, /docs-only/);
});

test("HB-009: base indeterminada -> gate de lote RODA", () => {
  const d = decideLoteGate({ base: null, arquivos: ["docs/TESTING.md"] });
  assert.equal(d.rodar, true);
  assert.match(d.motivo, /indeterminada/);
});

test("HB-009: diff indisponível -> gate de lote RODA (falha de detecção nunca pula gate)", () => {
  const d = decideLoteGate({ base: BASE, arquivos: null });
  assert.equal(d.rodar, true);
});

test("HB-009: necessário e verde -> libera o push", () => {
  const { retorno } = silenciar(() =>
    runLoteGate({
      resolveBase: () => BASE,
      diffTocaCodigo: () => ({ rodar: true, motivo: "diff toca código/config (1 arquivo(s): src/a.ts)" }),
      runLote: ok,
    })
  );
  assert.equal(retorno, true);
});

test("HB-009: gate reprovado -> BLOQUEIA e aponta o comando canônico", () => {
  const { retorno, saida } = silenciar(() =>
    runLoteGate({
      resolveBase: () => BASE,
      diffTocaCodigo: () => ({ rodar: true, motivo: "diff toca código/config" }),
      runLote: () => ({ status: 1, stdout: "", stderr: "gate-lote FAIL" }),
    })
  );
  assert.equal(retorno, false);
  assert.match(saida, /gate de lote reprovou/);
  assert.match(saida, /node scripts\/gate-lote\.cjs/);
});

test("HB-009: dispensado -> não executa o gate e libera o push", () => {
  let chamou = false;
  const { retorno, saida } = silenciar(() =>
    runLoteGate({
      resolveBase: () => BASE,
      diffTocaCodigo: () => ({ rodar: false, motivo: "diff docs-only/índices-only (sem código/config)" }),
      runLote: () => {
        chamou = true;
        return ok();
      },
    })
  );
  assert.equal(retorno, true);
  assert.equal(chamou, false);
  assert.match(saida, /gate dispensado/);
});
