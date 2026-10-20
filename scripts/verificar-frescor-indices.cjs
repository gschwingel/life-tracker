#!/usr/bin/env node
"use strict";
/**
 * verificar-frescor-indices.cjs — verificação por CONTEÚDO (v2, PATCH-DEVFLOW-FRESCOR-CONTENT-20260905).
 * v1 comparava geradoEm (timestamp) vs último commit dos dirs cobertos: todo commit
 * de conteúdo — até o que grava os índices — ficava "posterior", forçando regen em
 * cascata. v2 regenera cada índice OFFLINE em tmp (INDICES_OUT_DIR) e compara com o
 * versionado (ignora só geradoEm/generatedAt/data_geracao). Vetorial fica fora
 * (verificar-frescor-indice-vetorial.cjs, fileHash por chunk).
 * REGRA 5 §5.2 (critério de fragmentação v2 — HISTÓRICO): o check de "arquivo
 * órfão" continua genérico para saídas em DIRETÓRIO; desde o REANC-L4 / I1
 * (2026-09-20) nenhum índice vivo sai em diretório (o reverso morreu).
 * Uso: node scripts/verificar-frescor-indices.cjs [--related]
 * Exit: 0 = frescos | 1 = stale/ausente/erro
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RELACIONADOS = process.argv.includes("--related");

// dirs mantidos apenas para o filtro --related (a verificação é por conteúdo).
// REANC-L4 / I1+I3+I4 (2026-09-20): o índice reverso (indice-reverso/), a matriz
// de cobertura e o inventário de testes SAÍRAM da superfície ativa — a lista
// abaixo cobre apenas os índices vivos (rastreabilidade + manifest-index).
const INDICES = [
  { caminho: "LILA-DEV/indice-rastreabilidade.json", gerador: "gerar-indice-rastreabilidade.cjs", saida: "LILA-DEV/indice-rastreabilidade.json", dirs: ["LILA-DEV/planejamento", "LILA-DEV/execucao"] },
  { caminho: "docs/AI-PROJECT-MANIFEST-INDEX.md", gerador: "gerar-indice-manifest.cjs", saida: "docs/AI-PROJECT-MANIFEST-INDEX.md", dirs: ["docs"] },
];

// ── Filtro --related (comportamento do v1) ──────────────────────────────────
function arquivosAlteradosPatch() {
  const out = new Set();
  try {
    const tracked = spawnSync("git", ["--no-pager", "diff", "--name-only", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout;
    for (const l of String(tracked).split("\n")) if (l.trim()) out.add(l.trim().replace(/\\/g, "/"));
  } catch {
    return null;
  }
  try {
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).stdout;
    for (const l of String(untracked).split("\n")) if (l.trim()) out.add(l.trim().replace(/\\/g, "/"));
  } catch {
    /* sem git */
  }
  return out;
}

// ── Normalização de metadados voláteis ───────────────────────────────────────
const VOLATIL = new Set(["geradoEm", "generatedAt", "data_geracao"]);
function stripVolatile(node) {
  if (Array.isArray(node)) {
    for (const item of node) stripVolatile(item);
    return node;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (VOLATIL.has(k)) delete node[k];
      else stripVolatile(node[k]);
    }
  }
  return node;
}

function leNormalizado(abs) {
  const raw = fs.readFileSync(abs, "utf8");
  if (abs.endsWith(".json")) return { json: stripVolatile(JSON.parse(raw)), texto: null };
  return { json: null, texto: raw.replace(/\r\n/g, "\n").trimEnd() };
}

function conteudosIguais(repAbs, tmpAbs) {
  const a = leNormalizado(repAbs);
  const b = leNormalizado(tmpAbs);
  if (a.json !== null) return JSON.stringify(a.json) === JSON.stringify(b.json);
  return a.texto === b.texto;
}

function listarRel(dirAbs, baseAbs, acc = []) {
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) listarRel(abs, baseAbs, acc);
    else acc.push(path.relative(baseAbs, abs).split(path.sep).join("/"));
  }
  return acc;
}

