#!/usr/bin/env node
 
/**
 * scripts/gerar-indice-manifest.cjs
 * Proposito: gera docs/AI-PROJECT-MANIFEST-INDEX.md (indice de 2KB) a partir do
 * AI-PROJECT-MANIFEST.md, com --check anti-drift e --sync-db (espelho manifest_docs).
 * Entrada: docs/AI-PROJECT-MANIFEST.md
 * Saida:   docs/AI-PROJECT-MANIFEST-INDEX.md | espelho DB (--sync-db)
 * Erros:   exit 1 em falha de leitura/escrita/drift/sync-db (padrao da familia gerar-*.cjs).
 * Determinismo (PATCH-FRESCOR-MANIFEST-INDEX-20260918, HB-015): a data do INDEX deriva do
 * `last_update` da FONTE — nunca do relogio de parede (mesma fonte => mesmo byte-a-byte;
 * padrao canonico da emenda A1 / PROTOCOLO-CANONICAL §7). O campo `generated_at` foi
 * REMOVIDO: era redundante com `last_update` e era o unico byte volatil por relogio, que
 * deixava `indices:check` vermelho na virada do dia UTC.
 *
 * Contrato de secao (usado pelo backend manifest-sync.ts / manifest-tools.ts):
 *   linha do indice: "<header> | L<start>-<end> | <desc>"
 *   header = linha real do manifesto ("#0 RUNTIME CONTEXT", "# NOTA LIMPEZA-OS ...")
 *   # NOTA LIMPEZA-OS = marcada "NAO consultar p/ runtime"
 *   version = extraida do meta: do manifesto (regex version=(\S+))
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Padrao canonico de timestamp deterministico (emenda A1 / PROTOCOLO-CANONICAL §7),
// reaproveitado de gerar-manifest-esqueleto.cjs — single-source, sem duplicacao local.
const { geradoEm } = require('./gerar-manifest-esqueleto.cjs');

const DEFAULT_MANIFEST_PATH = 'docs/AI-PROJECT-MANIFEST.md';
const DEFAULT_INDEX_PATH = 'docs/AI-PROJECT-MANIFEST-INDEX.md';
// Overrides para testes (mesmo padrao do gerador vetorial: nunca tocar o real).
const MANIFEST_PATH = process.env.MANIFEST_PATH || DEFAULT_MANIFEST_PATH;
const INDEX_PATH = process.env.MANIFEST_INDEX_PATH || DEFAULT_INDEX_PATH;

const VERBOSE = process.argv.includes('--verbose');
const HELP = process.argv.includes('--help') || process.argv.includes('-h');
const CHECK = process.argv.includes('--check');
const SYNC_DB = process.argv.includes('--sync-db');

// Headers reais do manifesto: "#0", "#0.1", "#4.2", "#8.5", "# NOTA LIMPEZA-OS (2026-08-26)".
const HEADER_RE = /^#{1,3}\s*(\d+(?:\.\d+)*|NOTA\s+LIMPEZA-OS)/;
const DESC_MAX_CHARS = 80;

function log(...args) {
  if (VERBOSE) console.log(...args);
}

/** Primeira linha de conteudo nao-vazia no range [from0, to0] (0-based, exclui header). */
function firstContentLine(lines, from0, to0) {
  for (let i = from0; i <= to0; i++) {
    const line = lines[i];
    if (line !== undefined && line.trim().length > 0) {
      return line.trim().slice(0, DESC_MAX_CHARS);
    }
  }
  return '';
}

/**
 * Parseia o manifesto em secoes.
 * @returns {Array<{header:string, name:string, startLine:number, endLine:number, desc:string}>}
 *   startLine/endLine 1-based inclusivos (endLine = proximo header - 1; ultima = total de linhas).
 *   Somente headers reais (#N / # NOTA LIMPEZA-OS) viram secao — sem pseudo-secao de cauda
 *   (a cauda meta_* do manifesto esta EXTINTA na v3.0, 2026-09-08).
 */
