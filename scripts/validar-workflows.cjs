#!/usr/bin/env node
// scripts/validar-workflows.cjs
// Propósito: gate determinístico de HIGIENE dos workflows GitHub Actions —
// mata a classe "CI frágil por ambiente" antes do push.
// Referência: saga CI 2026-09-04 — em-dash (—) em run block PowerShell quebrou
// o parse no runner (UTF-8 sem BOM lido como ANSI pelo Windows PowerShell 5.1:
// byte 0x94 vira aspa curva delimitadora de string); gitleaks-action 404 por
// asset desatualizado; jobs sem timeout rodavam indefinidos.
//
// Regras validadas por workflow:
//   R1 — run blocks PowerShell/pwsh: zero caractere não-ASCII FORA de comentário
//        (comentários dentro do run block são seguros — parser os ignora).
//   R2 — todo job tem timeout-minutes (item C do endurecimento 2026-09-03).
//   R3 — todo job com steps tem concurrency declarada (anti-colisão de runner).
//   R4 — actions/setup-node usa SEMPRE a versão canônica do pipeline
//        (PATCH-OTIMIZACAO-PR-CI-FAILFAST-20260911, commit C1): o job
//        manifest-frescor ficou em @v4 enquanto pr-gate/merge-gate/gates-grafo
//        usavam @v7 — drift de cache/runtime no mesmo evento de PR.
// Saída: exit 0 (tudo conforme) | exit 1 (violação listada por arquivo:linha).

const fs = require("node:fs");
const path = require("node:path");

let yaml;
try {
  yaml = require("js-yaml");
} catch {
  console.error("js-yaml ausente — rode npm ci na raiz");
  process.exit(1);
}

// R4 — versão canônica de actions/setup-node. Declarada (explícito > inferido):
// votar por maioria trocaria o drift por empate silencioso. Subir a versão é
// editar esta constante + as ocorrências — o validador acusa o resto.
const CANONICAL_SETUP_NODE = "v7";

// R5 (HB-011 / M2 do sweep 2026-09-25, 2026-09-27) — versão canônica de NODE.
// Casa única: `.nvmrc` (arquivo, não prosa) — o validador LÊ a versão de lá em vez
// de duplicar o número, então "mudar a versão canônica" = editar 1 arquivo e o gate
// acusa todas as outras fontes (workflows, engines, docs) que não seguirem.
// LILA_NODE_VERSION permite injetar a versão em teste de fixture (sem depender do
// .nvmrc real). Este era o achado C25-10/HB-011: `.nvmrc`=20 × CI 22 × local 24.
function lerVersaoCanonicaNode() {
  // `LILA_NODE_VERSION` presente (mesmo vazio) é OVERRIDE EXPLÍCITO — o teste de
  // fixture usa "" para exercitar o caminho neutro sem depender do .nvmrc real.
  if (process.env.LILA_NODE_VERSION !== undefined) return process.env.LILA_NODE_VERSION.trim();
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", ".nvmrc"), "utf8").trim();
    return raw.replace(/^v/, "");
  } catch {
    return "";
  }
}
const CANONICAL_NODE = lerVersaoCanonicaNode();

// LILA_WF_DIR permite apontar o validador para uma pasta de fixtures nos testes
// (mesmo padrão de override de pre-push.cjs).
const WF_DIR = process.env.LILA_WF_DIR
  ? path.resolve(process.env.LILA_WF_DIR)
  : path.join(__dirname, "..", ".github", "workflows");
