#!/usr/bin/env node
/**
 * detectar-lane.cjs — roteamento de lanes + dente da fronteira estrutural/patch
 * (FRAME-LANES-20261003; fonte do processo: docs/FLUXO-LANES.md).
 *
 * Uso: node scripts/detectar-lane.cjs --base <PR_BASE_SHA> [--root <dir>]
 * Exit: 0 ok | 1 violação de rota/fronteira | 2 ambiente/uso.
 *
 * Classificação (determinística, por conteúdo do diff base...HEAD):
 *   LANE-LILA-WRITE — 100% .md, cada arquivo em Method/** (ESTRITAMENTE
 *                     aditivo — status A) OU em LILA-DEV/planejamento/prompts/**
 *                     (não-destrutivo — create A ou update M; delete NUNCA; extensão
 *                     2026-10-10, decisão humana).
 *   LANE-DOCS       — 100% .md em docs/**|Method/**|LILA-DEV/**.
 *   LANE-TRIVIAL    — 100% em src/components/**|src/pages/**|src/hooks/** (+*.css,*.md)
 *                     E ≤5 arquivos E ≤100 linhas alteradas (ins+del).
 *   null            — caminho normal (ESTRUTURAL ou PATCH clássico).
 *
 * Verificações (V1–V6):
 *   V1: PR classificado como lane N ⇒ TODO commit não-merge do range carrega [N].
 *   V2: PR SEM lane ⇒ nenhum commit carrega tag LANE-* (tag de lane sem lane = rota errada).
 *   V3 (fronteira U3): diff que ADICIONA nó "PATCH-*" ao grafo.json reprova —
 *       patch não cunha identidade (legado permanece; só linhas ADICIONADAS contam).
 *   V4 (aditivo/não-destrutivo U5): lane LILA-WRITE com arquivo M/D/R em
 *       Method/** (ou D/R em LILA-DEV/planejamento/prompts/**) reprova
 *       — prompts/** admite create E update, nunca delete.
 *   V5 (PATCH-LANES-BINDING-20261015): o TÍTULO do PR participa como mais um
 *       portador de tag — tag de lane no título obedece às mesmas regras V1/V2
 *       (fecha o furo do squash: título taggado + commits sem tag mergeavam).
 *   V6 (idem): entrega que REIVINDICA lane (tag em commit ou título) exige
 *       entry nova no log da âncora — `entry_id: LANE-<NOME>.E<N>` adicionado
 *       em LILA-DEV/execucao/logs/LANE-<NOME>-log.md (FLUXO-LANES §4.3 com dente).
 *       V6-ISENTO na LANE-LILA-WRITE (veredito humano 2026-10-19): a lane é
 *       aditiva por construção (V4 proíbe M/D/R em Method/** e delete em
 *       prompts/**) — o diff é o próprio rastro. V6 segue com dente em
 *       LANE-DOCS e LANE-TRIVIAL, onde a lane admite modificação.
 *
 * Isenções (FLUXO-LANES §5, lista pinada — EXEMPT_PREFIXES abaixo): commits de
 * derivado puro (chore(indices)/chore(gate)/chore(grafos)) não participam de
 * V1/V2 — nem exigem nem proíbem tag de lane.
 *
 * Paths negados da LANE-DOCS (canônico congelado — ritual humano; mesma lista
 * documentada no short-circuit docs-only do merge-gate): manifest, INDEX,
 * TOOLUSE-PHASING, MSG-FORMAT-BLOCKS, docs/FDV-* → diff que os toca não é
 * LANE-DOCS (cai para caminho normal, onde a revisão humana governa).
 *
 * Fail-safe fail-open: base ausente/não-resolvível → não avalia (exit 0 com
 * aviso), nunca bloqueia por ambiente (padrão docs-only do merge-gate,
 * E-INV-16). "Fail-open" é o nome honesto: a ausência LIBERA, não trava.
 *
 * RANGE À PROVA DE MERGE (PATCH-LANES-RANGE-20261017): o `--base` do CI é o
 * PR_BASE_SHA congelado no EVENTO. Depois de um `git merge origin/main` ele
 * vira ancestral do HEAD (main entra como segundo pai) e `log base..HEAD` passa
 * a listar TODO o histórico de main desde aquela base — squash antigos com
 * [LANE-DOCS]/[LANE-TRIVIAL] reprovavam V2 (#1442, #1460). O detector resolve
 * uma BASE EFETIVA = merge-base de origin/main com HEAD (regra newest-ancestor
 * em escolherBaseEfetiva) e usa ELA nas cinco leituras.
 *
 * Por que não filtrar só os subjects: o diff continuaria poluído (branch
 * lane-DOCS + main mergeada → arquivos de backend no range → lane=null → V2
 * falso). Base efetiva corrige subjects E diffs juntos. Encolher o range nunca
 * cega violação verdadeira: commit do autor é sempre posterior ao merge-base;
 * commit de main nunca foi do PR para julgar.
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const GRAFO_REL = path.join("LILA-DEV", "planejamento", "grafo.json");
const PATCH_ID_RE = /"id"\s*:\s*"(PATCH-[A-Za-z0-9._-]+)"/;
const LANE_IDS = ["LANE-DOCS", "LANE-LILA-WRITE", "LANE-TRIVIAL"];
const LANE_DOCS_MD_DIRS = ["docs/", "Method/", "LILA-DEV/"];
const LILA_WRITE_MD_DIRS = ["Method/"];
// Extensão da lane (decisão humana 2026-10-10): prompts/** entra com .md
// não-destrutivo — create E update; delete nunca (deleteArmed é outra via).
const LILA_WRITE_PROMPTS_DIR = "LILA-DEV/planejamento/prompts/";
const TRIVIAL_DIRS = ["src/components/", "src/pages/", "src/hooks/"];
const TRIVIAL_MAX_FILES = 5;
const TRIVIAL_MAX_LINES = 100;
// Isenções FLUXO-LANES §5 (derivado puro não é entrega de lane) — lista pinada
// única; a doc aponta para cá. Sujeitos com esses prefixos saem de V1/V2.
const EXEMPT_PREFIXES = ["chore(indices):", "chore(gate):", "chore(grafos):"];
// Paths canônicos congelados — fora da LANE-DOCS mesmo sendo .md sob docs/**
// (mesmo conjunto documentado no short-circuit docs-only do merge-gate).
const DOCS_NEGADOS = [
  "docs/AI-PROJECT-MANIFEST.md",
  "docs/AI-PROJECT-MANIFEST-INDEX.md",
  "docs/TOOLUSE-PHASING.md",
  "docs/MSG-FORMAT-BLOCKS.md",
];
const DOCS_NEGADOS_PREFIX = "docs/FDV-";
// Log-âncora de lanes (V6 — rastro incremental com dente).
const LOG_ANCORA_DIR = "LILA-DEV/execucao/logs/";

/** Tags [X] do subject — extração local (changelog-block-core removido na
 * aposentadoria do sistema CHANGELOG, evento deliberado Igor 2026-10-05). */
