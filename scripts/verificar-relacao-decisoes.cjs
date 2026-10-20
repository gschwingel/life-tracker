#!/usr/bin/env node
// scripts/verificar-relacao-decisoes.cjs — gate da declaração de relação com
// decisões ativas (FRAME-LACO-ESTADO-20261002, decisão Igor 2026-10-02).
//
// POR QUE EXISTE
// O E3.5 (grafo-normalize) só detecta contradições DECLARADAS — um snapshot novo
// que invalida silenciosamente uma decisão ativa antiga passa batido e o cânone
// passa a manter as duas como vigentes. Este gate transforma a declaração em
// obrigação na escrita: todo snapshot ADICIONADO no PR declara a relação com as
// decisões ativas da área (`sem-contradicao` com fonte, ou `substitui <ids>`).
// A veracidade da busca continua cognitiva (FDV-PLAN §2); o que é mecânico aqui:
// presença do campo, enum e existência/status dos alvos de substituição.
//
// ESCOPO (sem retroatividade — decisão D2 do frame)
// - Cobra SOMENTE snapshots ADICIONADOS na faixa base..head
//   (git diff --name-status, filtro status A) sob LILA-DEV/planejamento/snapshots/.
// - Modified/Renamed/Copied isentos: edição em snapshot antigo não é nova
//   cristalização (normalização E3.5 / --rewrite-snapshots permanecem verdes).
// - Estoque histórico anterior ao gate: intocado.
//
// CONTRATO DO CAMPO (FDV-PLAN §2, canônico + derivado)
//   Relacao decisoes ativas: sem-contradicao — verificacao: <fonte livre>
//   Relacao decisoes ativas: substitui <ID>[, <ID>...] — deprecacao: <estado livre>
// - A chave deve abrir a linha (âncora ^) — menção em prosa não conta.
//   Variante em NEGRITO (`**Relacao decisoes ativas:**`) é violação com
//   mensagem própria que aponta o conserto (#1194) — não "campo ausente".
// - IDs de `substitui`: formato unidades[].id do decisoes-ledger.json
//   (<NODE>.U<n>). Validação: ID existe no ledger E status === "deprecated"
//   (declarar substituição sem a deprecacao registrada = block com reparo:
//   register_unit/deprecate_unit via lila-grafo-mcp no fechamento).
//
// CLI (espelha validar-ledgers.cjs)
//   --base <rev>  (CI: PR_BASE_SHA ou HEAD^1; default local: merge-base com
//                  origin/main, fallback HEAD^1)
//   --head <rev>  (default: HEAD)
// Exit: 0 ok | 1 violação | 2 erro de ambiente/uso.
// Git-only (builtins do Node) — roda antes do skip doc-only no pr-gate.
"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SNAPSHOTS_DIR = "LILA-DEV/planejamento/snapshots";
const LEDGER_PATH = "LILA-DEV/planejamento/decisoes-ledger.json";
const CHAVE_CAMPO = "Relacao decisoes ativas:";
const RE_CAMPO = /^Relacao decisoes ativas:[ \t]*(.*)$/im;
// Variante em NEGRITO do campo (#1194, 2026-10-07): o autor escreveu
// `**Relacao decisoes ativas:**` e o gate reportou "SEM o campo" — mensagem
// falsa que mandou o conserto para o lugar errado. Detectada para apontar o
// conserto exato (a chave deve abrir a linha, sem `**`) em vez de negar a
// existência do campo.
const RE_CAMPO_BOLD = /^\*\*Relacao decisoes ativas:\*\*[ \t]*(.*)$/im;
const RE_ID_UNIDADE = /\b[A-Za-z0-9][A-Za-z0-9._-]*\.[Uu]\d+\b/g;
const ENUM = ["sem-contradicao", "substitui"];

