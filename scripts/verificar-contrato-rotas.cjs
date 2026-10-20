#!/usr/bin/env node
// scripts/verificar-contrato-rotas.cjs
// C25-03 item 3 / HB-020 (2026-09-28) — GATE DE CONTRATO DE ROTAS front×back.
//
// POR QUE ESTE GATE EXISTE
// O storm de 404 do badge `shadow-sm` nasceu de um bump que renomeou rotas por
// busca-e-substituição SÓ no front: o contrato front×back driftou em silêncio e
// o produto descobriu em produção (C25-03 / HB-020). Os testes de URL do
// api-client guardam as URLs que alguém lembrar de pinar; este gate guarda a
// CLASSE — toda rota chamada pelo front precisa existir no backend.
//
// REGRAS (declaradas — o que está fora, está fora por escrito)
//  1. Front: chamadas literais dos transportes (`get/post/put/del/patch/fetch`
//     e `buildUrl`) cujo 1º argumento é string começando em `/api/`, em `src/**`
//     fora de testes. Segmentos com `${...}` contam como curinga.
//  2. Front: CONSTANTES de path (`const X = "/api/v1/..."`) entram como PREFIXO
//     (cobre transporte montado por concatenação, ex.: blob store de anexos).
//  3. Backend: rotas registradas em `backend/src/routes/**` via
//     `app.<verbo>("/api/...")`; segmento iniciado por `:` é curinga.
//  4. Casamento: mesma quantidade de segmentos, curinga casando qualquer
//     segmento; chamada PREFIXO (regra 2) casa qualquer rota que comece por ela.
//  5. Qualquer chamada do front sem rota correspondente = DRIFT (exit 1).
//
// SAÍDA: exit 0 (contrato íntegro) | exit 1 (drift listado — arquivo:linha).
// Zero dependências (fs/path) e <1s — mesmo fast lane dos gates leves do
// `pr-gate.yml` (DOC_ONLY/DOC_GATE pulam).

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const DIR_FRONT = path.join(RAIZ, "src");
// Rotas vivem em `routes/**`, mas também em `plugins/**` (ex.: health) e no
// bootstrap — a varredura cobre backend/src inteiro (menos __tests__/test).
const DIR_BACKEND = path.join(RAIZ, "backend", "src");

const VERBOS_BACKEND = ["get", "post", "put", "delete", "patch"];

// ── EXCEÇÕES DECLARADAS (datadas — nunca silenciosas) ────────────────────────
// Chamadas zumbis PRÉ-EXISTENTES detectadas na ativação do gate (2026-09-28):
// a rota não existe no backend e não há consumidor no front. NÃO são removidas
// neste ato porque `chatApi.verifyKey` tem contrato PINADO por teste — remover
// exige deliberação humana (E-INV-09/16). Ficam visíveis na saída do gate e
// registradas como achado para o próximo ciclo. Qualquer OUTRA rota nova que
// não exista no backend continua reprovando (exit 1).
const EXCECOES_DECLARADAS = [
  {
    path: "/api/v1/chat/image",
    motivo:
      "rota removida do backend (LIMPEZA-ORFAOS-ARTISTA, 2026-09-18); chatApi.generateImage sem consumidor",
    desde: "2026-09-28",
  },
  {
    path: "/api/v1/chat/verify-key",
    motivo:
      "rota inexistente no backend (o service verifyKey existe, sem rota HTTP); chatApi.verifyKey sem consumidor",
    desde: "2026-09-28",
  },
];

function ehExcecaoDeclarada(path) {
  return EXCECOES_DECLARADAS.some((e) => limparPath(e.path) === limparPath(path));
}

/** Segmentos de um path já limpo (sem query), sem vazios. Pura. */
function segmentos(p) {
  return p.split("/").filter((s) => s.length > 0);
}

/** Um segmento é curinga? `${...}`, `:param` ou `*`. */
function ehCuringa(segmento) {
  return segmento.includes("${") || segmento.startsWith(":") || segmento === "*";
}

/**
 * Casa uma chamada do front contra uma rota do backend. Pura.
 * `prefixo` = chamada montada por concatenação (regra 2): aceita qualquer
 * continuação desde que os segmentos conhecidos batam em ordem.
 */
function casaRota(chamada, rota, prefixo = false) {
  const f = segmentos(chamada);
  const b = segmentos(rota);
  if (prefixo) {
    for (let i = 0; i < f.length; i++) {
      const alvo = b[i];
      if (alvo === undefined) return false;
      if (!ehCuringa(f[i]) && !ehCuringa(alvo) && f[i] !== alvo) return false;
    }
    return true;
  }
  if (f.length !== b.length) return false;
  for (let i = 0; i < f.length; i++) {
    if (ehCuringa(f[i]) || ehCuringa(b[i])) continue;
    if (f[i] !== b[i]) return false;
  }
  return true;
}

/** Linha (1-based) de um índice de caractere no fonte. Pura. */
function linhaDoIndice(fonte, indice) {
  return fonte.slice(0, indice).split("\n").length;
}