// ── Verificação por conteúdo de um índice ────────────────────────────────────
function verificarIndice(idx) {
  if (!fs.existsSync(path.join(ROOT, idx.caminho))) return { status: "ausente" };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frescor-content-"));
  try {
    const script = path.join(ROOT, "scripts", idx.gerador);
    const env = { ...process.env, INDICES_OUT_DIR: tmp };
    const tmpAbs = path.join(tmp, idx.saida);
    if (idx.gerador === "gerar-indice-manifest.cjs") env.MANIFEST_INDEX_PATH = tmpAbs;
    // cria os pais em tmp (LILA-DEV/docs etc.) — no default o repo já os tem
    fs.mkdirSync(path.dirname(tmpAbs), { recursive: true });
    const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8", env });
    if (r.status !== 0) {
      const detalhe = String(r.stderr || "").trim().split("\n")[0] || "";
      return { status: "erro", detalhe: `${idx.gerador} exit ${String(r.status)} ${detalhe}`.trim() };
    }
    if (!fs.existsSync(tmpAbs)) return { status: "erro", detalhe: `${idx.gerador} não produziu ${idx.saida}` };
    const eDir = fs.statSync(tmpAbs).isDirectory();
    const gerados = eDir ? listarRel(tmpAbs, tmpAbs) : [path.basename(tmpAbs)];
    for (const rel of gerados) {
      const tmpFile = eDir ? path.join(tmpAbs, rel) : tmpAbs;
      const repFile = eDir ? path.join(ROOT, idx.saida, rel) : path.join(ROOT, idx.saida);
      if (!fs.existsSync(repFile) || !conteudosIguais(repFile, tmpFile)) {
        const alvo = eDir ? `${idx.saida}/${rel}` : idx.saida;
        return { status: "stale", detalhe: `conteúdo difere em ${alvo}` };
      }
    }
    // REGRA 5 §5.2 (critério v2): arquivo ÓRFÃO — commitado no diretório de saída
    // mas não produzido pela regeneração (ex.: fragmento antigo renomeado pela
    // subdivisão por segundo caractere). Sem esta checagem, um fragmento morto
    // (L_.json) passaria como "fresco" para sempre.
    if (eDir) {
      const dirRepo = path.join(ROOT, idx.saida);
      const geradosSet = new Set(gerados);
      for (const rel of listarRel(dirRepo, dirRepo)) {
        if (!geradosSet.has(rel)) {
          return { status: "stale", detalhe: `arquivo órfão em ${idx.saida}/${rel} (não produzido pelo critério vigente — remova)` };
        }
      }
    }
    return { status: "fresco" };
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}
// ── Execução ─────────────────────────────────────────────────────────────────
function main() {
  let alvo = INDICES;
  if (RELACIONADOS) {
    const alterados = arquivosAlteradosPatch();
    if (alterados === null) {
      console.log("⚫ --related — git indisponível, sem filtro (verifica todos os índices).");
    } else if (alterados.size === 0) {
      console.log("✅ --related — nenhum arquivo alterado no patch; nenhum índice relacionado.");
      process.exit(0);
    } else {
      alvo = INDICES.filter((idx) =>
        idx.dirs.some((dir) => [...alterados].some((f) => f === dir || f.startsWith(dir + "/")))
      );
      if (alvo.length === 0) {
        console.log("✅ --related — arquivos alterados não intersectam diretórios cobertos; nenhum índice relacionado.");
        process.exit(0);
      }
    }
  }

  let stale = 0;
  let ausente = 0;
  let erro = 0;
  for (const idx of alvo) {
    const res = verificarIndice(idx);
    if (res.status === "fresco") {
      console.log(`🟢 ${idx.caminho} — fresco`);
    } else if (res.status === "stale") {
      stale++;
      console.log(`🟡 ${idx.caminho} — DESATUALIZADO (${res.detalhe} — execute: npm run indices)`);
    } else if (res.status === "ausente") {
      ausente++;
      console.log(`⚪ ${idx.caminho} — ÍNDICE AUSENTE (rode npm run indices)`);
    } else {
      erro++;
      console.log(`⚫ ${idx.caminho} — erro ao verificar (${res.detalhe})`);
    }
  }

  console.log("");
  if (stale > 0) {
    console.log(`⚠️  ${stale} índice(s) desatualizado(s) — execute: npm run indices`);
    process.exit(1);
  }
  if (ausente > 0) {
    console.log(`⚠️  ${ausente} índice(s) ausente(s) — execute: npm run indices`);
    process.exit(1);
  }
  if (erro > 0) {
    console.log(`⚠️  ${erro} índice(s) com erro de verificação — verifique o gerador`);
    process.exit(1);
  }
  console.log("✅ Todos os índices estão frescos.");
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { INDICES, conteudosIguais, stripVolatile, listarRel, arquivosAlteradosPatch };