function parseSections(manifestText) {
  const lines = manifestText.split('\n');
  // Descarta a linha vazia produzida pelo newline final (total = linhas reais).
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const total = lines.length;
  const headers = [];
  for (let i = 0; i < total; i++) {
    const m = HEADER_RE.exec(lines[i]);
    if (m) headers.push({ index: i, name: m[1], headerText: lines[i].trim() });
  }

  const rawSections = headers.map((h, k) => {
    const end0 = k + 1 < headers.length ? headers[k + 1].index - 1 : total - 1;
    return {
      header: h.headerText,
      name: h.name,
      startLine: h.index + 1,
      endLine: end0 + 1,
      start0: h.index + 1, // 0-based do inicio do conteudo (linha seguinte ao header)
      end0,
    };
  });

  // A cauda meta_* do manifesto esta EXTINTA (v3.0, 2026-09-08) — o indice mapeia
  // apenas headers reais; nenhuma pseudo-secao de changelog e emitida.
  return rawSections.map((sec) => ({
    header: sec.header,
    name: sec.name,
    startLine: sec.startLine,
    endLine: sec.endLine,
    desc: firstContentLine(lines, sec.start0, sec.end0),
  }));
}

/** Monta o markdown do indice (formato fixo consumido pelo backend). */
function buildIndex(manifestText) {
  const sections = parseSections(manifestText);
  const version = extractVersion(manifestText);
  // HB-015: sem relogio de parede — `lastUpdate` vem da FONTE (ver extractLastUpdate).
  const lastUpdate = extractLastUpdate(manifestText);
  const out = [];
  out.push('# AI-PROJECT-MANIFEST-INDEX');
  // Campos A2 (docs:check) presentes na linha meta: Version | Last update | Status | Authority.
  // `generated_at` REMOVIDO (HB-015): redundante com `last_update` e unico byte volatil.
  out.push(`meta: {source=docs/AI-PROJECT-MANIFEST.md | version=${version} | last_update=${lastUpdate} | status=APPROVED | authority=AI-PROJECT-MANIFEST.md A1 | generated=scripts/gerar-indice-manifest.cjs}`);
  out.push('USO: injeta ESTE índice (nunca o manifesto). Consulta profunda: manifest_read(section). Seção = faixa abaixo.');
  out.push('');
  for (const sec of sections) {
    const desc = sec.name === 'NOTA LIMPEZA-OS' ? `${sec.desc} — NAO consultar p/ runtime` : sec.desc;
    out.push(`${sec.header} | L${sec.startLine}-${sec.endLine} | ${desc}`);
  }
  return out.join('\n') + '\n';
}

/** Compara byte-a-byte com o indice existente; exit 1 em drift com a primeira divergencia. */
function checkDrift(generated) {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error(`[gerar-indice-manifest] DRIFT: indice ausente — ${INDEX_PATH}`);
    console.error('  Execute: node scripts/gerar-indice-manifest.cjs');
    process.exit(1);
  }
  const existing = fs.readFileSync(INDEX_PATH, 'utf8');
  // PATCH-CRLF-DRIFT-FIX (2026-09-05): normaliza CRLF→LF antes de comparar.
  // No Windows (core.autocrlf=true) o checkout grava CRLF, e split('\n') deixa
  // '\r' residual — produzia DRIFT falso-positivo ("esperado" == "existente").
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const existingNorm = norm(existing);
  const generatedNorm = norm(generated);
  if (existingNorm === generatedNorm) {
    console.log('✅ docs/AI-PROJECT-MANIFEST-INDEX.md — fresco (sem drift).');
    process.exit(0);
  }
  const genLines = generatedNorm.split('\n');
  const exLines = existingNorm.split('\n');
  const max = Math.max(genLines.length, exLines.length);
  for (let i = 0; i < max; i++) {
    if ((genLines[i] ?? '') !== (exLines[i] ?? '')) {
      console.error(`[gerar-indice-manifest] DRIFT na linha ${String(i + 1)}:`);
      console.error(`  esperado: ${genLines[i] ?? '<EOF>'}`);
      console.error(`  existente: ${exLines[i] ?? '<EOF>'}`);
      console.error('  Execute: node scripts/gerar-indice-manifest.cjs');
      process.exit(1);
    }
  }
  process.exit(1);
}


