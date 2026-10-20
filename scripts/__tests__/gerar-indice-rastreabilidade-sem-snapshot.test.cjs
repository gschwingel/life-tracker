// scripts/__tests__/gerar-indice-rastreabilidade-sem-snapshot.test.cjs
// AUDITORIA-DOCS-REPO-20261008 (F-11): nó vivo sem snapshot NÃO pode sumir do
// índice — nasce `snapshot: null` e a integridade o classifica 🔴 (e ⚫ se
// deprecated). Antes, o filtro `obj.id && obj.snapshot` o omitia em silêncio
// (janela de cegueira de 3 semanas nas sprints SP-BOOT).
// Determinístico, sem rede: sandbox em temp-dir (cwd fake + INDICES_OUT_DIR),
// gerador executado como processo filho — mesmo contrato do consumo real.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const GENERATOR = path.resolve(__dirname, "..", "gerar-indice-rastreabilidade.cjs");

function montarSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idx-rast-"));
  fs.mkdirSync(path.join(root, "LILA-DEV", "planejamento"), { recursive: true });
  fs.mkdirSync(path.join(root, "LILA-DEV", "execucao", "logs"), { recursive: true });
  const grafo = {
    keyframes: [
      { id: "KF-COM-SNAPSHOT", estado: "🟢", snapshot: "LILA-DEV/planejamento/snapshots/kf.md", pai: null, depende_de: [], desbloqueia: [] },
      { id: "KF-SEM-SNAPSHOT", estado: "🔴", pai: null, depende_de: [], desbloqueia: [] },
      { id: "KF-MORTO-SEM-SNAPSHOT", estado: "🟡", deprecated: true, pai: null, depende_de: [], desbloqueia: [] },
    ],
    sprints: [],
    frames: [],
  };
  fs.writeFileSync(
    path.join(root, "LILA-DEV", "planejamento", "grafo.json"),
    JSON.stringify(grafo),
  );
  return root;
}

test("nó sem snapshot permanece no índice com snapshot:null e integridade 🔴", () => {
  const root = montarSandbox();
  const out = spawnSync(process.execPath, [GENERATOR], {
    cwd: root,
    env: { ...process.env, INDICES_OUT_DIR: root },
    encoding: "utf8",
  });
  assert.equal(out.status, 0, `gerador falhou: ${out.stderr}`);

  const indice = JSON.parse(
    fs.readFileSync(path.join(root, "LILA-DEV", "indice-rastreabilidade.json"), "utf8"),
  );

  assert.equal(indice.totalNos, 3, "os 3 nós do grafo devem aparecer no índice");
  assert.deepEqual(Object.keys(indice.nos).sort(), [
    "KF-COM-SNAPSHOT",
    "KF-MORTO-SEM-SNAPSHOT",
    "KF-SEM-SNAPSHOT",
  ]);

  const comSnapshot = indice.nos["KF-COM-SNAPSHOT"];
  assert.equal(comSnapshot.snapshot, "LILA-DEV/planejamento/snapshots/kf.md");
  assert.equal(comSnapshot.snapshotExiste, false, "snapshot fixture não existe no sandbox");
  assert.equal(comSnapshot.integridade, "🔴", "sem snapshot físico = 🔴");

  const semSnapshot = indice.nos["KF-SEM-SNAPSHOT"];
  assert.equal(semSnapshot.snapshot, null, "snapshot ausente vira null explícito");
  assert.equal(semSnapshot.snapshotExiste, false);
  assert.equal(semSnapshot.integridade, "🔴", "vivo sem snapshot = 🔴 visível, nunca omitido");
  assert.equal(semSnapshot.estadoEfetivo, "🔴", "não-deprecated preserva o próprio estado");

  const morto = indice.nos["KF-MORTO-SEM-SNAPSHOT"];
  assert.equal(morto.snapshot, null);
  assert.equal(morto.deprecated, true);
  assert.equal(morto.estadoEfetivo, "⚫", "colapso FR-ESTADO-EFETIVO-IA intacto");
});

