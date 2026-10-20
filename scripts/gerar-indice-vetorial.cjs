// scripts/gerar-indice-vetorial.cjs
// FR-SEM-03: build script — orquestra chunking → embedding → storage.
// Incremental via fileHash (P2): re-embedda apenas chunks cujo fileHash do arquivo
// fonte mudou desde o último build.
//
// RECORTE DO CORPUS — P7 rev3 (2026-10-03, FR-P7REV3-SEM-01): visibilidade semântica
// DEFAULT-INCLUDE. O gerador percorre a ÁRVORE RASTREADA do repo (git ls-files — honra
// o .gitignore: node_modules/, dist/, .env, coverage/ nunca entram por construção) e
// indexa TODO arquivo de texto cuja extensão está em TXT_EXTS. A invisibilidade só
// existe por EXCLUSÃO DECLARADA na constante EXCLUSIONS (uma justificativa por glob),
// em três classes congeladas pelo veredito humano de 2026-10-03:
//   CLASS 1 SECRET       — env files/keys/credentials; o default de visibilidade NUNCA
//                          inverte o default de sigilo;
//   CLASS 2 DERIVED/ECHO — JSONs gerados (grafo, ledgers, rastreabilidade), o próprio
//                          índice (json/bin), dist/, execucao/logs*, execucao/evidencias/
//                          (indexar derivativos degrada a recuperação — eco ≠ fonte);
//   CLASS 3 DELIBERATE   — LILA-DEV/Canonical/ (camada humana de auditoria PT,
//                          preservada do P7 rev2) e LILA-DEV/historico/ (recuperação
//                          episódica servida pelo arquivo L5).
// A lista de exclusões (classe + glob + justificativa) é publicada no sidecar (campo
// `exclusoes`) — o contrato de cobertura chega a toda sessão que consome o índice.
// Rev2 (2026-10-01) era o INVERSO (listas de INCLUSÃO); a decisão que a cassava,
// FR-MIG-3-SEM-10.D1, está em tombstone desde o Stage 1 deste frame.
//
// Storage SIDECAR: indice-vetorial.json (metadados + offsets + exclusoes) +
// indice-vetorial.bin (Float32Array binário, Git LFS via .gitattributes).
// DECISÃO DO ORQUESTRADOR (P1 — seções markdown gigantes): subdivisão por linha,
// texto integral, SEM resumo e SEM truncamento. Cap conservador de 8000 chars por
// chunk (limite do modelo = 8191 tokens ≈ 32KB; margem de segurança 4x). ExportName
// paginado [N/M] preserva rastreabilidade. Nunca perde conteúdo (lastro > custo).

const VERBOSE = process.argv.includes("--verbose");
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Uso: node scripts/gerar-indice-vetorial.cjs [--verbose]");
  console.log("  --verbose  exibe logs de progresso (padrao: silencioso)");
  process.exit(0);
}

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { chunkFile, chunkMarkdown } = require("./lib/chunking.cjs");
const { embedBatch } = require("./lib/embedding-client.cjs");
const { fileHash } = require("./lib/file-hash.cjs");

const DEFAULT_INDEX_JSON = path.join(__dirname, "..", "indice-vetorial.json");
const DEFAULT_INDEX_BIN = path.join(__dirname, "..", "indice-vetorial.bin");
const ATTRS_FILE = path.join(__dirname, "..", ".gitattributes");

// Env de teste (mesmo padrão de VETORIAL_INDEX_* do buscar-vetorial.cjs): sobrepõe
// os caminhos dos índices sem tocar os reais — usado pelos testes com temp-dir.
function indexJsonPath() {
  return process.env.VETORIAL_INDEX_JSON || DEFAULT_INDEX_JSON;
}
function indexBinPath() {
  return process.env.VETORIAL_INDEX_BIN || DEFAULT_INDEX_BIN;
}

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const DIMENSIONS = 1536;
const BATCH_SIZE = 64;
const MAX_SAFE_CHARS = 8000;

// Portabilidade do sidecar (PATCH-OTIMIZACAO-CI-ONDA3-20260906): chunk.path é
// gravado RELATIVO à raiz do repo (separador "/") — o sidecar antes guardava
// caminhos absolutos da máquina de geração (ex.: C:\LilaV2\...) e o
// verificar-frescor-indice-vetorial falhava no runner ubuntu-latest (arquivos
// "ausentes"). rel() converte no fim do buildChunks; leitura/hash usam o
// caminho absoluto original durante a extração.
const ROOT = path.resolve(__dirname, "..");
function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