/**
 * Extrai as rotas chamadas pelo front a partir de um fonte. Pura.
 * Varredura por FONTE INTEIRA (não linha a linha): as chamadas do repo quebram
 * em várias linhas com frequência (`buildUrl(\n  "/api/v1/...")`).
 */
function extrairChamadasFront(fonte) {
  const achados = [];
  const reChamada = /\b(get|post|put|del|patch|fetch|buildUrl)\s*(?:<[^>]*>)?\(\s*(["'`])(\/api\/[^"'`]*)\2/g;
  const reConstante = /\bconst\s+[A-Za-z_$][\w$]*\s*=\s*(["'`])(\/api\/[^"'`]*)\1/g;
  for (const m of fonte.matchAll(reChamada)) {
    achados.push({ path: m[3], linha: linhaDoIndice(fonte, m.index ?? 0), prefixo: false });
  }
  for (const m of fonte.matchAll(reConstante)) {
    achados.push({ path: m[2], linha: linhaDoIndice(fonte, m.index ?? 0), prefixo: true });
  }
  return achados;
}

/**
 * Extrai as rotas registradas no backend a partir de um fonte. Pura.
 * Fonte inteira: o repo registra quase todas as rotas em `app.verbo(\n "path")`.
 */
function extrairRotasBackend(fonte) {
  const achados = [];
  const re = new RegExp(
    `\\bapp\\.(${VERBOS_BACKEND.join("|")})\\(\\s*(["'\`])(\\/api\\/[^"'\`]*)\\2`,
    "g",
  );
  for (const m of fonte.matchAll(re)) {
    achados.push({ path: m[3], linha: linhaDoIndice(fonte, m.index ?? 0) });
  }
  return achados;
}

/** Limpa a chamada: sem query string, sem barra final. Pura. */
function limparPath(p) {
  const semQuery = p.split("?")[0];
  return semQuery.endsWith("/") && semQuery.length > 1 ? semQuery.slice(0, -1) : semQuery;
}

function listarArquivos(dir, filtro) {
  const saida = [];
  if (!fs.existsSync(dir)) return saida;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "__tests__" || entrada.name === "test") continue;
      saida.push(...listarArquivos(completo, filtro));
      continue;
    }
    if (filtro(entrada.name)) saida.push(completo);
  }
  return saida;
}

/** Compara chamadas do front contra rotas do backend. Pura. */
function compararContratos(chamadas, rotas) {
  const drift = [];
  for (const chamada of chamadas) {
    const alvo = limparPath(chamada.path);
    if (ehExcecaoDeclarada(alvo)) continue;
    const casa = rotas.some((rota) => casaRota(alvo, limparPath(rota.path), chamada.prefixo));
    if (!casa) {
      drift.push({ path: chamada.path, arquivo: chamada.arquivo, linha: chamada.linha });
    }
  }
  return drift;
}

/** Relativo à raiz, com barra normalizada (evita ruído de separador do SO). */
function relativo(arquivo) {
  return path.relative(RAIZ, arquivo).split(path.sep).join("/");
}

function principal() {
  const arquivosFront = listarArquivos(
    DIR_FRONT,
    (nome) => /\.(ts|tsx)$/.test(nome) && !/\.(test|spec)\./.test(nome),
  );
  const arquivosBackend = listarArquivos(DIR_BACKEND, (nome) => /\.ts$/.test(nome));

  const chamadas = arquivosFront.flatMap((arquivo) =>
    extrairChamadasFront(fs.readFileSync(arquivo, "utf8")).map((c) => ({ ...c, arquivo: relativo(arquivo) })),
  );
  const rotas = arquivosBackend.flatMap((arquivo) =>
    extrairRotasBackend(fs.readFileSync(arquivo, "utf8")).map((r) => ({ ...r, arquivo: relativo(arquivo) })),
  );

  const drift = compararContratos(chamadas, rotas);

  if (drift.length > 0) {
    console.error(
      `verificar-contrato-rotas — DRIFT de contrato front×back: ${String(drift.length)} chamada(s) sem rota correspondente`,
    );
    for (const item of drift) {
      console.error(`  - ${item.arquivo}:${String(item.linha)} → ${item.path}`);
    }
    console.error(
      `\nRotas registradas no backend: ${String(rotas.length)}. Corrija a chamada do front ou registre a rota no backend.`,
    );
    return 1;
  }

  console.log(
    `✅ verificar-contrato-rotas — contrato íntegro: ${String(chamadas.length)} chamada(s) do front casam com ${String(rotas.length)} rota(s) do backend.`,
  );
  if (EXCECOES_DECLARADAS.length > 0) {
    console.log(
      `   exceções declaradas (NÃO silenciosas): ${String(EXCECOES_DECLARADAS.length)} — zumbis pré-existentes, aguardando deliberação`,
    );
    for (const e of EXCECOES_DECLARADAS) {
      console.log(`     - ${e.path} (desde ${e.desde}): ${e.motivo}`);
    }
  }
  return 0;
}

module.exports = {
  casaRota,
  extrairChamadasFront,
  extrairRotasBackend,
  compararContratos,
  limparPath,
  ehExcecaoDeclarada,
  EXCECOES_DECLARADAS,
};

if (require.main === module) {
  process.exit(principal());
}
