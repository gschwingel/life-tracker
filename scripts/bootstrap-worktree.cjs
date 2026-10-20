#!/usr/bin/env node
// scripts/bootstrap-worktree.cjs
// Propósito: bootstrap idempotente de uma worktree git nova com os arquivos
// UNTRACKED essenciais ao fluxo de índices (`.env` em primeiro lugar).
//
// Causa raiz que este script fecha: `.env` é untracked, logo toda worktree nova
// nasce SEM a chave de embedding e os scripts vetoriais falham com erro críptico
// ("OPENROUTER_API_KEY ausente"). Essa foi a causa raiz de 8 de 20 dívidas
// registradas em LILA-DEV/execucao/patch-debt.json (padrão "índice vetorial não
// regenerado — chave ausente no ambiente do agente"). Decisão: sentença G6 do
// núcleo governança (LILA-DEV/planejamento/discovery/2026-09-19-maturidade-
// negativa-nivel-2-governanca.md) + prompt 2026-09-19-bootstrap-worktree-env.md.
//
// Uso:
//   node scripts/bootstrap-worktree.cjs <path-da-worktree-destino>
//   node scripts/bootstrap-worktree.cjs <path> [--from=<path-da-origem>]
//
// Origem: a worktree PRINCIPAL resolvida via `git worktree list --porcelain`
// (a primeira listada é a principal); `--from=<path>` sobrepõe.
//
// Idempotente: re-executar sobrescreve de forma segura, NÃO apaga nada no
// destino e NÃO toca em arquivo rastreado (git status do destino fica limpo).
//
// Saída: resumo do que foi copiado + do que já existia; exit 0 (ok) | exit 1 (erro).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/**
 * Arquivos untracked essenciais copiados da origem para a worktree destino.
 * Lista DECLARADA aqui (constante única) — nunca espalhar hardcode pelo script.
 * Cada entrada: { rel, obrigatorio } — `obrigatorio: true` significa que a
 * ausência na origem é erro acionável (exit 1).
 */
const ARQUIVOS_UNTRACKED = Object.freeze([
  { rel: ".env", obrigatorio: true },
  { rel: "backend/.env", obrigatorio: false },
]);

const USO = [
  "uso: node scripts/bootstrap-worktree.cjs <path-da-worktree-destino> [--from=<path-da-origem>]",
  "",
  "  <path-da-worktree-destino>  worktree que receberá os arquivos untracked (ex.: ../lila-patch-x)",
  "  --from=<path>               origem explícita (default: worktree principal do repo)",
].join("\n");

/** Executa git no diretório indicado e devolve stdout (nunca interativo). */
function git(args, cwd) {
  return execFileSync("git", ["--no-pager", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/** Resolve a worktree principal do repositório (primeira de `git worktree list`). */
function resolverOrigemPrincipal(cwd) {
  const out = git(["worktree", "list", "--porcelain"], cwd);
  const linhas = out.split("\n").filter((l) => l.startsWith("worktree "));
  if (linhas.length === 0) {
    throw new Error("`git worktree list` não retornou nenhuma worktree — rode dentro de um repositório git.");
  }
  return linhas[0].slice("worktree ".length).trim();
}

/** Confirma que `p` é uma worktree válida (ou o próprio repo) — erro acionável se não. */
function assertWorktree(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`destino não existe: ${p}`);
  }
  try {
    const inside = git(["rev-parse", "--is-inside-work-tree"], p).trim();
    if (inside !== "true") throw new Error("não é working tree");
  } catch {
    throw new Error(`destino não é uma worktree git válida: ${p}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const argsPosicionais = argv.filter((a) => !a.startsWith("--"));
  const fromFlag = argv.find((a) => a.startsWith("--from="));

  if (argsPosicionais.length !== 1) {
    console.error(USO);
    process.exit(1);
  }

  const destino = path.resolve(argsPosicionais[0]);
  let origem;
  try {
    assertWorktree(destino);
    origem = fromFlag ? path.resolve(fromFlag.slice("--from=".length)) : resolverOrigemPrincipal(__dirname);
    assertWorktree(origem);
  } catch (err) {
    console.error(`[bootstrap-worktree] ${err instanceof Error ? err.message : String(err)}`);
    console.error(USO);
    process.exit(1);
  }

  const copiados = [];
  const jaExistiam = [];
  const ausentesObrigatorios = [];
  const ausentesOpcionais = [];

  for (const { rel, obrigatorio } of ARQUIVOS_UNTRACKED) {
    const src = path.join(origem, rel);
    const dst = path.join(destino, rel);
    if (!fs.existsSync(src)) {
      if (obrigatorio) ausentesObrigatorios.push(rel);
      else ausentesOpcionais.push(rel);
      continue;
    }
    const existia = fs.existsSync(dst);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    if (existia) jaExistiam.push(rel);
    else copiados.push(rel);
  }

  console.log("=== bootstrap-worktree ===");
  console.log(`origem:  ${origem}`);
  console.log(`destino: ${destino}`);
  console.log(`copiados (novos):      ${copiados.length > 0 ? copiados.join(", ") : "nenhum"}`);
  console.log(`sobrescritos (já existiam): ${jaExistiam.length > 0 ? jaExistiam.join(", ") : "nenhum"}`);
  if (ausentesOpcionais.length > 0) {
    console.log(`ausentes na origem (opcionais, ignorados): ${ausentesOpcionais.join(", ")}`);
  }

  if (ausentesObrigatorios.length > 0) {
    console.error(
      `[bootstrap-worktree] arquivo obrigatório ausente na origem: ${ausentesObrigatorios.join(", ")} — ` +
        `crie-o em ${origem} (ou aponte --from=<path> para uma origem que o tenha).`,
    );
    process.exit(1);
  }

  // P2C (PATCH-PROCESSO-SESSAO-MCP-20260922): aviso — browsers Playwright ausentes
  // (test:e2e/gate:e2e nao rodam local). AVISA, nunca instala: instalar ~1GB de browser e
  // decisao humana (docs/TESTING.md §Cobertura E2E — a cobertura canonica de E2E e o
  // merge-gate do CI, com E2E gold G1-G3 em todo PR).
  {
    const candidatos = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : null,
      process.env.HOME ? path.join(process.env.HOME, ".cache", "ms-playwright") : null,
    ].filter(Boolean);
    const temChromium = candidatos.some(
      (p) => fs.existsSync(p) && fs.readdirSync(p).some((e) => e.startsWith("chromium")),
    );
    if (!temChromium) {
      console.log(
        "[bootstrap-worktree] AVISO: browsers Playwright ausentes — test:e2e/gate:e2e nao rodam neste ambiente; " +
          "cobertura canonica de E2E = merge-gate do CI (docs/TESTING.md). Habilitar local: npx playwright install chromium",
      );
    }
  }

  console.log("OK — nenhum arquivo rastreado foi tocado (a cópia é de arquivos untracked).");
  process.exit(0);
}

main();