function tagsFromSubject(subject) {
  const out = [];
  const re = /\[([A-Za-z0-9._-]+)\]/g;
  const s = String(subject ?? "");
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  return out;
}

function isUnderAny(rel, dirs) {
  return dirs.some((d) => rel.startsWith(d));
}

/**
 * Núcleo puro. arquivos: [{path, status('A'|'M'|'D'|'R'|...), linhas}] — linhas =
 * ins+del quando conhecido (numstat), 0 para renames sem conteúdo medido.
 * subjects: subjects dos commits não-merge do range. prTitle: título do PR
 * (V5 — participa como portador de tag nas mesmas regras). Retorna:
 *   { lane, violacoes: [{codigo, motivo}] }
 */
function classificarLane({ arquivos, subjects, prTitle }) {
  const violacoes = [];
  if (arquivos.length === 0) return { lane: null, violacoes };

  const todos = (pred) => arquivos.every((a) => pred(a));
  const negado = (p) => p.startsWith(DOCS_NEGADOS_PREFIX) || DOCS_NEGADOS.includes(p);

  // LILA-WRITE: Method aditivo estrito (só A); prompts/** não-destrutivo
  // (create A ou update M — nunca delete/rename). Extensão 2026-10-10.
  const isPromptsPath = (p) => p.startsWith(LILA_WRITE_PROMPTS_DIR);
  const lilaWrite = todos((a) =>
    a.path.endsWith(".md") &&
    ((isUnderAny(a.path, LILA_WRITE_MD_DIRS) && a.status === "A") ||
      (isPromptsPath(a.path) && (a.status === "A" || a.status === "M"))));

  // DOCS: 100% .md nos diretórios canônicos, SEM path canônico congelado
  // (manifest/fdv-canônico seguem de ritual humano — caminho normal).
  const docsOnly = todos((a) => a.path.endsWith(".md") && isUnderAny(a.path, LANE_DOCS_MD_DIRS)) &&
    !arquivos.some((a) => negado(a.path));

  // TRIVIAL: UI confinada dentro do teto. Emenda E3 (U7): catálogo de modelos
  // (src/lib/models.ts — dado de configuração, não lógica) conta como path da
  // lane. (CHANGELOG.md saiu do conjunto na aposentadoria do sistema — 2026-10-06.)
  // .md de apoio nunca é path congelado.
  const trivialPaths = todos((a) =>
    isUnderAny(a.path, TRIVIAL_DIRS) || a.path === "src/lib/models.ts" ||
    a.path.endsWith(".css") ||
    (a.path.endsWith(".md") && isUnderAny(a.path, LANE_DOCS_MD_DIRS) && !negado(a.path)));
  const totalLinhas = arquivos.reduce((acc, a) => acc + (a.linhas || 0), 0);
  const trivial = trivialPaths && arquivos.length <= TRIVIAL_MAX_FILES && totalLinhas <= TRIVIAL_MAX_LINES;

  let lane = null;
  if (lilaWrite) lane = "LANE-LILA-WRITE";
  else if (docsOnly) lane = "LANE-DOCS";
  else if (trivial) lane = "LANE-TRIVIAL";

  // V1/V2 (+V5): casamento lane ↔ tags de commits e do título do PR. Commits
  // isentos (derivado puro, EXEMPT_PREFIXES) não participam.
  const itens = [
    ...subjects.map((s) => ({ texto: s, tipo: "commit" })),
    ...(prTitle ? [{ texto: prTitle, tipo: "título do PR" }] : []),
  ];
  for (const { texto, tipo } of itens) {
    if (EXEMPT_PREFIXES.some((p) => texto.startsWith(p))) continue;
    const tags = tagsFromSubject(texto).filter((t) => t.startsWith("LANE-"));
    if (lane) {
      const erradas = tags.filter((t) => t !== lane);
      if (erradas.length > 0) {
        violacoes.push({ codigo: "V1", motivo: `lane ${lane} exige tag [${lane}] — ${tipo} com tag errada: "${texto}"` });
      } else if (tags.length === 0 && tipo === "commit") {
        // título do PR sem tag é legítimo (as tags vivem nos commits); commit
        // sem tag em PR de lane não.
        violacoes.push({ codigo: "V1", motivo: `lane ${lane} exige tag [${lane}] em todo commit não-merge — faltando em: "${texto}"` });
      }
    } else if (tags.length > 0) {
      violacoes.push({ codigo: "V2", motivo: `tag de lane sem lane classificada (diff não é docs/lila-write/trivial): "${texto}"` });
    }
  }
  return { lane, violacoes };
}