/**
 * Data do `last_update` do INDEX — derivada da FONTE, nunca do relogio de parede
 * (PATCH-FRESCOR-MANIFEST-INDEX-20260918, HB-015; mesma semantica deterministica do
 * `gerado:` do MANIFEST — emenda A1 / PROTOCOLO-CANONICAL §7).
 * Fallback (fonte sem `last_update` — fonte malformada, ja reprovada pelo `docs:check`):
 * data do ULTIMO COMMIT (`geradoEm()`), tambem sem relogio.
 */
function extractLastUpdate(manifestText) {
  const m = /last_update=(\d{4}-\d{2}-\d{2})/.exec(manifestText);
  if (m) return m[1];
  return geradoEm().slice(0, 10);
}

/** Extrai a version do meta: do manifesto (linha "meta: ... version=2.25 ..."). */
function extractVersion(manifestText) {
  const m = /version=(\S+)/.exec(manifestText);
  return m ? m[1] : 'unknown';
}


/**
 * --sync-db (opcional): grava manifesto + indice no espelho manifest_docs.
 * Resolve postgres a partir de backend/node_modules (root nao tem). Requer
 * DATABASE_URL no ambiente. Idempotente (CREATE TABLE IF NOT EXISTS).
 */
async function syncDb(manifestText, indexText) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[gerar-indice-manifest] --sync-db: DATABASE_URL ausente — espelho nao gravado.');
    process.exit(1);
  }
  let postgres;
  try {
    postgres = require(path.join(__dirname, '..', 'backend', 'node_modules', 'postgres'));
  } catch (err) {
    console.error(`[gerar-indice-manifest] --sync-db: driver postgres indisponivel (${err instanceof Error ? err.message : String(err)})`);
    process.exit(1);
  }
  const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS manifest_docs (
        id serial PRIMARY KEY,
        doc_key varchar UNIQUE NOT NULL,
        content text NOT NULL,
        version varchar NOT NULL,
        sha varchar NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `;
    const version = extractVersion(manifestText);
    const rows = [
      { docKey: 'manifest', content: manifestText, version, sha: sha1(manifestText) },
      { docKey: 'manifest_index', content: indexText, version, sha: sha1(indexText) },
    ];
    for (const row of rows) {
      await sql`
        INSERT INTO manifest_docs (doc_key, content, version, sha, updated_at)
        VALUES (${row.docKey}, ${row.content}, ${row.version}, ${row.sha}, now())
        ON CONFLICT (doc_key) DO UPDATE SET
          content = EXCLUDED.content,
          version = EXCLUDED.version,
          sha = EXCLUDED.sha,
          updated_at = now()
      `;
    }
    console.log(`[gerar-indice-manifest] --sync-db: espelho gravado (manifest + manifest_index, version ${version}).`);
  } catch (err) {
    console.error(`[gerar-indice-manifest] --sync-db falhou: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function sha1(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}


async function main() {
  if (HELP) {
    console.log('Uso: node scripts/gerar-indice-manifest.cjs [--check] [--sync-db] [--verbose]');
    console.log('  --check    anti-drift: compara com docs/AI-PROJECT-MANIFEST-INDEX.md (exit 1 em drift)');
    console.log('  --sync-db  grava manifesto + indice no espelho manifest_docs (requer DATABASE_URL)');
    console.log('  --verbose  exibe logs de progresso (padrao: silencioso)');
    process.exit(0);
  }

  let manifestText;
  try {
    manifestText = fs.readFileSync(MANIFEST_PATH, 'utf8');
  } catch (err) {
    console.error(`[gerar-indice-manifest] Erro lendo ${MANIFEST_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const indexText = buildIndex(manifestText);

  if (CHECK) {
    checkDrift(indexText);
    return; // unreachable — checkDrift faz exit
  }

  try {
    fs.writeFileSync(INDEX_PATH, indexText);
  } catch (err) {
    console.error(`[gerar-indice-manifest] Erro escrevendo ${INDEX_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const sections = parseSections(manifestText);
  log(`[gerar-indice-manifest] ${String(sections.length)} secoes → ${INDEX_PATH} (${String(Buffer.byteLength(indexText, 'utf8'))} bytes)`);

  if (SYNC_DB) {
    await syncDb(manifestText, indexText);
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[gerar-indice-manifest] Falha fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

module.exports = { parseSections, buildIndex, extractVersion, extractLastUpdate, HEADER_RE };