// ── Recorte do corpus (P7 rev3 — default-include + exclusões declaradas) ──────
// Allowlist de extensões de TEXTO indexáveis. O que não está aqui não vira chunk
// (binários, .json/.bin do próprio índice, dotfiles sem extensão, lockfiles…).
const TXT_EXTS = new Set([
  ".md", ".ts", ".tsx", ".cjs", ".js", ".mjs", ".py", ".yaml", ".yml", ".ps1", ".sh", ".sql",
]);
// Extensões com parser real (TypeScript Compiler API). As demais usam chunk de
// arquivo inteiro (paginado por splitLongChunk) — sem parser novo.
const TS_EXTS = new Set([".ts", ".tsx"]);

// EXCLUSIONS — lista FECHADA e declarada (P7 rev3, FR-P7REV3-SEM-01.D3). Uma
// justificativa por glob; a lista inteira é publicada no sidecar (`exclusoes`).
// Classes congeladas pelo veredito humano de 2026-10-03. Adicionar um glob exige
// novo veredito — não inventar exclusão fora destas três classes.
//
// NOTA (Stage 2): o CONTEXT do frame citava "a lista SECRETOS vigente (seed de
// lerModos em scripts/buscar-vetorial.cjs)". Essa lista NÃO existe no repo (nem
// `lerModos`); CLASS 1 foi semeada a partir da descrição da classe e dos padrões de
// segredo já declarados em .gitignore/.clineignore/.gitleaks.toml (env, chaves,
// credenciais) — OPEN POINT para confirmação de Igor sobre o conjunto exato de globs.
//
// OPEN POINT RESOLVIDO (aposentadoria do CHANGELOG — evento deliberado Igor
// 2026-10-05, executada 2026-10-06): o CHANGELOG.md e a família do índice
// mecânico changelog-block/v1 saíram do repositório; o glob fica como exclusão
// defensiva sob CLASS 2 (qualquer ressurreição de derivado não volta ao corpus).
const EXCLUSIONS = [
  // CLASS 1 — SECRET (absoluta: a visibilidade default-include NUNCA inverte o sigilo)
  { classe: "SECRET", glob: "**/.env", justificativa: "arquivo .env — segredos/credenciais de ambiente" },
  { classe: "SECRET", glob: "**/.env.*", justificativa: "variante de .env (.local/.production/.test) — segredos/credenciais de ambiente" },
  { classe: "SECRET", glob: "**/.npmrc", justificativa: "config do npm — pode conter token de registry (credencial)" },
  { classe: "SECRET", glob: "**/*.pem", justificativa: "material de chave privada / certificado (chave)" },
  { classe: "SECRET", glob: "**/*.key", justificativa: "material de chave privada (chave)" },
  { classe: "SECRET", glob: "**/*.p12", justificativa: "keystore PKCS#12 — bundle de credencial (chave)" },
  { classe: "SECRET", glob: "**/*.pfx", justificativa: "keystore PKCS#12 — bundle de credencial (chave)" },
  { classe: "SECRET", glob: "**/id_rsa*", justificativa: "chave privada SSH (chave)" },
  { classe: "SECRET", glob: "**/id_ed25519*", justificativa: "chave privada SSH (chave)" },
  { classe: "SECRET", glob: "**/*credential*.json", justificativa: "bundle de credencial (credencial)" },
  // CLASS 2 — DERIVED/ECHO (indexar derivativo degrada a recuperação: eco passando por fonte)
  { classe: "DERIVED/ECHO", glob: "CHANGELOG.md", justificativa: "aposentado 2026-10-06 (evento deliberado Igor 2026-10-05) — derivado sem consumidor; glob defensivo contra ressurreição" },
  { classe: "DERIVED/ECHO", glob: "indice-vetorial.json", justificativa: "o próprio sidecar do índice — eco do corpus" },
  { classe: "DERIVED/ECHO", glob: "indice-vetorial.bin", justificativa: "o próprio binário do índice — eco do corpus" },
  { classe: "DERIVED/ECHO", glob: "LILA-DEV/indice-rastreabilidade.json", justificativa: "índice gerado (rastreabilidade nó→snapshot) — derivado" },
  { classe: "DERIVED/ECHO", glob: "LILA-DEV/planejamento/grafo.json", justificativa: "grafo gerado — derivado de alto churn" },
  { classe: "DERIVED/ECHO", glob: "LILA-DEV/planejamento/decisoes-ledger.json", justificativa: "ledger gerado — derivado de alto churn" },
  { classe: "DERIVED/ECHO", glob: "**/dist/**", justificativa: "saída de build — derivado" },
  { classe: "DERIVED/ECHO", glob: "LILA-DEV/execucao/logs*/**", justificativa: "logs de execução E3 (ativos + arquivados) — registro derivado/verboso" },
  { classe: "DERIVED/ECHO", glob: "LILA-DEV/execucao/evidencias/**", justificativa: "evidências de gate — artefato derivado/efêmero" },
  { classe: "DERIVED/ECHO", glob: "backend/reports/**", justificativa: "relatórios de experimentos de recall (semantic-recall-*) ecoam o vocabulário das próprias queries testadas — eco passando por fonte, polui o top-5 (evidência PR #1065: 4/23 queries perdendo alvo funcional)" },
  // CLASS 3 — DELIBERATE (decisão preservada, não derivado)
  { classe: "DELIBERATE", glob: "LILA-DEV/Canonical/**", justificativa: "camada humana de auditoria PT (constituição) — decisão preservada do P7 rev2 §7" },
  { classe: "DELIBERATE", glob: "LILA-DEV/historico/**", justificativa: "recuperação episódica já servida pelo arquivo L5; transcrições longas poluiriam o top-5" },
];

