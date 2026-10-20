#!/usr/bin/env node
/**
 * scripts/lib/gate-lote-core.cjs — núcleo PURO do gate de lote (H8 do complemento
 * pós-sweep 2026-09-25, item 3: "testes do `gate-lote.cjs`").
 *
 * POR QUE EXISTE: o `gate-lote.cjs` executa suítes no `require` (top-level), então
 * importá-lo num teste significa rodar vitest+tsc+eslint dentro do próprio runner de
 * testes. As DECISÕES do gate, porém, são puras — e são exatamente elas que podem
 * regredir sem ninguém notar: (a) a regra do rastro documental (tag de frame por
 * commit, merges ignorados, docs gerados fora), (b) a detecção de lock órfão,
 * (c) a classificação de falha transitória de script de NODE (o "stdout is not a
 * tty" é artefato de harness e NÃO é falha real — `.clinerules` EXECUCAO_CLI).
 * Extrair aqui deixa o script executável como fachada fina e o núcleo com contrato
 * testável (mesmo padrão de `scripts/lib/*`).
 */
"use strict";

/** Tag de frame em mensagem de commit (ex: FR-TOOLCALLS-O12, SP-AI-WRITE-01, PATCH-X-20260904). */
/**
 * Tag de frame em mensagem de commit — SOMENTE entre colchetes (ex: [FR-TOOLCALLS-O12],
 * [SP-AI-WRITE-01], [PATCH-X-20260904]). Drenagem 2026-10-04/05: sem colchetes, menção
 * incidental em prosa ("gate FRAME-LACO-ESTADO") virava tag fantasma e o multi-tag
 * exigia bloco inexistente. O detectar-lane.cjs já extraía só o colchetado.
 */
const FRAME_TAG_RE = /\[((?:FR|SP|KF|FRAME|PATCH|AUD|LANE)-[A-Za-z0-9][A-Za-z0-9._-]*)\]/;
/** Escopo documental do rastro E1.5 (manifesto + FDVs canônicos). */
const DOC_PATH_RE = /^(?:docs\/|src\/prompts\/Canonical\/)/;
/** Artefatos GERADOS (build) — exigir tag de frame neles gera falso positivo em todo `npm run indices`. */
const GENERATED_DOCS_RE = /^docs\/AI-PROJECT-MANIFEST(?:-INDEX)?\.md$/;

/** Docs do escopo do rastro (não-gerados) alterados na faixa. Pura. */
function docsDoRastro(changedFiles) {
  return (changedFiles ?? []).filter((f) => DOC_PATH_RE.test(f) && !GENERATED_DOCS_RE.test(f));
}

/**
 * Avalia o rastro documental de UM commit. Pura.
 * Devolve `{ ignorado: "merge" }`, `{ falha: {...} }` ou `null` (commit com tag ou
 * sem doc no escopo).
 */
function avaliarCommitDoRastro({ sha, subject, files, isMerge }) {
  if (isMerge) return { ignorado: "merge" };
  const tocaDoc = docsDoRastro(files).length > 0;
  if (!tocaDoc) return null;
  if (FRAME_TAG_RE.test(subject ?? "")) return null;
  return {
    falha: {
      sha,
      subject,
      reason: "commit altera docs/** ou src/prompts/Canonical/** sem tag de frame na mensagem",
    },
  };
}

/**
 * Lock anti-concorrência do gate: um lock é ÓRFÃO quando ilegível ou mais velho que
 * o teto (30 min). Pura — recebe `agoraMs` para teste determinístico.
 */
const LOCK_STALE_MS = 30 * 60 * 1000;

function lockOrfao(conteudoJsonOuNull, agoraMs, staleMs = LOCK_STALE_MS) {
  const info = conteudoJsonOuNull;
  if (!info || typeof info !== "object") return { orfao: true, idadeMs: idadeDe(null, agoraMs) };
  const idadeMs = idadeDe(info.startedAt, agoraMs);
  return { orfao: idadeMs >= staleMs, idadeMs };
}