function gitReal(args) {
  return execFileSync("git", ["--no-pager", ...args], {
    cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/** Parseia `git diff --name-status -M` → [{ status, paths }]. Pura. */
function parseNameStatus(saida) {
  return String(saida).split(/\r?\n/).filter(Boolean).map((linha) => {
    const partes = linha.split("\t");
    return { status: partes[0], paths: partes.slice(1) };
  });
}

/** Snapshots ADICIONADOS (status A) — alvo do gate. Pura. */
function snapshotsAdicionados(entries) {
  const alvo = [];
  for (const e of entries || []) {
    if (!e || !e.status || !e.status.startsWith("A")) continue;
    for (const p of e.paths) {
      if (p && p.startsWith(SNAPSHOTS_DIR + "/") && p.endsWith(".md")) alvo.push(p);
    }
  }
  return alvo;
}

/** Extrai e classifica o valor declarado do campo. Pura. → { valor, tipo, idsRest } */
function lerCampo(conteudo) {
  const m = RE_CAMPO.exec(String(conteudo || ""));
  if (!m) return { valor: null, tipo: null, idsRest: [] };
  const valor = m[1].replace(/\r$/, "").trim();
  if (valor.startsWith(ENUM[0])) return { valor, tipo: ENUM[0], idsRest: [] };
  if (valor.startsWith(ENUM[1])) return { valor, tipo: ENUM[1], idsRest: valor.slice(ENUM[1].length) };
  return { valor, tipo: null, idsRest: "" };
}

/** IDs de unidade citados num valor `substitui ...`. Pura. */
function idsSubstituidos(idsRest) {
  const set = new Set();
  const re = new RegExp(RE_ID_UNIDADE.source, "g");
  let m;
  while ((m = re.exec(String(idsRest || ""))) !== null) set.add(m[0]);
  return [...set];
}

/**
 * Valida um snapshot adicionado contra o ledger. Pura.
 * unidades: mapa id → { status } (do decisoes-ledger em head).
 * → { ok, problemas: [string] }
 */
function validarSnapshot(caminho, conteudo, unidades) {
  const problemas = [];
  const campo = lerCampo(conteudo);
  if (campo.valor === null) {
    if (RE_CAMPO_BOLD.test(String(conteudo || ""))) {
      problemas.push("campo presente em NEGRITO (`**Relacao decisoes ativas:**`) — a chave deve ABRIR a linha, sem `**`: `Relacao decisoes ativas: sem-contradicao — verificacao: <fonte>` (FDV-PLAN §2)");
    } else {
      problemas.push("snapshot adicionado SEM o campo `" + CHAVE_CAMPO + "` — declare `sem-contradicao` (com a fonte de verificação) ou `substitui <ids>` (FDV-PLAN §2)");
    }
    return { ok: false, problemas };
  }
  if (campo.tipo === null) {
    problemas.push("valor fora do enum: \"" + campo.valor.slice(0, 60) + "\" — use `sem-contradicao` ou `substitui <ids>`");
    return { ok: false, problemas };
  }
  if (campo.tipo === ENUM[1]) {
    const ids = idsSubstituidos(campo.idsRest);
    if (ids.length === 0) {
      problemas.push("`substitui` sem ID de unidade citado — cite os IDs do decisoes-ledger (formato <NODE>.U<n>)");
    }
    for (const id of ids) {
      const un = unidades ? unidades[id] : undefined;
      if (!un) {
        problemas.push("`substitui " + id + "`: ID não existe no decisoes-ledger — registre a unidade via lila-grafo-mcp (register_unit) ou corrija o ID");
      } else if (un.status !== "deprecated") {
        problemas.push("`substitui " + id + "`: unidade ainda `" + (un.status || "sem status") + "` — registre a deprecacao (deprecate_unit via lila-grafo-mcp) no fechamento antes do merge");
      }
    }
  }
  return { ok: problemas.length === 0, problemas };
}

/** Mapa id → { status } do ledger (conteúdo JSON string). Pura. */
function indiceUnidades(ledgerJson) {
  const ledger = JSON.parse(String(ledgerJson));
  const mapa = {};
  for (const u of ledger.unidades || []) if (u && u.id) mapa[u.id] = { status: u.status };
  return mapa;
}

function resolverBase(baseArg, gitExec) {
  if (baseArg) return baseArg;
  try { return gitExec(["merge-base", "origin/main", "HEAD"]).trim(); }
  catch { return null; }
}

function main(argv) {
  const args = (argv || []).slice();
  const baseArg = args.find((a) => a.startsWith("--base="));
  const headArg = args.find((a) => a.startsWith("--head="));
  const base = baseArg ? baseArg.slice("--base=".length) : null;
  const head = headArg ? headArg.slice("--head=".length) : "HEAD";
  const gitExec = gitReal;
  try {
    const baseResolvida = resolverBase(base, gitExec);
    if (!baseResolvida) {
      process.stderr.write("[relacao-decisoes] ERRO: base não resolvível (passe --base=<rev>) — falha explícita, nunca silenciosa\n");
      return 2;
    }
    const diff = gitExec(["diff", "--name-status", "-M", baseResolvida, head, "--", SNAPSHOTS_DIR]);
    const alvo = snapshotsAdicionados(parseNameStatus(diff));
    if (alvo.length === 0) {
      process.stdout.write("=== relação com decisões ativas (FRAME-LACO-ESTADO-20261002) ===\n" +
        "Nenhum snapshot adicionado em " + baseResolvida.slice(0, 8) + ".." + String(head).slice(0, 8) + " — nada a verificar.\n");
      return 0;
    }
    let unidades = null;
    let carregado = false;
    const linhas = [];
    let violacoes = 0;
    for (const caminho of alvo) {
      let conteudo;
      try { conteudo = gitExec(["show", head + ":" + caminho]); }
      catch (err) { linhas.push("VIOLACAO | " + caminho + " | conteúdo indisponível em " + head + ": " + (err && err.message ? err.message.split("\n")[0] : "")); violacoes++; continue; }
      if (!carregado) {
        try { unidades = indiceUnidades(gitExec(["show", head + ":" + LEDGER_PATH])); carregado = true; }
        catch (err) {
          process.stderr.write("[relacao-decisoes] ERRO: decisoes-ledger ilegível em " + head + " — " + (err && err.message ? err.message.split("\n")[0] : "") + "\n");
          return 2;
        }
      }
      const r = validarSnapshot(caminho, conteudo, unidades);
      if (r.ok) linhas.push("OK | " + caminho);
      else { violacoes++; for (const p of r.problemas) linhas.push("VIOLACAO | " + caminho + " | " + p); }
    }
    process.stdout.write("=== relação com decisões ativas (FRAME-LACO-ESTADO-20261002) ===\n" +
      "Snapshots adicionados na faixa " + baseResolvida.slice(0, 8) + ".." + String(head).slice(0, 8) + ": " + alvo.length + "\n" +
      linhas.join("\n") + "\n" +
      "Resultado: " + (violacoes === 0 ? "OK — toda cristalização nova declara sua relação com as decisões ativas." : violacoes + " violação(ões) — bloqueio (exit 1).") + "\n");
    return violacoes === 0 ? 0 : 1;
  } catch (err) {
    process.stderr.write("[relacao-decisoes] ERRO: " + (err && err.message ? err.message.split("\n")[0] : String(err)) + " — falha explícita, nunca silenciosa\n");
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { CHAVE_CAMPO, RE_CAMPO, RE_CAMPO_BOLD, parseNameStatus, snapshotsAdicionados, lerCampo, idsSubstituidos, validarSnapshot, indiceUnidades, resolverBase, main };