// AUDITORIA-DOCS-REPO-20261009 (N-01): o prune semanal arquiva logs em
// logs-arquivo/ — trilha completa não pode carregar 🟡 falso. logCaminho carrega
// o caminho real da evidência (quente ganha; prefixo logs-arquivo/ = frio).
// 🟢 = snapshot + log (quente OU arquivado) | 🟡 = snapshot sem log NENHUM.
function montarSandboxLogs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idx-rast-logs-"));
  fs.mkdirSync(path.join(root, "LILA-DEV", "planejamento", "snapshots"), { recursive: true });
  fs.mkdirSync(path.join(root, "LILA-DEV", "execucao", "logs"), { recursive: true });
  fs.mkdirSync(path.join(root, "LILA-DEV", "execucao", "logs-arquivo"), { recursive: true });
  const snap = "LILA-DEV/planejamento/snapshots/kf.md";
  fs.writeFileSync(path.join(root, snap), "# snapshot fixture\n");
  fs.writeFileSync(path.join(root, "LILA-DEV", "execucao", "logs", "KF-LOG-VIVO-log.md"), "# vivo\n");
  fs.writeFileSync(
    path.join(root, "LILA-DEV", "execucao", "logs-arquivo", "KF-LOG-ARQUIVADO-log.md"),
    "# arquivado\n",
  );
  // mesmo id em ambos: o quente ganha (evidência viva tem precedência)
  fs.writeFileSync(path.join(root, "LILA-DEV", "execucao", "logs", "KF-LOG-DUPLO-log.md"), "# vivo\n");
  fs.writeFileSync(
    path.join(root, "LILA-DEV", "execucao", "logs-arquivo", "KF-LOG-DUPLO-log.md"),
    "# arquivado\n",
  );
  const grafo = {
    keyframes: [
      { id: "KF-LOG-VIVO", estado: "🟢", snapshot: snap, pai: null, depende_de: [], desbloqueia: [] },
      { id: "KF-LOG-ARQUIVADO", estado: "🟢", snapshot: snap, pai: null, depende_de: [], desbloqueia: [] },
      { id: "KF-LOG-DUPLO", estado: "🟢", snapshot: snap, pai: null, depende_de: [], desbloqueia: [] },
      { id: "KF-SEM-LOG", estado: "🟡", snapshot: snap, pai: null, depende_de: [], desbloqueia: [] },
    ],
    sprints: [],
    frames: [],
  };
  fs.writeFileSync(
    path.join(root, "LILA-DEV", "planejamento", "grafo.json"),
    JSON.stringify(grafo),
  );
  return root;
}

test("log arquivado fecha a trilha (N-01): 🟢 com logCaminho; sem log nenhum = 🟡 real; quente ganha", () => {
  const root = montarSandboxLogs();
  const out = spawnSync(process.execPath, [GENERATOR], {
    cwd: root,
    env: { ...process.env, INDICES_OUT_DIR: root },
    encoding: "utf8",
  });
  assert.equal(out.status, 0, `gerador falhou: ${out.stderr}`);

  const indice = JSON.parse(
    fs.readFileSync(path.join(root, "LILA-DEV", "indice-rastreabilidade.json"), "utf8"),
  );
  assert.equal(indice.totalNos, 4);

  const vivo = indice.nos["KF-LOG-VIVO"];
  assert.equal(vivo.integridade, "🟢");
  assert.equal(vivo.logCaminho, "LILA-DEV/execucao/logs/KF-LOG-VIVO-log.md");

  const arquivado = indice.nos["KF-LOG-ARQUIVADO"];
  assert.equal(arquivado.integridade, "🟢", "log no archive do prune = trilha completa, nunca 🟡 falso");
  assert.equal(
    arquivado.logCaminho,
    "LILA-DEV/execucao/logs-arquivo/KF-LOG-ARQUIVADO-log.md",
    "logCaminho revela o armazenamento frio",
  );

  const duplo = indice.nos["KF-LOG-DUPLO"];
  assert.equal(duplo.integridade, "🟢");
  assert.equal(duplo.logCaminho, "LILA-DEV/execucao/logs/KF-LOG-DUPLO-log.md", "quente ganha do archive");

  const semLog = indice.nos["KF-SEM-LOG"];
  assert.equal(semLog.integridade, "🟡", "snapshot sem log NENHUM = gap real, sinal limpo");
  assert.equal(semLog.logCaminho, null);
  assert.equal(semLog.logExiste, undefined, "booleano logExiste morreu — campo único e auto-descritivo");
});