function idadeDe(startedAt, agoraMs) {
  const inicio = Date.parse(startedAt);
  if (!Number.isFinite(inicio)) return Number.POSITIVE_INFINITY;
  return Math.max(0, agoraMs - inicio);
}

/**
 * `.clinerules` EXECUCAO_CLI 4 — `stdout is not a tty` é artefato do harness do
 * terminal, NÃO falha do script: o exit 1 reportado nesse caso é FALSO e o
 * diagnóstico correto é reexecutar com `node` direto e stdout direto. Esta função
 * classifica a saída de um script para o gate não transformar artefato em vermelho
 * silencioso (nem mascarar falha real que venha acompanhada do artefato).
 */
const RE_TTY = /stdout is not a tty/i;
/** Marcadores de SUCESSO do node:test/vitest (o artefato TTY vem SEMPRE sozinho). */
const RE_SUCESSO = /[✔✓]|^# pass/m;
/** Marcadores de FALHA explícita (node:test TAP: `# fail 3`; suítes usam ✖). */
const RE_FALHA = /# fail [1-9]|[✖✗]/;

function classificarFalhaScript(saida, exitCode) {
  if (exitCode === 0) return { tipo: "verde" };
  const texto = saida ?? "";
  const semArtefato = texto.replace(RE_TTY, "");
  // A ordem importa: um relatório com FALHA explícita nunca é tratado como
  // artefato, mesmo carregando o `stdout is not a tty` no meio.
  if (RE_FALHA.test(semArtefato)) return { tipo: "falha-com-resultado" };
  if (RE_SUCESSO.test(semArtefato)) return { tipo: "falha-com-resultado" };
  if (RE_TTY.test(texto)) return { tipo: "artefato-tty", reexecutar: true };
  return { tipo: "falha" };
}

/**
 * PATCH-GATE-BASE-FALLBACK-20261010 — decide a BASE da faixa do lote a partir do
 * estado do marker `.gate-base` (PURA; o I/O e o git ficam na fachada
 * `gate-lote.cjs`, que passa os três booleanos já medidos).
 *
 * Contrato (ordem de avaliação):
 *   1. sem marker                      → fallback, "sem GATE-BASE anterior";
 *   2. marker que NÃO resolve no clone → fallback, "irresolvível no clone local"
 *      — ratificado 2026-10-10: era FALHA DURA e quebrava a camada 2 do E2 em
 *      TODA sessão nova. O marker guarda o head do BRANCH (o gate o reescreve no
 *      sucesso) e, após squash-merge com o branch apagado, o objeto pode não
 *      existir no clone local (medido: main em `c8582173` → "could not get
 *      object info");
 *   3. marker resolvível mas NÃO ancestral de HEAD → fallback "não-ancestral"
 *      (ratificado SP-ROTEADOR-REASONING 2026-09-13);
 *   4. marker resolvível e ancestral → USA o marker.
 * Nunca lança: devolve `{ usarMarker, motivo }` e a fachada roteia.
 */
function decidirBaseDoLote({ markerExiste, shaResolvivel, shaAncestral }) {
  if (!markerExiste) return { usarMarker: false, motivo: "sem GATE-BASE anterior" };
  if (!shaResolvivel) {
    return {
      usarMarker: false,
      motivo: "GATE-BASE irresolvível no clone local (provável head de branch squash-mergeado)",
    };
  }
  if (!shaAncestral) {
    return { usarMarker: false, motivo: "GATE-BASE não-ancestral de HEAD — normal após squash-merge" };
  }
  return { usarMarker: true, motivo: null };
}

module.exports = {
  FRAME_TAG_RE,
  DOC_PATH_RE,
  GENERATED_DOCS_RE,
  LOCK_STALE_MS,
  decidirBaseDoLote,
  docsDoRastro,
  avaliarCommitDoRastro,
  lockOrfao,
  classificarFalhaScript,
};
