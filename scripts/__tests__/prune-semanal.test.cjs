// scripts/__tests__/prune-semanal.test.cjs
// Suíte node:test para prune-semanal.cjs (retenção semanal 1x/semana — semana ISO —
// FDV-EXEC E5, EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001).
// Sandbox via PRUNE_DIARIO_BASE_DIR (marcador) + PRUNE_BASE_DIR (prune) — datas das
// fixtures calculadas relativas à data real para rodar em qualquer dia.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SEMANAL = path.join(__dirname, "..", "prune-semanal.cjs");
// H8 (item 4): o módulo exporta o núcleo puro do `--apply` (guard require.main garante
// que o import NÃO executa o prune).
const { extraArgsDoPrune, semanaISO } = require("../prune-semanal.cjs");

function diasAtras(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function utcData(ano, mes, dia) {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function criarSandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prune-semanal-"));
  fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
  // keep (4d), dehydrate (16d), archive (31d)
  fs.writeFileSync(path.join(tmp, "CHANGELOG.md"), [
    "# CHANGELOG",
    "",
    `## [FEAT] Nova — ${diasAtras(4)}`,
    "Detalhe A",
    "",
    `## [FIX] Antiga — ${diasAtras(31)}`,
    "Detalhe B",
    "",
    `## [FEAT] Media — ${diasAtras(16)}`,
    "Detalhe C",
    "",
  ].join("\n"));
  // Manifesto sem cauda meta_* (extinta na v3.0) — o prune nao toca docs/.
  fs.writeFileSync(path.join(tmp, "docs", "AI-PROJECT-MANIFEST.md"), [
    "# AI-PROJECT-MANIFEST",
    "",
    "Conteudo.",
  ].join("\n"));
  const logsDir = path.join(tmp, "LILA-DEV", "execucao", "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, "TEST-1-log.md"), `# Log\n\n**Data:** ${diasAtras(4)}\n`);
  fs.writeFileSync(path.join(logsDir, "TEST-2-log.md"), `# Log\n\n**Data:** ${diasAtras(31)}\n`);
  fs.writeFileSync(path.join(logsDir, "TEST-3-log.md"), `# Log\n\n**Data:** ${diasAtras(16)}\n`);
  fs.writeFileSync(path.join(logsDir, "TEST-4-log.md"), "# Log sem data\n");
  return tmp;
}

function rodar(args, sandbox) {
  return spawnSync(process.execPath, [SEMANAL, ...args], {
    encoding: "utf8",
    env: { ...process.env, PRUNE_DIARIO_BASE_DIR: sandbox, PRUNE_BASE_DIR: sandbox, PRUNE_SEMANAL_SEM_GUARDA: "1" },
  });
}

// LOTE-HIGIENE-FAROL-20261002 — casos que EXERCITAM a guarda acoplada: fixtures
// determinísticas via LILA_GRAFO_PATH + LILA_FLIPS_LOG_DIR (a guarda lê esses envs).
function rodarComGuarda(args, sandbox, { grafoFixture, logsFlips }) {
  return spawnSync(process.execPath, [SEMANAL, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PRUNE_DIARIO_BASE_DIR: sandbox,
      PRUNE_BASE_DIR: sandbox,
      PRUNE_SEMANAL_SEM_GUARDA: "", // explícito LIGADA
      // PATCH-JEV-CORPUS-GUARD-20261004: a guarda de corpus JEV é DESLIGADA nestes casos
      // (foco no guard de flips; a JEV tem suíte própria + caso de acoplamento dedicado).
      JEV_SEMANAL_SEM_GUARDA: "1",
      LILA_GRAFO_PATH: grafoFixture,
      LILA_FLIPS_LOG_DIR: logsFlips,
    },
  });
}

function criarFixturesGuarda(sandbox, { estado = "🟡", comEvidencia = true, grafoIlegivel = false } = {}) {
  const grafoFixture = path.join(sandbox, "grafo-fixture.json");
  if (grafoIlegivel) {
    fs.writeFileSync(grafoFixture, "{ grafo quebrado", "utf8");
  } else {
    fs.writeFileSync(grafoFixture, JSON.stringify({
      keyframes: [],
      sprints: [],
      frames: [{ id: "FR-FLIPS-FIXTURE-X", pai: null, estado }],
    }), "utf8");
  }
  const logsFlips = path.join(sandbox, "logs-flips");
  fs.mkdirSync(logsFlips, { recursive: true });
  fs.writeFileSync(
    path.join(logsFlips, "FR-FLIPS-FIXTURE-X-log.md"),
    comEvidencia ? "# Log\n\nFR-FLIPS-FIXTURE-X executado e merged via PR #42.\n" : "# Log sem evidência.\n",
    "utf8",
  );
  return { grafoFixture, logsFlips };
}

function lerMarcador(sandbox) {
  try {
    return JSON.parse(fs.readFileSync(path.join(sandbox, "LILA-DEV", "execucao", ".prune-marker.json"), "utf8"));
  } catch {
    return null;
  }
}

const HOJE = diasAtras(0);
const SEMANA_ATUAL = semanaISO(new Date());

test("prune-semanal --help sai com 0 e imprime uso", () => {
  const sandbox = criarSandbox();
  try {
    const r = rodar(["--help"], sandbox);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Uso: node scripts\/prune-semanal\.cjs \[--apply\] \[--force\]/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("semanaISO: âncoras fixas da ISO 8601 (quinta define o ano; semana = segunda)", () => {
  assert.strictEqual(semanaISO(utcData(2026, 1, 1)), "2026-W01"); // quinta → W01 do próprio ano
  assert.strictEqual(semanaISO(utcData(2025, 12, 29)), "2026-W01"); // segunda cuja quinta é 2026-01-01
  assert.strictEqual(semanaISO(utcData(2026, 12, 28)), "2026-W53"); // 2026 tem 53 semanas (1/jan quinta)
  assert.strictEqual(semanaISO(utcData(2027, 1, 4)), "2027-W01"); // segunda cuja quinta é 2027-01-07
});

test("prune-semanal: 1ª execução da semana roda dry-run e grava marcador; 2ª skip", () => {
  const sandbox = criarSandbox();
  try {
    const r1 = rodar([], sandbox);
    assert.strictEqual(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /prune-historico \(DRY-RUN\)/);
    assert.match(r1.stdout, /logs: manter=1 desidratar=0 arquivar=2 semData=1/);
    assert.match(r1.stdout, /aguardando aprovação humana para --apply/);
    assert.deepStrictEqual(lerMarcador(sandbox), { ultimaSemana: SEMANA_ATUAL });

    const r2 = rodar([], sandbox);
    assert.strictEqual(r2.status, 0);
    assert.match(r2.stdout, /já verificada nesta semana \(2026-W\d\d\) — skip/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-semanal: marcador legado da cadência diária (ultimaData) = semana não verificada — executa e regrava", () => {
  const sandbox = criarSandbox();
  try {
    const markerPath = path.join(sandbox, "LILA-DEV", "execucao", ".prune-marker.json");
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({ ultimaData: HOJE }, null, 2) + "\n");

    const r1 = rodar([], sandbox);
    assert.strictEqual(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /prune-historico \(DRY-RUN\)/); // NÃO foi skip
    assert.deepStrictEqual(lerMarcador(sandbox), { ultimaSemana: SEMANA_ATUAL });

    const r2 = rodar([], sandbox); // semana já registrada a partir de agora
    assert.strictEqual(r2.status, 0);
    assert.match(r2.stdout, /já verificada nesta semana/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-semanal --apply aplica (arquiva 31d, desidrata 16d) após dry-run", () => {
  const sandbox = criarSandbox();
  try {
    const r1 = rodar([], sandbox); // dry-run + marcador
    assert.strictEqual(r1.status, 0, r1.stderr);

    const r2 = rodar(["--apply"], sandbox); // aplicação (ignora o gate do marcador)
    assert.strictEqual(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /prune-historico \(APLICADO\)/);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs-arquivo", "TEST-2-log.md")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs-arquivo", "TEST-3-log.md")), true);
    assert.strictEqual(fs.existsSync(path.join(sandbox, "LILA-DEV", "execucao", "logs", "TEST-2-log.md")), false);
    assert.deepStrictEqual(lerMarcador(sandbox), { ultimaSemana: SEMANA_ATUAL });
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("prune-semanal --force re-executa na mesma semana ignorando o marcador", () => {
  const sandbox = criarSandbox();
  try {
    const r1 = rodar([], sandbox);
    assert.strictEqual(r1.status, 0, r1.stderr);

    const r2 = rodar(["--force"], sandbox);
    assert.strictEqual(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /prune-historico \(DRY-RUN\)/); // não foi skip
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

// ── H8 (item 4) — a regra do `--apply` como contrato ─────────────────────────

test("extraArgsDoPrune: sem --apply o prune roda em DRY-RUN (nenhuma escrita)", () => {
  assert.deepStrictEqual(extraArgsDoPrune({ apply: false }), ["--dry-run"]);
});

test("extraArgsDoPrune: com --apply o prune aplica (array vazio de flags)", () => {
  assert.deepStrictEqual(extraArgsDoPrune({ apply: true }), []);
});

test("extraArgsDoPrune: o flag é booleano estrito — nada é inferido de outro eixo", () => {
  // `--force` não entra nesta função por desenho: re-verificar na mesma semana e
  // APLICAR são eixos independentes (o script chama com `apply: APPLY`).
  assert.deepStrictEqual(extraArgsDoPrune({ apply: undefined }), ["--dry-run"]);
  assert.deepStrictEqual(extraArgsDoPrune({ apply: 1 }), []);
});

// ── LOTE-HIGIENE-FAROL-20261002 — guarda semanal acoplada à passada real ──────

test("guarda acoplada: passada semanal roda a guarda e reporta achado como item obrigatório, exit 0", () => {
  const sandbox = criarSandbox();
  try {
    const fx = criarFixturesGuarda(sandbox); // nó 🟡 com evidência merged (PR #42)
    const r = rodarComGuarda([], sandbox, fx);
    assert.strictEqual(r.status, 0, r.stderr); // NÃO-bloqueante
    assert.match(r.stdout, /GUARDA SEMANAL DE FLIPS PENDENTES/);
    assert.match(r.stdout, /ACHADO \| FR-FLIPS-FIXTURE-X/);
    assert.match(r.stdout, /OBRIGATÓRIO do\n?\s*relatório desta sessão ao humano|item OBRIGATÓRIO/s);
    assert.match(r.stdout, /NUNCA auto-flip/);
    assert.deepStrictEqual(lerMarcador(sandbox), { ultimaSemana: SEMANA_ATUAL }); // passada normal aconteceu
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("guarda acoplada: sem achados imprime linha positiva e exit 0", () => {
  const sandbox = criarSandbox();
  try {
    const fx = criarFixturesGuarda(sandbox, { estado: "🟢" }); // nó já verde
    const r = rodarComGuarda([], sandbox, fx);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /GUARDA SEMANAL DE FLIPS PENDENTES/);
    assert.match(r.stdout, /Nenhum achado/);
    assert.doesNotMatch(r.stdout, /ACHADO \|/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("guarda acoplada: falha de infraestrutura da guarda NÃO bloqueia o prune (exit 0) e NÃO vira 'sem achados'", () => {
  const sandbox = criarSandbox();
  try {
    const fx = criarFixturesGuarda(sandbox, { grafoIlegivel: true });
    const r = rodarComGuarda([], sandbox, fx);
    assert.strictEqual(r.status, 0, r.stderr); // prune segue 0
    assert.match(r.stdout, /FALHA DE INFRAESTRUTURA/);
    assert.match(r.stdout, /NÃO tratar como "sem achados"/);
    assert.deepStrictEqual(lerMarcador(sandbox), { ultimaSemana: SEMANA_ATUAL });
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("guarda acoplada: skip semanal pula a guarda junto (nenhum banner na 2ª execução)", () => {
  const sandbox = criarSandbox();
  try {
    const fx = criarFixturesGuarda(sandbox);
    const r1 = rodarComGuarda([], sandbox, fx);
    assert.strictEqual(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /GUARDA SEMANAL DE FLIPS PENDENTES/); // 1ª passada roda

    const r2 = rodarComGuarda([], sandbox, fx);
    assert.strictEqual(r2.status, 0);
    assert.match(r2.stdout, /já verificada nesta semana/);
    assert.doesNotMatch(r2.stdout, /GUARDA SEMANAL DE FLIPS PENDENTES/); // skip pula a guarda
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("contarAchados: conta só linhas que COMEÇAM com ACHADO (âncora de linha)", () => {
  const { contarAchados } = require("../prune-semanal.cjs");
  assert.strictEqual(contarAchados("ACHADO | A\nACHADO | B\nxxx ACHADO | C"), 2); // menção no meio da linha não conta
  assert.strictEqual(contarAchados("nenhum achado"), 0);
  assert.strictEqual(contarAchados(""), 0);
});

// ── PATCH-JEV-CORPUS-GUARD-20261004 — guarda de SAÚDE DO CORPUS JEV acoplada ─

/** Roda o prune com a guarda JEV ligada/desligada e um fixture de linhas (env JEV_CORPUS_ROWS_JSON). */
function rodarComGuardaJev(args, sandbox, { rowsJson = null, jevLigada = true } = {}) {
  const fx = criarFixturesGuarda(sandbox, { estado: "🟢" }); // flips sem achado (isola o banner JEV)
  const env = {
    ...process.env,
    PRUNE_DIARIO_BASE_DIR: sandbox,
    PRUNE_BASE_DIR: sandbox,
    PRUNE_SEMANAL_SEM_GUARDA: "", // geral LIGADO (não desliga a JEV por si)
    JEV_SEMANAL_SEM_GUARDA: jevLigada ? "" : "1",
    LILA_GRAFO_PATH: fx.grafoFixture,
    LILA_FLIPS_LOG_DIR: fx.logsFlips,
  };
  if (rowsJson) env.JEV_CORPUS_ROWS_JSON = rowsJson;
  else delete env.JEV_CORPUS_ROWS_JSON;
  delete env.JEV_DATABASE_URL;
  delete env.DATABASE_PUBLIC_URL;
  delete env.DATABASE_URL;
  return spawnSync(process.execPath, [SEMANAL, ...args], { encoding: "utf8", env });
}

test("guarda JEV acoplada: corpus doente (incidente) vira ACHADO no relatório, exit 0", () => {
  const sandbox = criarSandbox();
  try {
    const rowsPath = path.join(sandbox, "jev-rows.json");
    fs.writeFileSync(rowsPath, JSON.stringify(
      Array.from({ length: 25 }, () => ({
        auto_mode: true,
        jev_choice: null,
        jev_confidence: null,
        jev_probabilities: null,
        jev_model: "typesafe/jev-1.13-20260917",
        fallback_reason: "jev_contract_mismatch",
      })),
    ), "utf8");

    const r = rodarComGuardaJev([], sandbox, { rowsJson: rowsPath, jevLigada: true });
    assert.strictEqual(r.status, 0, r.stderr); // NÃO-bloqueante
    assert.match(r.stdout, /GUARDA SEMANAL DE SAUDE DO CORPUS JEV/);
    assert.match(r.stdout, /ACHADO \| CORPUS_SEM_CONFIANCA/);
    assert.match(r.stdout, /ACHADO\(S\) de corpus JEV/);
    assert.deepStrictEqual(lerMarcador(sandbox), { ultimaSemana: SEMANA_ATUAL });
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("guarda JEV acoplada: corpus saudável imprime ✅ e nenhum ACHADO de corpus, exit 0", () => {
  const sandbox = criarSandbox();
  try {
    const rowsPath = path.join(sandbox, "jev-rows-ok.json");
    fs.writeFileSync(rowsPath, JSON.stringify(
      [0.57, 0.23].map((c) => ({
        auto_mode: true,
        jev_choice: null,
        jev_confidence: c,
        jev_probabilities: { L1: 0.7 },
        jev_model: "typesafe/jev-1.13-20260917",
        fallback_reason: "low_confidence",
      })),
    ), "utf8");

    const r = rodarComGuardaJev([], sandbox, { rowsJson: rowsPath, jevLigada: true });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /GUARDA SEMANAL DE SAUDE DO CORPUS JEV/);
    assert.match(r.stdout, /✅ corpus saudavel/);
    assert.doesNotMatch(r.stdout, /ACHADO\(S\) de corpus JEV/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("guarda JEV acoplada: JEV_SEMANAL_SEM_GUARDA=1 desliga só a JEV (flips segue)", () => {
  const sandbox = criarSandbox();
  try {
    const r = rodarComGuardaJev([], sandbox, { jevLigada: false });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /SAUDE DO CORPUS JEV/); // banner JEV ausente
    assert.match(r.stdout, /GUARDA SEMANAL DE FLIPS PENDENTES/); // flips ainda roda
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("guarda JEV acoplada: sem fonte de dados => banner de INFRA (nunca 'sem achados'), exit 0", () => {
  const sandbox = criarSandbox();
  try {
    const r = rodarComGuardaJev([], sandbox, { rowsJson: null, jevLigada: true });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /SAUDE DO CORPUS JEV/);
    assert.match(r.stdout, /FALHA DE INFRAESTRUTURA/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