/** Escapa metacaracteres de regex dentro de um segmento de glob. Pura. */
function escRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Um segmento de glob (com `*`) casa um único segmento de path. Pura. */
function segmentMatches(seg, name) {
  if (!seg.includes("*")) return seg === name;
  const re = new RegExp("^" + seg.split("*").map(escRegex).join("[^/]*") + "$");
  return re.test(name);
}

/**
 * Casamento de glob de path relativo à raiz (separador "/"). Pura.
 * `**` casa ZERO ou mais segmentos; `*` casa dentro de um segmento (nunca cruza "/").
 * Casos: `a/**` casa `a/b` e `a/b/c`; glob iniciado por `**` casa o nome na raiz e em qualquer subpasta.
 */
function globMatches(glob, relPath) {
  const g = String(glob).split("/");
  const parts = String(relPath).split("/");
  const rec = (gi, pi) => {
    if (gi === g.length) return pi === parts.length;
    const seg = g[gi];
    if (seg === "**") {
      for (let k = pi; k <= parts.length; k++) {
        if (rec(gi + 1, k)) return true;
      }
      return false;
    }
    if (pi >= parts.length) return false;
    if (!segmentMatches(seg, parts[pi])) return false;
    return rec(gi + 1, pi + 1);
  };
  return rec(0, 0);
}

/** Um path relativo é excluído do corpus? Pura. */
function isExcluded(relPath) {
  return EXCLUSIONS.some((e) => globMatches(e.glob, relPath));
}

/**
 * Arquivos RASTREADOS pelo git (repo-real), relativos à raiz com separador "/".
 * Por construção honra o .gitignore (node_modules/, dist/, .env, coverage/…) — o
 * recorte "repo inteiro" é o REPO versionado, nunca dependências/build locais.
 */
function listTrackedFiles() {
  const raw = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return raw
    .split("\0")
    .filter(Boolean)
    .map((f) => String(f).replace(/\\/g, "/"));
}

/** Chunk de arquivo inteiro (fallback p/ extensões sem parser). Paginado a jusante. Pura. */
function wholeFileChunk(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  const content = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (content.length === 0) return [];
  return [{ path: absPath, exportName: path.basename(absPath), content, startLine: 1 }];
}

/**
 * Chunks de um arquivo conforme a extensão: markdown por header, TS/TSX por export
 * (Compiler API); qualquer outra extensão — ou parser que devolve 0 chunks (ex.: .cjs
 * CommonJS, .tsx sem exports) — cai no chunk de ARQUIVO INTEIRO. Nunca perde conteúdo.
 * Aplica o fileHash do arquivo + splitLongChunk. Pura (I/O de leitura).
 */
function chunksOfFile(absPath, relPath) {
  const ext = path.extname(relPath).toLowerCase();
  const hash = fileHash(absPath);
  let parts;
  if (ext === ".md") parts = chunkMarkdown(absPath);
  else if (TS_EXTS.has(ext)) parts = chunkFile(absPath);
  else parts = [];
  if (!parts || parts.length === 0) parts = wholeFileChunk(absPath);
  return parts.flatMap((c) => splitLongChunk({ ...c, fileHash: hash }));
}