const files = fs.readdirSync(WF_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

if (files.length === 0) {
  console.error(`Nenhum workflow em ${WF_DIR}`);
  process.exit(1);
}

const violations = [];
/** Ocorrências de actions/setup-node coletadas para a checagem R4 (pós-loop). */
const setupNodeUses = [];
/** Ocorrências de `node-version` dos steps setup-node, para a checagem R5 (pós-loop). */
const nodeVersions = [];

for (const file of files) {
  const full = path.join(WF_DIR, file);
  const raw = fs.readFileSync(full, "utf8");
  let wf;
  try {
    wf = yaml.load(raw);
  } catch (err) {
    violations.push(`${file}: YAML inválido — ${err.message.split("\n")[0]}`);
    continue;
  }
  if (!wf || typeof wf !== "object" || !wf.jobs) continue;

  for (const [jobName, job] of Object.entries(wf.jobs)) {
    if (job && job["uses"]) continue; // job reusável via needs não aplicável
    if (job && job.timeout === undefined && job["timeout-minutes"] === undefined) {
      violations.push(`${file}:${jobName}: sem timeout-minutes`);
    }
    // concurrency válida no nível do workflow OU do job (anti-colisão).
    const wfConcurrency = wf.concurrency !== undefined;
    if (job && !wfConcurrency && job.concurrency === undefined) {
      violations.push(`${file}:${jobName}: sem concurrency (nem no workflow nem no job)`);
    }
    const steps = (job && Array.isArray(job.steps)) ? job.steps : [];
    for (const step of steps) {
      if (step && typeof step.uses === "string") {
        const m = /^actions\/setup-node@(.+)$/.exec(step.uses.trim());
        if (m) {
          setupNodeUses.push({ file, job: jobName, ref: m[1] });
          // R5 — a versão do Node instalada pelo step (with: node-version).
          const nv = step.with && step.with["node-version"];
          if (nv !== undefined) {
            nodeVersions.push({ file, job: jobName, versao: String(nv).trim(), ref: m[1] });
          }
        }
      }
      if (!step || typeof step.run !== "string") continue;
      const shell = typeof step.shell === "string" ? step.shell : "";
      if (!/^(powershell|pwsh|cmd)/.test(shell)) continue; // bash é UTF-8 seguro
      const name = step.name ?? "(sem name)";
      step.run.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("#")) return;
        // zero não-ASCII: compara por code point (evita \x00-\x7F, que o
        // no-control-regex do ESLint reprova)
        const temNaoAscii = [...trimmed].some((ch) => ch.charCodeAt(0) > 127);
        if (temNaoAscii) {
          violations.push(`${file}:${jobName} [${name}]: caractere não-ASCII em código PowerShell/cmd — "${trimmed.slice(0, 60)}"`);
        }
      });
    }
  }
}

/**
 * R4 — refs de actions/setup-node devem ser TODAS a versão canônica.
 * Pura (sem I/O) para permitir teste de tabela: recebe as ocorrências coletadas
 * no walk do YAML e devolve as violações legíveis (arquivo:job).
 */
function checkSetupNodeConsistency(uses, canonical) {
  return uses
    .filter((u) => u.ref !== canonical)
    .map((u) => `${u.file}:${u.job}: actions/setup-node@${u.ref} — versão canônica do pipeline é @${canonical}`);
}

/**
 * R5 (HB-011) — a versão de Node instalada nos workflows tem de ser a canônica
 * (`.nvmrc`). Pura para teste de tabela: recebe as ocorrências coletadas e a
 * versão canônica e devolve as violações legíveis (arquivo:job).
 * Sem `.nvmrc` legível a regra é NEUTRA (declara no summary) em vez de inventar
 * violação — o fail-closed de "fonte canônica ausente" é o teste do próprio .nvmrc.
 */
function checkNodeVersionConsistency(uses, canonical) {
  if (!canonical) return [];
  return uses
    .filter((u) => u.versao !== canonical)
    .map(
      (u) =>
        `${u.file}:${u.job}: node-version: ${u.versao} — versao canonica ('.nvmrc') e ${canonical}`,
    );
}

violations.push(...checkSetupNodeConsistency(setupNodeUses, CANONICAL_SETUP_NODE));
violations.push(...checkNodeVersionConsistency(nodeVersions, CANONICAL_NODE));

if (violations.length > 0) {
  console.error(`\n✖ ${violations.length} violação(ões) de higiene de workflows:`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(
  `✅ ${files.length} workflows conformes (ASCII em run blocks PS/cmd, timeout e concurrency em todos os jobs, setup-node@${CANONICAL_SETUP_NODE}, node ${CANONICAL_NODE || "(sem .nvmrc)"})`,
);