"use strict";
/**
 * scripts/lib/conteudo-estavel.cjs
 * Política de FIM DO CHURN DE TIMESTAMP nos gerados (drenagem de 2026-10-06:
 * cada regen reescrevia 1 linha só de timestamp; todo pouso conflitava essa
 * linha com os demais PRs abertos → cascata CONFLICTING → resync em cadeia).
 *
 * Contrato (SKIP-WRITE): regen com conteúdo-útil idêntico ao commitado NÃO
 * reescreve o arquivo — o timestamp congela na última mudança REAL de conteúdo
 * e a regen dupla em árvore imutável produz diff ZERO (migração automática:
 * a primeira regen pós-mudança já não toca arquivo sem mudança real).
 *
 * Os validadores já são content-based e stripam/mascaram exatamente esses
 * campos (verificar-frescor-indices.cjs `VOLATIL`; verificar-frescor-manifest.cjs
 * `RE_GERADO`) — congelar não os afeta. Não mascara a classe falso-fresco do
 * `medir()` (#1162): medida velha gera CONTEÚDO diferente → escreve e o
 * validador pega; conteúdo igual não tem nada a dizer.
 *
 * EXCEÇÃO canônica (documentada no gerar-indice-vetorial.cjs): o `generatedAt`
 * do indice-vetorial.json é relógio SEMÂNTICO — consumidor buscar-vetorial.cjs
 * (idade + arquivos rastreados mudados desde a construção) — e não passa por
 * aqui. Registos de evento (ledgers, vereditos de gate) também não: são
 * append-only, não artefatos regenerados.
 */

const fs = require("fs");

/** Lê arquivo existente; null se ausente (arquivo novo → sempre escreve). */
function lerExistente(caminho) {
  try { return fs.readFileSync(caminho, "utf8"); } catch { return null; }
}

/** Strip profundo das chaves voláteis (mesmo conjunto de verificar-frescor-indices). */
function strip(obj, volateis) {
  if (Array.isArray(obj)) return obj.map((x) => strip(x, volateis));
  if (obj && typeof obj === "object") {
    const saida = {};
    for (const k of Object.keys(obj)) {
      if (!volateis.has(k)) saida[k] = strip(obj[k], volateis);
    }
    return saida;
  }
  return obj;
}

/**
 * JSON novo é "estável" frente ao existente quando, removidos os campos
 * voláteis de ambos, a serialização é idêntica. Existente ausente, vazio ou
 * corrompido (JSON quebrado/marcador de conflito) → false → escreve (auto-cura).
 */
function jsonIgualSemVolateis(novo, rawExistente, volateis) {
  if (typeof rawExistente !== "string" || !rawExistente) return false;
  let existente;
  try { existente = JSON.parse(rawExistente); } catch { return false; }
  return JSON.stringify(strip(novo, volateis)) === JSON.stringify(strip(existente, volateis));
}

/**
 * Texto novo é "estável" frente ao existente quando, normalizando CRLF/EOF e
 * mascarando o(s) trecho(s) volátil(eis) — regex com 3 grupos, o valor capturado
 * é o grupo 2 — os textos são idênticos. Hash/count de árvore (fora da máscara)
 * permanece conteúdo comparável: mudança real de árvore segue reescrevendo.
 */
function textoIgualMascarado(textoNovo, rawExistente, maskRe) {
  if (typeof rawExistente !== "string" || !rawExistente) return false;
  const mascara = (t) => t.replace(/\r\n/g, "\n").trimEnd().replace(maskRe, "$1<volatil>$3");
  return mascara(textoNovo) === mascara(rawExistente);
}

module.exports = { lerExistente, jsonIgualSemVolateis, textoIgualMascarado };