// fileHash() vive em scripts/lib/file-hash.cjs (single-source SP-INDICES-VETORIAL-01);
// este módulo consome via require acima — sem duplicação local.

function loadEnvironment() {
  if (process.env.OPENROUTER_API_KEY) {
    return;
  }
  const envFile = path.join(__dirname, "..", "backend", ".env");
  if (!fs.existsSync(envFile)) {
    return;
  }
  // Parse manual do backend/.env (formato KEY=value) — sem dependência nova de dotenv
  const raw = fs.readFileSync(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Subdivide um chunk cujo conteúdo excede MAX_SAFE_CHARS.
 * Corte APENAS em quebra de linha (nunca corta palavra no meio); texto integral
 * preservado (sem resumo, sem truncamento). Cada parte herda path/startLine/fileHash;
 * exportName ganha sufixo paginado "[i/N]".
 *
 * @param {{path:string, exportName:string, content:string, startLine:number, fileHash:string}} chunk
 * @returns {Array<object>} um ou mais chunks com content <= MAX_SAFE_CHARS
 */
function splitLongChunk(chunk) {
  if (chunk.content.length <= MAX_SAFE_CHARS) {
    return [chunk];
  }

  const lines = chunk.content.split(/\r?\n/);
  const parts = [];
  let currentLines = [];
  let currentLen = 0;

  for (const line of lines) {
    const lineLen = line.length + 1; // +1 nova linha
    if (currentLen + lineLen > MAX_SAFE_CHARS && currentLines.length > 0) {
      parts.push({ ...chunk, content: currentLines.join("\n") });
      currentLines = [line];
      currentLen = lineLen;
    } else {
      currentLines.push(line);
      currentLen += lineLen;
    }
  }
  if (currentLines.length > 0) {
    parts.push({ ...chunk, content: currentLines.join("\n") });
  }

  // Guarda contra linha individual > MAX_SAFE_CHARS (corte duro por blocos, raríssimo)
  const finalParts = [];
  for (const part of parts) {
    if (part.content.length <= MAX_SAFE_CHARS) {
      finalParts.push(part);
      continue;
    }
    for (let i = 0; i < part.content.length; i += MAX_SAFE_CHARS) {
      finalParts.push({ ...part, content: part.content.slice(i, i + MAX_SAFE_CHARS) });
    }
  }

  const total = finalParts.length;
  return finalParts.map((part, idx) => ({
    ...part,
    exportName: total > 1 ? `${chunk.exportName} [${idx + 1}/${total}]` : chunk.exportName,
  }));
}

/**
 * Gera chunks do corpus (P7 rev3 — default-include: árvore rastreada filtrada pela
 * allowlist TXT_EXTS, menos os globs de EXCLUSIONS; ver header) com fileHash,
 * normalizados pela subdivisão segura (splitLongChunk). Ordem determinística
 * (git ls-files é ordenado).
 * @returns {Array<{path:string, exportName:string, content:string, startLine:number, fileHash:string}>}
 */
function buildChunks() {
  const chunks = [];
  for (const relPath of listTrackedFiles()) {
    const ext = path.extname(relPath).toLowerCase();
    if (!TXT_EXTS.has(ext)) continue; // fora da allowlist (binário, .json/.bin, dotfile…)
    if (isExcluded(relPath)) continue; // exclusão declarada (3 classes)
    const abs = path.join(ROOT, ...relPath.split("/"));
    if (!fs.existsSync(abs)) continue; // rastreado mas ausente no disco (deletado)
    chunks.push(...chunksOfFile(abs, relPath));
  }
  // Paths relativos à raiz (portabilidade cross-OS do sidecar — ver topo)
  for (const c of chunks) c.path = rel(c.path);
  return chunks;
}

async function main() {
  loadEnvironment();
  const chunks = buildChunks();
  if (VERBOSE) console.log(`Chunks: ${chunks.length}`);

  const INDEX_JSON = indexJsonPath();
  const INDEX_BIN = indexBinPath();

  // Índice anterior (incremental P2)
  let prevByKey = new Map();
  if (fs.existsSync(INDEX_JSON)) {
    try {
      const prev = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
      if (prev && Array.isArray(prev.chunks)) {
        for (const c of prev.chunks) {
          prevByKey.set(`${c.path}|${c.exportName}`, c);
        }
      }
    } catch {
      prevByKey = new Map();
    }
  }

  // Separa: reutilizáveis (hash inalterado) vs novos (precisam embedding)
  const newChunks = [];
  for (const c of chunks) {
    const key = `${c.path}|${c.exportName}`;
    const prev = prevByKey.get(key);
    if (prev && prev.fileHash === c.fileHash && typeof prev.offset === "number" && typeof prev.length === "number") {
      // reutilizável — nada a embeddar
    } else {
      newChunks.push(c);
    }
  }
  if (VERBOSE) console.log(`Reutilizados: ${chunks.length - newChunks.length} | Para embeddar: ${newChunks.length}`);

  // Embedda novos chunks (em batches)
  const newVectorByKey = new Map();
  for (let i = 0; i < newChunks.length; i += BATCH_SIZE) {
    const slice = newChunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(slice.map((c) => c.content));
    for (let j = 0; j < slice.length; j++) {
      newVectorByKey.set(`${slice[j].path}|${slice[j].exportName}`, vectors[j]);
    }
  }

  // Resolve vetor de cada chunk em ordem (leitura do .bin anterior p/ reutilizados)
  let oldBin = null;
  if (fs.existsSync(INDEX_BIN)) {
    oldBin = fs.readFileSync(INDEX_BIN);
  }

  const floats = [];
  const sidecarChunks = [];
  for (const c of chunks) {
    const key = `${c.path}|${c.exportName}`;
    const prev = prevByKey.get(key);
    let vector;
    if (prev && prev.fileHash === c.fileHash && typeof prev.offset === "number" && typeof prev.length === "number") {
      if (!oldBin) throw new Error(`Índice anterior sem .bin para reutilizar (${key})`);
      const startByte = prev.offset * 4;
      const endByte = startByte + prev.length * 4;
      if (endByte > oldBin.length) throw new Error(`.bin anterior truncado (${key})`);
      vector = Array.from(new Float32Array(oldBin.buffer, startByte, prev.length));
    } else {
      vector = newVectorByKey.get(key);
      if (!vector) throw new Error(`Vetor ausente para ${key}`);
    }
    const offset = floats.length;
    floats.push(...vector);
    sidecarChunks.push({
      path: c.path,
      exportName: c.exportName,
      content: c.content,
      startLine: c.startLine,
      fileHash: c.fileHash,
      offset,
      length: vector.length,
    });
  }

  const bin = new Float32Array(floats);
  fs.writeFileSync(INDEX_BIN, bin);
  const sidecar = {
    version: 1,
    model: EMBEDDING_MODEL,
    dimensions: DIMENSIONS,
    // EXCEÇÃO à política skip-write de timestamp (fim do churn, 2026-10-06): o
    // `generatedAt` é relógio SEMÂNTICO — único consumidor de idade/frescor
    // (buscar-vetorial.cjs: "índice construído em X; N arquivos mudaram desde
    // então"). O par sidecar+bin é reescrito integralmente a cada mudança real
    // (fileHash incremental), então a linha não acrescenta superfície de conflito.
    generatedAt: new Date().toISOString(),
    // Contrato de cobertura (P7 rev3): lista declarada classe+glob+justificativa.
    // Campo ADITIVO — consumidores existentes leem só `chunks`.
    exclusoes: EXCLUSIONS,
    chunks: sidecarChunks,
  };
  fs.writeFileSync(INDEX_JSON, JSON.stringify(sidecar, null, 2));

  // Garante .gitattributes para Git LFS (FR-SEM-03)
  let attrs = "";
  if (fs.existsSync(ATTRS_FILE)) {
    attrs = fs.readFileSync(ATTRS_FILE, "utf8");
  }
  if (!attrs.includes("indice-vetorial.bin")) {
    const line = "indice-vetorial.bin filter=lfs diff=lfs merge=lfs -text";
    attrs = (attrs.length > 0 && !attrs.endsWith("\n") ? attrs + "\n" : attrs) + line + "\n";
    fs.writeFileSync(ATTRS_FILE, attrs);
  }

  console.log(`OK: ${sidecarChunks.length} chunks | ${bin.byteLength} bytes no .bin | sidecar ${Math.round(fs.statSync(INDEX_JSON).size / 1024)}KB`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("ERRO:", err.message);
    process.exit(1);
  });
}

module.exports = { main, buildChunks, fileHash, EXCLUSIONS, TXT_EXTS, globMatches, isExcluded };
