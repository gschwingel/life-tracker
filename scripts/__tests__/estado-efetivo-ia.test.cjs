// Contrato canônico do FR-ESTADO-EFETIVO-IA-20260921 (decisão Igor: "o foco
// total do grafo é leitura de IA"):
//   I1 — índice derivado carrega o colapso unívoco: nó deprecated →
//        deprecated:true + estadoEfetivo "⚫"; nó vivo → sem chave deprecated
//        + estadoEfetivo === estado (ausência de sinal = vivo, por construção);
//   I2 — grafo ativo: nota começa com "⚫" ⟺ nó tem campo `deprecated`
//        (coesão do marcador — drift em qualquer direção mente para a IA);
//   I3 — o gate de schema detecta drift nas duas direções (ERRO + exit 1).
//
// FRONTEIRA (FRAME-GATES-ROTINAS-DIARIAS-20261015 D1/D2 + PATCH-FRESCOR-SUITE-FIXTURE-20261016):
//   - **I1 é exercitado em FIXTURE** (grafo sintético → índice gerado em tmp): a relação
//     "índice commitado reflete o grafo commitado" no repo REAL é do watchdog textual DIÁRIO
//     (05:20 UTC, entrega por PR) — a suíte não paga regen nem reprova PR por staleness.
//   - **I2/I3 permanecem repo-real/fixture** porque leem apenas o GRAFO (sem índice): não há
//     acoplamento de frescor a remover.

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const GATE = path.resolve(__dirname, "..", "validar-referencias-grafo.cjs");
const grafo = JSON.parse(fs.readFileSync(path.join(REPO, "LILA-DEV/planejamento/grafo.json"), "utf8"));

function nosAtivos() {
  const out = [];
  for (const c of ["keyframes", "sprints", "frames"]) for (const n of grafo[c] || []) if (n && n.id) out.push(n);
  return out;
}

test("I1 (fixture): colapso ⚫ do gerador — morto/vivo, cobertura e estado cru (repo-real = watchdog diário)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-estado-ia-gen-"));
  const raiz = path.join(tmp, "repo");
  fs.mkdirSync(path.join(raiz, "LILA-DEV", "planejamento"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "LILA-DEV", "execucao", "logs"), { recursive: true });
  const GERADOR = path.resolve(__dirname, "..", "gerar-indice-rastreabilidade.cjs");
  const fixture = {
    keyframes: [],
    sprints: [],
    frames: [
      { id: "FR-FIX-VIVO", estado: "🟢", snapshot: "LILA-DEV/planejamento/snapshots/frames/FR-FIX-VIVO.md", pai: null },
      { id: "FR-FIX-MORTO", estado: "🟢", snapshot: "LILA-DEV/planejamento/snapshots/frames/FR-FIX-MORTO.md", pai: null, deprecated: { em: "2026-10-06", motivo: "remocao" }, nota: "⚫ DEPRECADO (fixture)." },
    ],
  };
  fs.writeFileSync(path.join(raiz, "LILA-DEV", "planejamento", "grafo.json"), JSON.stringify(fixture));
  const r = spawnSync(process.execPath, [GERADOR], {
    cwd: raiz,
    encoding: "utf8",
    env: { ...process.env, INDICES_OUT_DIR: raiz },
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const indiceFix = JSON.parse(fs.readFileSync(path.join(raiz, "LILA-DEV", "indice-rastreabilidade.json"), "utf8"));
  const vivo = indiceFix.nos["FR-FIX-VIVO"];
  const morto = indiceFix.nos["FR-FIX-MORTO"];
  assert.ok(vivo && morto, "fixture: ambos os nós no índice");
  assert.ok(!("deprecated" in vivo), "vivo com flag deprecated espúria no índice");
  assert.strictEqual(vivo.estadoEfetivo, "🟢", "vivo com estadoEfetivo divergente");
  assert.strictEqual(morto.deprecated, true, "morto sem flag deprecated no índice");
  assert.strictEqual(morto.estadoEfetivo, "⚫", "morto sem estadoEfetivo ⚫");
  assert.strictEqual(morto.estado, "🟢", "estado cru (verdade de execução) deve permanecer");
  assert.strictEqual(vivo.estado, "🟢", "estado cru deve permanecer também nos vivos");
  // Cobertura (o que a I1 repo-real dava, agora SEM acoplamento de frescor): todo
  // nó com snapshot da fixture tem entry no índice gerado — a MESMA relação que o
  // watchdog textual diário verifica no repo real (detecção por conteúdo).
  for (const n of fixture.frames.filter((f) => f.snapshot)) {
    assert.ok(indiceFix.nos[n.id], "nó com snapshot ausente no índice: " + n.id);
  }
});

test("I2: grafo ativo — nota ⚫ ⟺ campo deprecated (0 violações)", () => {
  const violacoes = [];
  for (const n of nosAtivos()) {
    const nota = typeof n.nota === "string" ? n.nota.trim() : "";
    const morto = !!(n.deprecated && typeof n.deprecated === "object");
    const marcado = nota.startsWith("⚫");
    if (morto !== marcado) violacoes.push(n.id + (morto ? " (deprecated-sem-marcador)" : " (marcador-sem-deprecated)"));
  }
  assert.deepStrictEqual(violacoes, [], "drift de coesão ⚫: " + violacoes.join(", "));
});

test("I3: gate de schema detecta drift nas duas direções (ERRO + exit 1)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lila-estado-ia-"));
  const g = JSON.parse(JSON.stringify(grafo));
  // Direção 1: morto sem marcador — morte INJETADA na fixture (pós-lote o ativo
  // não carrega deprecated; o contrato é do gate, não do estoque do ativo).
  const morto = (g.frames || []).find((f) => f && f.id);
  assert.ok(morto, "fixture: precisa de nó de frame no ativo");
  morto.deprecated = { em: "2026-10-06", motivo: "remocao" };
  morto.nota = String(morto.nota || "").replace("⚫", "X");
  const p1 = path.join(tmp, "grafo-drift-1.json");
  fs.writeFileSync(p1, JSON.stringify(g));
  const r1 = spawnSync(process.execPath, [GATE, "--schema"], {
    encoding: "utf8",
    env: { ...process.env, LILA_GRAFO_PATH: p1 },
  });
  assert.strictEqual(r1.status, 1, "morte canônica sem ⚫ deve bloquear");
  assert.match(r1.stdout, /deprecated-sem-marcador/);

  // Direção 2: marcador sem morte.
  const g2 = JSON.parse(JSON.stringify(grafo));
  const vivo = (g2.frames || []).find((f) => !f.deprecated);
  assert.ok(vivo, "fixture: precisa de nó vivo no ativo");
  vivo.nota = "⚫ DEPRECADO (fantasma): " + (vivo.nota || "");
  const p2 = path.join(tmp, "grafo-drift-2.json");
  fs.writeFileSync(p2, JSON.stringify(g2));
  const r2 = spawnSync(process.execPath, [GATE, "--schema"], {
    encoding: "utf8",
    env: { ...process.env, LILA_GRAFO_PATH: p2 },
  });
  assert.strictEqual(r2.status, 1, "⚫ sem campo deprecated deve bloquear");
  assert.match(r2.stdout, /marcador-sem-deprecated/);
});
