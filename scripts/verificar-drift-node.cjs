#!/usr/bin/env node
/**
 * scripts/verificar-drift-node.cjs — gate de DRIFT do ambiente Node (HB-011, M2 do
 * sweep 2026-09-25, 2026-09-27).
 *
 * POR QUE EXISTE (evidência registrada no HB-011): o `node_modules` local declarava
 * `@types/node` 22.19.15 enquanto o `package-lock.json` fixava 26.5.1, `globals`
 * 15.15.0 vs 17.12.0 e `undici-types` 6.21.0 vs 8.9.0 — `npm install` respondia
 * "up to date" porque o HIDDEN LOCKFILE (`node_modules/.package-lock.json`) declarava
 * as versões corretas enquanto os diretórios físicos estavam velhos. Consequência
 * concreta: `globals` alimenta o `eslint.config.js` e `@types/node` alimenta o
 * `tsconfig.node.json` ⇒ lint e typecheck LOCAIS podiam divergir do CI em silêncio.
 * O CI é imune por construção (`npm ci` a partir do lock); esta checagem existe para
 * a máquina de quem roda o gate — mesma família de HB-007/HB-008 ("verde que não vale").
 *
 * CHECAGENS (mecânicas, zero interação):
 *   1. `.nvmrc` legível e não vazio (fonte canônica da versão de Node);
 *   2. `engines.node` da raiz compatível com a canônica (o gate dos workflows vive
 *      em validar-workflows.cjs R5; aqui é o package.json);
 *   3. `node_modules/.package-lock.json` ↔ `package-lock.json` top-level: todo
 *      pacote instalado tem a MESMA version declarada no lock (o drift físico que
 *      o hidden lockfile mascara).
 *
 * Uso:
 *   node scripts/verificar-drift-node.cjs            # raiz do repo
 *   node scripts/verificar-drift-node.cjs --dir backend
 *   node scripts/verificar-drift-node.cjs --json
 * Saída: exit 0 (sem drift) | exit 1 (drift) | exit 2 (sem lock legível).
 */
"use strict";


const fs = require("fs");
const path = require("path");

// DRIFT_NODE_ROOT: override para teste (fixture em sandbox) — sem env, raiz do repo.
const ROOT = process.env.DRIFT_NODE_ROOT
  ? path.resolve(process.env.DRIFT_NODE_ROOT)
  : path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const dirFlag = argv.find((a) => a === "--dir" || a.startsWith("--dir="));
const ALVO = path.resolve(
  ROOT,
  dirFlag ? (dirFlag.includes("=") ? dirFlag.split("=")[1] : argv[argv.indexOf(dirFlag) + 1] ?? ".") : ".",
);

function lerJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const problemas = [];
const avisos = [];

// ── 1. versão canônica de Node (.nvmrc) ──────────────────────────────────────
const nvmrcPath = path.join(ROOT, ".nvmrc");
let canonica = "";
if (!fs.existsSync(nvmrcPath)) {
  problemas.push(".nvmrc ausente na raiz — versão canônica de Node não declarada");
} else {
  canonica = fs.readFileSync(nvmrcPath, "utf8").trim().replace(/^v/, "");
  if (!canonica) problemas.push(".nvmrc vazio — versão canônica de Node não declarada");
}

// ── 2. engines.node compatível com a canônica ────────────────────────────────
const pkgRaiz = lerJson(path.join(ROOT, "package.json")) ?? {};
const engines = pkgRaiz.engines && pkgRaiz.engines.node ? String(pkgRaiz.engines.node) : "";
if (canonica) {
  if (!engines) {
    problemas.push("package.json sem engines.node — aceita qualquer runtime");
  } else if (!engines.includes(canonica)) {
    // exigir o literal evita o caso "engines >=20.19.0 × .nvmrc 22.22.2" (HB-011).
    problemas.push(`engines.node "${engines}" não referencia a versão canônica ${canonica}`);
  }
}

// ── 3. node_modules físico ↔ package-lock.json ───────────────────────────────
const lockPath = path.join(ALVO, "package-lock.json");
const hiddenPath = path.join(ALVO, "node_modules", ".package-lock.json");
const lock = lerJson(lockPath);
if (!lock) {
  console.error(`[drift-node] sem package-lock.json legível em ${ALVO}`);
  process.exit(2);
}
const hidden = lerJson(hiddenPath);
if (!hidden) {
  // node_modules ausente é estado legítimo (antes do npm ci) — aviso, não falha:
  // o gate é de DRIFT, não de instalação. Quem exige node_modules são as suítes.
  avisos.push(
    `node_modules/.package-lock.json ausente em ${ALVO} — rode npm ci para checar o drift físico`,
  );
} else {
  const fisicos = hidden.packages ?? {};
  const declarados = lock.packages ?? {};
  let comparados = 0;
  const divergentes = [];
  for (const [caminho, meta] of Object.entries(fisicos)) {
    if (!caminho.startsWith("node_modules/")) continue;
    const declarado = declarados[caminho];
    if (!declarado || !declarado.version || !meta.version) continue;
    comparados += 1;
    if (meta.version !== declarado.version) {
      divergentes.push({ pacote: caminho, instalado: meta.version, lock: declarado.version });
    }
  }
  if (divergentes.length > 0) {
    problemas.push(
      `drift físico node_modules ↔ package-lock (${String(divergentes.length)} pacote(s)): ` +
        divergentes
          .slice(0, 8)
          .map((d) => `${d.pacote} instalado=${d.instalado} lock=${d.lock}`)
          .join(" · ") +
        (divergentes.length > 8 ? " · ..." : ""),
    );
  }
  if (!JSON_OUT) {
    console.log(
      `[drift-node] hidden lockfile: ${String(comparados)} pacote(s) de node_modules comparados com o lock`,
    );
  }
}

const ok = problemas.length === 0;
if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        ok,
        alvo: ALVO,
        nodeCanonico: canonica || null,
        enginesNode: engines || null,
        problemas,
        avisos,
        nodeAtual: process.version,
      },
      null,
      2,
    ),
  );
} else {
  for (const a of avisos) console.warn(`  aviso: ${a}`);
  if (ok) {
    console.log(
      `\n✅ drift-node: sem drift — canônica ${canonica || "(não declarada)"}, engines ${engines || "(ausente)"}, runtime atual ${process.version}`,
    );
  } else {
    console.error(`\n✖ drift de ambiente Node (${String(problemas.length)} problema(s)):`);
    for (const p of problemas) console.error(`  - ${p}`);
    console.error("  Correção: npm ci (nunca npm install) e realinhe .nvmrc/engines/CI.");
  }
}
process.exit(ok ? 0 : 1);