/** V3: linhas ADICIONADAS do grafo.json no diff não podem cunhar PATCH-*. */
function patchNodesAdicionados(diffGrafoTexto) {
  const ids = [];
  for (const line of String(diffGrafoTexto ?? "").split(/\r?\n/)) {
    if (!line.startsWith("+")) continue;
    const m = line.match(PATCH_ID_RE);
    if (m) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

/** V6: entries de âncora ADICIONADAS no diff dos logs de lane (rastro §4.3). */
const ENTRY_ID_RE = /^\+\s*-\s*entry_id:\s*(LANE-[A-Z-]+)\.E\d+/;
function lanesComEntryAdicionada(diffLogsTexto) {
  const lanes = new Set();
  for (const line of String(diffLogsTexto ?? "").split(/\r?\n/)) {
    const m = line.match(ENTRY_ID_RE);
    if (m) lanes.add(m[1]);
  }
  return [...lanes];
}

// ─────────────────────────────────────────────────────────────────────────────
// IO (o núcleo acima é puro — testes não precisam de git)
// ─────────────────────────────────────────────────────────────────────────────

function git(args, cwd) {
  const r = spawnSync("git", ["-c", "core.quotepath=off", "--no-pager", ...args], { cwd, encoding: "utf8" });
  return { status: r.status === null ? -1 : r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/**
 * Path NOVO de uma entrada de diff do git. O git compacta renames em forma de
 * chaves quando as duas pontas compartilham prefixo/sufixo — o prefixo comum
 * fica FORA das chaves:
 *   "a/old.md => b/new.md"     rename simples (sem chaves)
 *   "a/{ => b}/new.md"         brace compacto (lado antigo vazio)
 *   "a/{old => new}/x.md"      brace compacto (ambos os lados preenchidos)
 *   "docs/A.md"                sem rename (path literal, devolvido intacto)
 * O path real de um brace é prefixo + lado NOVO + sufixo; qualquer lado pode
 * vir vazio. Bug corrigido em 2026-10-08 (caso real PR #1239): o parser antigo
 * fazia split(" => ").pop() + remoção crua de chaves, o que DESCARTAVA o
 * prefixo comum e deixava resíduo de "}" — um rename puro de .md sob LILA-DEV/
 * era lido como "executados/x.md", fora dos dirs da lane → lane=null → a tag
 * [LANE-DOCS] correta reprovava como V2. Sem " => " o path é literal: nada é
 * adivinhado.
 */
function resolveNewPath(caminho) {
  const s = String(caminho ?? "").trim();
  const brace = s.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (brace) return `${brace[1]}${brace[3]}${brace[4]}`.trim();
  if (s.includes(" => ")) return s.split(" => ").pop().trim();
  return s;
}

function numstatParaArquivos(numstatOut) {
  const arquivos = [];
  for (const line of String(numstatOut ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [ins, del, caminho] = parts;
    const status = ins === "-" ? "R" : "C";
    const linhas = ins === "-" ? 0 : (parseInt(ins, 10) || 0) + (parseInt(del, 10) || 0);
    // rename "a => b" (ou brace compacto): o path novo é o que vale para classificação.
    const p = resolveNewPath(caminho);
    arquivos.push({ path: p, status, linhas });
  }
  return arquivos;
}

/** Sha curto p/ log (9 chars — padrão do repo). */
function curto(sha) {
  return String(sha ?? "").slice(0, 9);
}

/** Refs candidatas a portador de "main" (canônica → remota explícita → deepen do CI). */
const REFS_BASE = ["origin/main", "refs/remotes/origin/main", "refs/remotes/origin/ci-deepen-base"];

/**
 * Núcleo PURO (sem git) — escolhe a base efetiva do range entre a INFORMADA
 * (`--base`, possivelmente congelada no evento) e o merge-base de origin/main
 * com HEAD. `isAncestor(a, b)` = "a é ancestral de b" (predicado do chamador —
 * nos testes, um grafo fake; na rota, `git merge-base --is-ancestor`).
 *
 * Regra newest-ancestor: só candidatos ancestrais do HEAD valem (base fora do
 * histórico do HEAD não serve para delimitar range). Com dois, vence o MAIS
 * NOVO: base ancestral do merge-base ⇒ merge-base (caso merge de main: a base
 * velha é ancestral, o merge-base é o tip atual); merge-base ancestral da base
 * ⇒ base (fetch já estava mais novo que o merge-base). Sem relação (histórico
 * reescrito/órfão), prefere o merge-base e registra o motivo. Nenhum candidato
 * ancestral ⇒ fallback explícito para a base informada.
 *
 * @returns {{efetiva: string, motivo: string}}
 */
function escolherBaseEfetiva({ base, mergeBase }, isAncestor) {
  const candidatos = [base];
  if (mergeBase && mergeBase !== base) candidatos.push(mergeBase);
  const ancestrais = candidatos.filter((c) => isAncestor(c, "HEAD"));
  if (ancestrais.length === 0) return { efetiva: base, motivo: "sem-candidato-ancestral" };
  if (ancestrais.length === 1) {
    return { efetiva: ancestrais[0], motivo: ancestrais[0] === base ? "base-ancestral" : "merge-base-ancestral" };
  }
  const [a, b] = ancestrais; // a = base, b = merge-base (ordem dos candidatos)
  if (isAncestor(a, b)) return { efetiva: b, motivo: "base-ancestral-do-merge-base" };
  if (isAncestor(b, a)) return { efetiva: a, motivo: "merge-base-ancestral-da-base" };
  return { efetiva: b, motivo: "nao-relacionados-prefere-merge-base" };
}

/**
 * IO fino — resolve a base efetiva no repo `cwd`. Tenta as refs de main em
 * ordem (a do deepen do CI entra por último), pega o merge-base com HEAD e
 * delega a escolha ao núcleo puro. NUNCA muda o fail-open: sem ref/merge-base
 * devolve a base informada + motivo.
 *
 * @returns {{efetiva: string, motivo: string, ref: string|null, mergeBase: string|null}}
 */
function resolverBaseEfetiva(base, cwd) {
  const isAncestor = (a, b) => a === b || git(["merge-base", "--is-ancestor", a, b], cwd).status === 0;
  for (const ref of REFS_BASE) {
    if (git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd).status !== 0) continue;
    const mb = git(["merge-base", ref, "HEAD"], cwd);
    const mergeBase = mb.status === 0 ? mb.stdout.trim() : "";
    if (!mergeBase) continue;
    return { ...escolherBaseEfetiva({ base, mergeBase }, isAncestor), ref, mergeBase };
  }
  return { efetiva: base, motivo: "sem-merge-base", ref: null, mergeBase: null };
}

function main() {
  const argv = process.argv.slice(2);
  const baseIdx = argv.indexOf("--base");
  const base = baseIdx !== -1 ? argv[baseIdx + 1] : null;
  const rootIdx = argv.indexOf("--root");
  const cwd = rootIdx !== -1 ? argv[rootIdx + 1] : process.cwd();
  const titleIdx = argv.indexOf("--pr-title");
  const prTitle = titleIdx !== -1 ? argv[titleIdx + 1] : null;
  if (!base) {
    console.log("lanes: sem --base (dispatch?) — não avaliadas (fail-open)");
    process.exit(0);
  }
  if (git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`], cwd).status !== 0) {
    console.log(`lanes: base ${base} não resolvível — não avaliadas (fail-open)`);
    process.exit(0);
  }

  // PATCH-LANES-RANGE-20261017 — base EFETIVA do range: merge-base de main com
  // HEAD (o --base do CI congela no evento e envelhece após merge de main).
  const resolucao = resolverBaseEfetiva(base, cwd);
  const efetiva = resolucao.efetiva;
  const fallbackSemMain = !resolucao.ref || resolucao.motivo === "sem-merge-base" || resolucao.motivo === "sem-candidato-ancestral";
  console.log(
    `lanes: base ${curto(efetiva)} (informada ${curto(base)}` +
      `${resolucao.mergeBase ? `, merge-base ${resolucao.ref} ${curto(resolucao.mergeBase)}` : ""}` +
      `${fallbackSemMain ? ", fallback sem origin/main" : ""})`,
  );

  const diffName = git(["diff", "--name-status", `${efetiva}...HEAD`], cwd);
  const diffNum = git(["diff", "--numstat", `${efetiva}...HEAD`], cwd);
  const diffGrafo = git(["diff", `${efetiva}...HEAD`, "--", GRAFO_REL], cwd);
  const diffLogs = git(["diff", `${efetiva}...HEAD`, "--", `${LOG_ANCORA_DIR}`], cwd);
  const subjects = git(["log", "--no-merges", "--format=%s", `${efetiva}..HEAD`], cwd).stdout
    .split(/\r?\n/).filter((s) => s.trim());
  if (diffName.status !== 0 || diffNum.status !== 0) {
    console.error("lanes: FALHA fechada — git diff indisponível");
    process.exit(2);
  }

  // numstat dá as linhas; name-status dá o status — casar por path final.
  const arquivosNum = numstatParaArquivos(diffNum.stdout);
  const statusPorPath = new Map();
  for (const line of diffName.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const st = parts[0][0];
    const p = resolveNewPath(parts[parts.length - 1]);
    statusPorPath.set(p, st);
  }
  const arquivos = arquivosNum.map((a) => ({ ...a, status: statusPorPath.get(a.path) || a.status }));

  const { lane, violacoes } = classificarLane({ arquivos, subjects, prTitle });

  // V3 (fronteira U3): grafo só ganha PATCH-* de ESTRUTURAL — nunca por diff de patch/lane.
  const patchNovos = patchNodesAdicionados(diffGrafo.stdout);
  if (patchNovos.length > 0) {
    violacoes.push({
      codigo: "V3",
      motivo: `fronteira estrutural/patch (FRAME-LANES-20261003): diff adiciona nó PATCH-* ao grafo (${patchNovos.join(", ")}) — patch não cunha identidade; use âncora de lane [LANE-DOCS|LANE-LILA-WRITE|LANE-TRIVIAL] ou suba para ESTRUTURAL (docs/FLUXO-LANES.md)`,
    });
  }

  // V4 (não-destrutivo U5): paths da lane Lila sem delete/rename — em prompts/**
  // o UPDATE (M) é permitido (extensão 2026-10-10); em Method só cria (A).
  if (lane === "LANE-LILA-WRITE") {
    const mutados = arquivos.filter((a) => {
      if (a.status === "M") return !a.path.startsWith(LILA_WRITE_PROMPTS_DIR);
      return a.status === "D" || a.status === "R";
    });
    if (mutados.length > 0) {
      violacoes.push({
        codigo: "V4",
        motivo: `LANE-LILA-WRITE é aditiva/não-destrutiva (prompts/** admite update, nunca delete) — arquivos proibidos: ${mutados.map((a) => a.path).join(", ")}`,
      });
    }
  }

  // V6 (rastro com dente): quem REIVINDICA lane (tag em commit ou título)
  // entrega entry nova no log da âncora — FLUXO-LANES §4.3.
  const reivindicadas = new Set();
  for (const s of [...subjects, ...(prTitle ? [prTitle] : [])]) {
    if (EXEMPT_PREFIXES.some((p) => s.startsWith(p))) continue;
    for (const t of tagsFromSubject(s)) if (LANE_IDS.includes(t)) reivindicadas.add(t);
  }
  const comEntry = new Set(lanesComEntryAdicionada(diffLogs.stdout));
  for (const l of [...reivindicadas].sort()) {
    // V6-ISENTO (veredito humano 2026-10-19): LANE-LILA-WRITE é aditiva por
    // construção — V4 já proíbe M/D/R em Method/** e delete em prompts/**.
    // O diff é o rastro; o ledger da âncora segue exigido em LANE-DOCS e
    // LANE-TRIVIAL, onde a lane admite modificação de arquivo existente.
    if (l === "LANE-LILA-WRITE") continue;
    if (!comEntry.has(l)) {
      violacoes.push({
        codigo: "V6",
        motivo: `entrega de lane exige entry nova no log da âncora (FLUXO-LANES §4.3): adicione bloco "entry_id: ${l}.E<N>" em ${LOG_ANCORA_DIR}${l}-log.md`,
      });
    }
  }

  const rotulo = lane || "caminho normal (sem lane)";
  if (violacoes.length > 0) {
    console.error(`lanes: REPROVADO — ${rotulo}`);
    for (const v of violacoes) console.error(`  [${v.codigo}] ${v.motivo}`);
    process.exit(1);
  }
  console.log(`lanes: ok — ${rotulo} (${arquivos.length} arquivo(s) no diff)`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { classificarLane, patchNodesAdicionados, lanesComEntryAdicionada, tagsFromSubject, numstatParaArquivos, resolveNewPath, escolherBaseEfetiva, resolverBaseEfetiva, LANE_IDS, EXEMPT_PREFIXES, DOCS_NEGADOS, DOCS_NEGADOS_PREFIX };
