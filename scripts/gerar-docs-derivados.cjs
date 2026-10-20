#!/usr/bin/env node
/**
 * scripts/gerar-docs-derivados.cjs
 * FRAME-DOCS-MECANIZACAO-P1a-20261002 -- transporte generalizado fonte->derivado (P1a).
 *
 * PAPEL: gerador UNICO dos docs derivados registrados -- le o registry
 *   scripts/docs-pairs.registry.json e regenera TODOS os pares registrados.
 * FONTE: o registry (transporte) + as fontes declaradas por par (medicao
 *   `wc -l -c`, listagem de filesystem, header de cada script,
 *   package.json#scripts, dead-list declarada em LILA-DEV/INDICES.md).
 * SAIDA: stdout (relatorio) | exit 0 fresco/aplicado | exit 1 stale (--check) | exit 2 erro.
 *
 * CONTRATO DO REGISTRY (array de pares; schema versionado aqui):
 *   [{ id, kind: "module"|"block", module?, derived_paths?|derived_path?,
 *      derived_block_marker?: {begin,end}, sources: [{type, path_or_cmd, ...}],
 *      formula?, checker_rule, generator, regen_cmd }]
 *
 * CONTRATO DO BLOCO (kind=block): o conteudo gerado vive ENTRE os marcadores
 *   <!-- GENERATED: <id> DO NOT EDIT — source: ... -->  ...  <!-- /GENERATED: <id> -->
 *   O gerador toca SOMENTE essa faixa; o resto do arquivo e preservado byte a
 *   byte. Marcador ausente = fail-closed (exit 2) -- nunca insercao inferida.
 *
 * PROPRIEDADES: DETERMINISTICO (sem timestamp, sem locale -- mesmo tree => mesmos
 *   bytes) e IDEMPOTENTE (escreve apenas quando o conteudo muda).
 *
 * USO:
 *   node scripts/gerar-docs-derivados.cjs                 # regenera todos os pares
 *   node scripts/gerar-docs-derivados.cjs --check         # exit 1 se algum par stale
 *   node scripts/gerar-docs-derivados.cjs --dry-run       # nao escreve; lista o que mudaria
 *   node scripts/gerar-docs-derivados.cjs --pair <id>     # apenas um par
 *   node scripts/gerar-docs-derivados.cjs --list          # pares registrados
 *   node scripts/gerar-docs-derivados.cjs --live          # numeros vivos (stdout; nao escreve)
 *   node scripts/gerar-docs-derivados.cjs --json          # relatorio JSON
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process"); // REPARO 5d: medicao do blob do COMMIT

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(__dirname, "docs-pairs.registry.json");

const norm = (t) => String(t).replace(/\r\n/g, "\n");
const linhas = (t) => norm(t).split("\n");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const agrupar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : (b / 1024).toFixed(1) + " KB");
const fmtMb = (b) => (b / 1048576).toFixed(1) + "MB";
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cel = (s) => String(s).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");

const CAMPOS_OBRIGATORIOS = ["id", "kind", "checker_rule", "generator", "regen_cmd"];

/** Registry (array de pares) + validacao eager do schema. Pura. */
function carregarRegistry(registryPath) {
  const p = registryPath || REGISTRY_PATH;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { throw new Error("registry ilegivel (" + rel(p) + "): " + e.message, { cause: e }); }
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("registry deve ser array nao-vazio de pares");
  const ids = new Set();
  for (const par of raw) {
    if (!par || typeof par !== "object" || Array.isArray(par)) throw new Error("par invalido (nao-objeto) no registry");
    for (const k of CAMPOS_OBRIGATORIOS) if (!par[k]) throw new Error("par sem campo obrigatorio '" + k + "': " + JSON.stringify(par).slice(0, 90));
    if (par.kind !== "module" && par.kind !== "block") throw new Error("kind invalido em '" + par.id + "': " + par.kind);
    if (par.kind === "module" && (!Array.isArray(par.derived_paths) || par.derived_paths.length === 0)) throw new Error("kind=module exige derived_paths[] em '" + par.id + "'");
    if (par.kind === "block") {
      if (!par.derived_path) throw new Error("kind=block exige derived_path em '" + par.id + "'");
      const multi = Array.isArray(par.derived_block_markers) && par.derived_block_markers.length > 0;
      const bks = multi ? par.derived_block_markers : [par.derived_block_marker];
      if (!multi && (!par.derived_block_marker || !par.derived_block_marker.begin || !par.derived_block_marker.end)) {
        throw new Error("kind=block exige derived_block_marker{begin,end} ou derived_block_markers[] em '" + par.id + "'");
      }
      for (const b of bks) {
        if (multi && !b.key) throw new Error("derived_block_markers exige 'key' em todo bloco de '" + par.id + "'");
        if (!b.begin || !b.end) throw new Error("bloco sem begin/end em '" + par.id + "'" + (multi ? " (key " + b.key + ")" : ""));
        if (linhas(b.begin).length !== 1 || linhas(b.end).length !== 1) throw new Error("marcadores devem ser linha unica em '" + par.id + "'" + (multi ? " (key " + b.key + ")" : ""));
      }
      if (multi && new Set(bks.map((b) => b.key)).size !== bks.length) throw new Error("blocos com key duplicada em '" + par.id + "'");
    }
    if (!Array.isArray(par.sources) || par.sources.length === 0) throw new Error("par sem sources[] em '" + par.id + "'");
    for (const s of par.sources) if (!s.type || !s.path_or_cmd) throw new Error("source sem {type,path_or_cmd} em '" + par.id + "'");
    if (ids.has(par.id)) throw new Error("id duplicado no registry: " + par.id);
    ids.add(par.id);
  }
  return raw;
}

/** Prefixo do ponteiro LFS — presente em TODO clone (smudged ou nao). */
const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

/**
 * Medicao deterministica: bytes (`wc -c`) + linhas (`wc -l` = contagem de NEWLINE). Pura.
 * REPARO ETAPA 5b (FRAME-DOCS-MECANIZACAO-P1a-20261002): a medicao e funcao do ESTADO DO
 * REPO, nunca do estado de smudge. Se o conteudo for um PONTEIRO LFS, os bytes vem do
 * proprio campo `size N` do ponteiro (presente em qualquer clone) — o tamanho on-disk
 * seria o do ponteiro (~134 B) num runner SEM smudge e o do binario real (~39 MB) numa
 * maquina smudged, e o gate quebraria por construcao (defeito real observado no CI do
 * PR #1031). `base` existe para teste (fixtures fora do repo).
 */
/** Conteudo do blob do COMMIT (base git) | null quando fora de repo/ausente. Pura. */
function blobDoCommit(relPath, base) {
  try {
    // `cat-file blob` (e NAO `show`) para leitura IMUNE A FILTROS: `git show
    // HEAD:<path>` aplica o smudge do LFS em ambientes com o filtro ativo
    // (runner do CI com `lfs: true`), devolvendo o BINARIO REAL no lugar do
    // ponteiro — a medicao entao caia no ramo "normaliza + conta bytes" sobre
    // conteudo binario e divergia do render (docs-einv-frescor/pr-gate
    // reprovavam com PROTOCOLO-INDICES "stale" sem fonte alterada). Com
    // cat-file o conteudo e o BLOB PURO em qualquer ambiente: arquivo sob LFS
    // devolve o ponteiro, como declara a formula da regra 3.
    return execFileSync("git", ["-C", base, "cat-file", "blob", "HEAD:" + relPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/**
 * Medicao deterministica — funcao do ESTADO DO REPO, nunca do ambiente de checkout:
 *   1. conteudo vem do BLOB DO COMMIT quando disponivel (imune a CRLF do checkout e a
 *      drift local do objeto LFS); cai no disco apenas fora de repo git (fixtures/testes);
 *   2. blob sob LFS (ponteiro) => bytes do campo `size`, sem contagem de linhas;
 *   3. demais arquivos => bytes/linhas do conteudo NORMALIZADO (LF).
 */
function medir(relPath, base = ROOT) {
  const doCommit = blobDoCommit(relPath, base);
  const texto = doCommit !== null ? doCommit : fs.readFileSync(path.join(base, relPath)).toString("utf8");
  if (texto.startsWith(LFS_POINTER_PREFIX)) {
    const m = /^size (\d+)\r?$/m.exec(texto);
    if (!m) throw new Error("ponteiro LFS sem campo 'size' em " + relPath);
    return { bytes: Number(m[1]), lines: 0, lfs: true };
  }
  const textoNorm = norm(texto);
  return { bytes: Buffer.byteLength(textoNorm, "utf8"), lines: textoNorm.split("\n").length - 1, lfs: false };
}

/** Leitura tolerante: texto do arquivo ou null quando ausente (sem atribuicao inutil). Pura. */
function lerTexto(abs) {
  try { return fs.readFileSync(abs, "utf8"); } catch { return null; }
}

/** Substitui a faixa entre marcadores (inclusive) pelo corpo novo. Pura. */
function substituirBloco(texto, begin, end, corpo) {
  const L = linhas(texto);
  const i = L.indexOf(begin);
  const j = L.indexOf(end);
  if (i < 0) throw new Error("marcador BEGIN ausente: " + begin);
  if (j < 0) throw new Error("marcador END ausente: " + end);
  if (j < i) throw new Error("marcador END antes do BEGIN");
  return L.slice(0, i).concat([begin], linhas(corpo), [end], L.slice(j + 1)).join("\n");
}

/** Corpo comitado da faixa (sem os marcadores) | null se a faixa nao existe. Pura. */
function extrairBloco(texto, begin, end) {
  const L = linhas(texto);
  const i = L.indexOf(begin);
  const j = L.indexOf(end);
  if (i < 0 || j < 0 || j < i) return null;
  return L.slice(i + 1, j).join("\n");
}

/** Normalizacao de comparacao: CRLF, espaco final e bordas vazias. Pura. */
function normalizarBloco(t) {
  const L = linhas(t);
  while (L.length && L[0].trim() === "") L.shift();
  while (L.length && L[L.length - 1].trim() === "") L.pop();
  return L.map((l) => l.replace(/[ \t]+$/, "")).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// P1.6 — LILA-DEV/PROTOCOLO-INDICES.md (RULE 3: tabela de consumo + tamanhos)
// FONTE UNICA dos numeros: medicao do proprio tree no regen. Sem carimbo manual.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fontes medidas do RULE 3 (paths relativos ao ROOT). Binary = sem `wc -l`.
 *
 * `LILA-DEV/planejamento/grafo.json` NAO entra (removido 2026-10-11): e arquivo
 * QUENTE — toda PR mergeada no main reescreve o grafo, entao qualquer PR em voo
 * media um grafo diferente do que o merge-ref do CI resolve e o par virava
 * `stale` sem nenhuma fonte autoral ter mudado (a corrida reprovou PRs legitimos
 * em serie: docs-einv-frescor + pr-gate + gates-grafo). O grafo e fonte de
 * CONSUMO (a nota do bloco reproduz a regra de paginacao/script), nao fonte de
 * MEDICAO — o "Typical size" que o par existe para publicar continua inteiro
 * para os tres indices (rastreabilidade + vetorial sidecar/bin).
 */
const RULE3_FONTES = {
  rastreabilidade: "LILA-DEV/indice-rastreabilidade.json",
  vetorialJson: "indice-vetorial.json",
  vetorialBin: "indice-vetorial.bin",
};

/** Corpo do bloco RULE 3 — prosa preservada byte a byte; so os tamanhos sao gerados. Pura. */
function renderRule3() {
  const m = {};
  for (const [k, p] of Object.entries(RULE3_FONTES)) m[k] = medir(p);
  const cel2 = (x) => fmtBytes(x.bytes) + " / " + agrupar(x.lines) + " lines";
  return [
    "| Index | How to consume | Typical size |",
    "|--------|--------------|----------------|",
    "| `LILA-DEV/indice-rastreabilidade.json` | **never single read** — `grep`/`outline`/pagination (`start_line`/`end_line`) mandatory | " + cel2(m.rastreabilidade) + " |",
    "| `indice-vetorial.json` | direct `read_file` for metadata only ({version, model, dimensions, generatedAt, chunksLength}); never the full content (" + fmtMb(m.vetorialJson.bytes) + "+ — paginate/avoid) | " + cel2(m.vetorialJson) + " |",
    "| `indice-vetorial.bin` | **never** `read_file` — LFS binary; query only via `node scripts/buscar-vetorial.cjs` | binary (" + fmtBytes(m.vetorialBin.bytes) + ") |",
    "",
    "**REANC-L4 / I1+I3+I4 (2026-09-20):** `indice-reverso/*.json` (with `buscar-simbolo.cjs`), LILA-DEV/matriz-cobertura-decisoes.json and LILA-DEV/indice-testes.json **no longer exist** (removidos 2026-09-26 — higiene de morte) — they left the active surface with their generators and gates. Literal lookup = native grep; coverage = rastreabilidade; test discovery = the runner.",
    "",
    "**COLLISION LINE (P4):** **literal** lookup (native grep over the tree — former reverse/`buscar-simbolo.cjs`) ≠ `indice-vetorial.json`/`indice-vetorial.bin` + `buscar-vetorial.cjs` (**semantic** by embedding). Distinct concepts — do not confuse; only the semantic use remains indexed.",
    "",
    "Criterion: direct read (`read_file` in full) ONLY if the file has <= 1,000 lines **AND** <= 100 KB. Above either limit: `grep`/`outline`/pagination (`start_line`/`end_line`) or a lookup script — never a single read. The sizes in the table above are **GENERATED** from measurement at regen time — never hand-edited (marker above).",
    "",
    "**Explicit graph consumption note (INDICES-TESTES 2026-09-02; revisao 2026-10-11):** `LILA-DEV/planejamento/grafo.json` (source, not generated — tamanho NAO medido aqui: e arquivo quente, reescrito a cada merge, e medir-lo tornava este par instavel entre o branch e o merge-ref do CI) is consumed ONLY via outline/pagination (`start_line`/`end_line`) or script (`grep` by KF/FR, `lila-grafo-mcp` `read_node`) — **full read forbidden** (§3 limit: <= 1,000 lines AND <= 100 KB).",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// P1.5 — scripts/README.md (inventario: alive = filesystem_present - dead_listed)
// ─────────────────────────────────────────────────────────────────────────────

const RE_MORTE = /morreu|morreram|morto|mortos|sa[ií]ram da superf|no longer exist|removidos/i;

/** Resolve a secao do dead-list por grep da ancoragem declarada. Le o FS; deterministica. */
function resolverDeadList(src) {
  const candidatos = [src.path].concat(src.fallback_paths || []).filter(Boolean);
  const achados = [];
  for (const c of candidatos) {
    const abs = path.join(ROOT, c);
    if (!fs.existsSync(abs)) continue;
    const i = linhas(fs.readFileSync(abs, "utf8")).findIndex((l) => l.includes(src.anchor));
    if (i >= 0) achados.push({ path: c, linha: i + 1 });
  }
  if (achados.length === 0) throw new Error("secao dead-list nao resolvida (ancora '" + src.anchor + "') em: " + candidatos.join(", "));
  const resolvido = achados[0];
  const texto = norm(fs.readFileSync(path.join(ROOT, resolvido.path), "utf8"));
  const reLit = new RegExp(src.literal_regex, "g");
  const literais = new Set();
  for (const l of linhas(texto)) {
    if (!RE_MORTE.test(l)) continue;
    reLit.lastIndex = 0;
    let x;
    while ((x = reLit.exec(l)) !== null) literais.add(x[1]);
  }
  const porAlias = [];
  for (const al of src.aliases || []) {
    if (!texto.includes(al.prose)) throw new Error("alias sem ancoragem textual no dead-list ('" + al.prose + "') em " + resolvido.path);
    porAlias.push(al.script);
  }
  return {
    resolvido: resolvido.path,
    linha: resolvido.linha,
    candidatos: achados,
    literais: Array.from(literais).sort(),
    porAlias: porAlias.slice().sort(),
    lista: Array.from(new Set(Array.from(literais).concat(porAlias))).sort(),
  };
}

/** Listagens do filesystem + mapa script -> npm run. Pura. */
function inventario() {
  const dir = path.join(ROOT, "scripts");
  const presentes = fs.readdirSync(dir).filter((f) => f.endsWith(".cjs") && fs.statSync(path.join(dir, f)).isFile()).sort();
  const sufixos = (sub, suf) => {
    const d = path.join(dir, sub);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => f.endsWith(suf) && fs.statSync(path.join(d, f)).isFile()).sort();
  };
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const npmDe = (nome) => {
    const re = new RegExp("scripts/" + escRe(nome) + "(?![\\w.-])");
    return Object.keys(pkg.scripts || {}).filter((k) => re.test(String(pkg.scripts[k]))).sort();
  };
  return { presentes, suites: sufixos("__tests__", ".test.cjs"), libs: sufixos("lib", ".cjs"), npmDe };
}

const RE_TAGS = /^[A-Z0-9][A-Z0-9\s/.,:;()—–-]*$/;
const RE_REF = /^(?:FRAME|EVENTO|PATCH|HB|AUD|KF|SP|FR|I)-?[A-Za-z0-9_-]*\s*(?:\([^)]*\))?\s*(?:--|—|–|:)\s*(.+)$/;

/**
 * Linhas do 1o bloco de comentario do script (ate 40 linhas), sem marcador.
 * Tolera ruido de prefixo REAL do repo: shebang, `"use strict";`, comentario
 * de uma linha (`/* eslint-disable *\/`) e linhas em branco antes do header.
 * Codigo antes de qualquer comentario => sem header (nao varre o arquivo). Pura.
 */
function coletarCabecalho(L) {
  const cab = [];
  let emBloco = false;
  let iniciado = false;
  for (let i = 0; i < Math.min(L.length, 40); i++) {
    const t = L[i].trim();
    if (!iniciado) {
      if (t === "" || t.startsWith("#!") || /^["']use strict["'];?$/.test(t) || /^\/\*.+\*\/$/.test(t)) continue;
      if (!t.startsWith("//") && !t.startsWith("/**")) break;
      iniciado = true;
    }
    if (!emBloco && t === "") break;
    if (!emBloco && t.startsWith("/**")) {
      emBloco = true;
      const r = t.slice(3).replace(/\*\/$/, "").trim();
      if (r) cab.push(r);
      continue;
    }
    if (emBloco) {
      if (t.startsWith("*/")) { emBloco = false; continue; }
      cab.push(t.replace(/^\*+\s?/, "").trim());
      continue;
    }
    if (t.startsWith("//")) { cab.push(t.replace(/^\/+\s?/, "").trim()); continue; }
    break;
  }
  return cab;
}

/** Proposito do header do script — nome-prefixo e linhas de tag removidos. Pura. */
function proposito(nome) {
  const cab = coletarCabecalho(linhas(fs.readFileSync(path.join(ROOT, "scripts", nome), "utf8")));
  const reNome = new RegExp("^(?:scripts/)?" + escRe(nome) + "\\s*(?:—|–|-|:|--)?\\s*");
  const util = [];
  for (const l of cab) {
    if (l === "") continue;
    const t = l.replace(reNome, "").trim();
    if (t === "") continue;
    const m = t.match(RE_REF);
    if (m) {
      const resto = m[1].trim();
      if (resto.length < 15 || RE_TAGS.test(resto)) continue; // linha so de referencia -> descartada
      util.push(resto);
      continue;
    }
    util.push(t);
  }
  const junto = util.join(" ").replace(/\s+/g, " ").trim();
  const mProp = junto.match(/Prop[oó]sito\s*:\s*([^]+)$/i) || junto.match(/Purpose\s*:\s*([^]+)$/i);
  const i = util.findIndex((l) => !RE_TAGS.test(l));
  let txt = mProp ? mProp[1] : i >= 0 ? util.slice(i).join(" ") : "";
  const mFim = txt.match(/^([^]{0,200}?[.;])(\s|$)/);
  if (mFim && mFim[1].length >= 6) txt = mFim[1];
  txt = cel(txt);
  return (txt.length > 180 ? txt.slice(0, 177).trim() + "..." : txt) || "(sem header)";
}


/** Corpo do bloco de inventario de scripts — subtracao do dead-list EXPLICITA. Pura. */
function renderScriptsReadme(par) {
  const src = (par.sources || []).find((s) => s.type === "deadlist");
  if (!src) throw new Error("par '" + par.id + "' sem source type=deadlist");
  const dl = resolverDeadList(src);
  const inv = inventario();
  const mortos = new Set(dl.lista);
  const vivos = inv.presentes.filter((f) => !mortos.has(f)); // alive = filesystem_present - dead_listed
  const colisao = inv.presentes.filter((f) => mortos.has(f)); // morto declarado ainda no fs = contradicao
  const listar = (a) => (a.length ? a.map((s) => "`" + s + "`").join(", ") : "(nenhum)");
  const linhasTab = vivos.map((f) => {
    const npms = inv.npmDe(f);
    return "| `" + f + "` | " + proposito(f) + " | " + (npms.length ? npms.map((n) => "`npm run " + n + "`").join(", ") : "—") + " |";
  });
  const corpo = [
    "### Inventário medido (gerado) — scripts vivos",
    "",
    "Topo (filesystem): **" + inv.presentes.length + "** `*.cjs`; dead-list declarada: **" + dl.lista.length + "**; interseção morto × filesystem: **" + colisao.length + "** → `alive = filesystem_present - dead_listed` = **" + vivos.length + " vivos**. Suítes: " + inv.suites.length + " `*.test.cjs` (em `__tests__/`); libs: " + inv.libs.length + " (em `lib/`).",
    "",
    "| Script (vivo) | Propósito (header do script) | npm |",
    "|---|---|---|",
  ].concat(linhasTab, [
    "",
    "**Subtraídos — declarados mortos, nunca listados como vivos:** " + listar(dl.lista) + ".",
    "",
    "Fonte do dead-list resolvida por grep: `" + dl.resolvido + "` (âncora `" + src.anchor + "`). Procedência dos nomes: literais no documento = " + listar(dl.literais) + "; aliases declarados no registry = " + listar(dl.porAlias) + ". Regen: `" + par.regen_cmd + "`.",
  ]);
  if (colisao.length) corpo.push("", "**COLISÃO (morto declarado ainda presente no filesystem — contradição INDICES.md × árvore):** " + listar(colisao) + ".");
  return corpo.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizacao de blocos de um par: 1 bloco (`derived_block_marker`) ou N blocos
// (`derived_block_markers[]`, cada um com `key` propria). Aditivo a P1a.
// ─────────────────────────────────────────────────────────────────────────────
function blocosDe(par) {
  if (Array.isArray(par.derived_block_markers) && par.derived_block_markers.length) {
    return par.derived_block_markers.map((b) => ({ key: b.key || par.id, begin: b.begin, end: b.end }));
  }
  const m = par.derived_block_marker;
  return [{ key: par.id, begin: m.begin, end: m.end }];
}

// ─────────────────────────────────────────────────────────────────────────────
// P1.1 — LILA-DEV/README-DEV-AI.md §4.X (áreas táticas)
// FONTES: grafo.json (campo `area_tatica`) + kf-fonte.yaml (areas_historicas +
// particionamento KF-area). Corrige o drift D4 (lista/contagem a mao).
// ─────────────────────────────────────────────────────────────────────────────

const AREAS_GRAFO = "LILA-DEV/planejamento/grafo.json";
const AREAS_KF_FONTE = "LILA-DEV/kf-fonte.yaml";

/** Le os 2 universos de area: ativas (grafo) + historicas/particionamento (kf-fonte). Pura. */
function areasTaticas() {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, AREAS_GRAFO), "utf8"));
  const cont = new Map();
  for (const col of ["keyframes", "sprints", "frames"]) {
    for (const n of g[col] || []) {
      if (!n || !n.area_tatica) continue;
      cont.set(n.area_tatica, (cont.get(n.area_tatica) || 0) + 1);
    }
  }
  const ativas = Array.from(cont.keys()).sort();
  const kf = norm(fs.readFileSync(path.join(ROOT, AREAS_KF_FONTE), "utf8"));
  const mHist = kf.match(/^\s*areas_historicas\s*:\s*"\[([^\]]+)\]/m);
  if (!mHist) throw new Error("kf-fonte.yaml: bloco congelamento.areas_historicas nao encontrado");
  const historicas = mHist[1].split(",").map((s) => s.trim()).filter(Boolean).sort();
  const slugsTodos = [...kf.matchAll(/^\s*-\s*slug:\s*(KF-[A-Z0-9-]+)\s*$/gm)].map((m) => m[1]);
  const corte = kf.indexOf("\nkfs_produto:");
  const slugsPadrao = corte < 0 ? slugsTodos : [...kf.slice(0, corte).matchAll(/^\s*-\s*slug:\s*(KF-[A-Z0-9-]+)\s*$/gm)].map((m) => m[1]);
  const slugsProduto = corte < 0 ? [] : [...kf.slice(corte).matchAll(/^\s*-\s*slug:\s*(KF-[A-Z0-9-]+)\s*$/gm)].map((m) => m[1]);
  const foraKebab = ativas.filter((a) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a));
  return { ativas, historicas, cont, slugsTodos, slugsPadrao, slugsProduto, foraKebab };
}

/** Corpo do bloco §4.X — contagem e lista MEDIDAS (nenhum numero a mao). Pura. */
function renderAreasTaticas() {
  const a = areasTaticas();
  const corpo = [
    "**Áreas táticas — MEDIDO no regen.** Fontes: `" + AREAS_GRAFO + "` (campo `area_tatica` dos nós de planejamento) + `" + AREAS_KF_FONTE + "` (`congelamento.areas_historicas`).",
    "",
    "**Ativas (" + a.ativas.length + "):** " + a.ativas.join(", ") + ".",
    "**Históricas (" + a.historicas.length + "):** " + a.historicas.join(", ") + ".",
    "**Total: " + (a.ativas.length + a.historicas.length) + "** (" + a.ativas.length + " ativas + " + a.historicas.length + " históricas).",
    "",
    "Particionamento KF-area sobre este mapa (`" + AREAS_KF_FONTE + "`): **" + a.slugsTodos.length + " slugs** (" + a.slugsPadrao.length + " framework + " + a.slugsProduto.length + " projeto) — projeção compilada em `LILA-DEV/kfs/` (`kf-compiler.cjs`).",
  ];
  if (a.foraKebab.length) {
    corpo.push("", "**Anomalia (reportada, não corrigida aqui):** " + a.foraKebab.length + " valor(es) de `area_tatica` fora do espaço kebab-case de área: " + a.foraKebab.map((s) => "`" + s + "`").join(", ") + ".");
  }
  return corpo.join("\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// P1.3 — docs/DEPLOY.md (3 blocos: env keys / workflows / railway). ZERO deps
// (o job assincrono roda sem `npm ci` — builtins apenas, por contrato).
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOY_ENV_FILES = [".env.example", "backend/.env.example"];
const DEPLOY_WF_DIR = ".github/workflows";
const DEPLOY_RAILWAY = ".railway/railway.ts";

/** Chaves de um .env.example (nunca valores): `KEY=` ativo ou `# KEY=` comentado. Pura. */
function lerEnvKeys(rel) {
  const out = new Map();
  for (const l of linhas(fs.readFileSync(path.join(ROOT, rel), "utf8"))) {
    const m = l.match(/^\s*(#\s*)?([A-Z][A-Z0-9_]{2,})\s*=/);
    if (!m) continue;
    const chave = m[2];
    const comentado = Boolean(m[1]);
    if (!out.has(chave) || (out.get(chave) === true && !comentado)) out.set(chave, comentado);
  }
  return out;
}

/** Corpo do bloco de env do DEPLOY (union ordenada das 2 fontes). Pura. */
function renderDeployEnv() {
  const porArquivo = DEPLOY_ENV_FILES.map((f) => [f, lerEnvKeys(f)]);
  const todas = Array.from(new Set(porArquivo.flatMap(([, m]) => Array.from(m.keys())))).sort();
  const celula = (m, k) => (!m.has(k) ? "—" : m.get(k) ? "comentada" : "ativa");
  const linhasTab = todas.map((k) => "| `" + k + "` | " + porArquivo.map(([, m]) => celula(m, k)).join(" | ") + " |");
  const resumo = porArquivo.map(([f, m]) => {
    const ativas = Array.from(m.values()).filter((c) => !c).length;
    return "`" + f + "` = " + m.size + " (" + ativas + " ativas / " + (m.size - ativas) + " comentadas)";
  });
  return ["| Chave | `" + DEPLOY_ENV_FILES[0] + "` | `" + DEPLOY_ENV_FILES[1] + "` |", "|---|---|---|"]
    .concat(linhasTab, ["", "**Medido:** " + resumo.join("; ") + ". **Total distinto: " + todas.length + "**. Chaves apenas — nenhum valor é lido nem emitido."]).join("\n");
}

/** Le os workflows (.github/workflows/*.yml): nome + gatilhos (`on`) + jobs. Pura. */
function lerWorkflows() {
  const dir = path.join(ROOT, DEPLOY_WF_DIR);
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => {
    const L = linhas(fs.readFileSync(path.join(dir, f), "utf8"));
    const nome = (L.find((l) => /^name:\s*\S/.test(l)) || "").replace(/^name:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
    const iOn = L.findIndex((l) => /^on:\s*/.test(l));
    const gatilhos = [];
    if (iOn >= 0) {
      const inline = L[iOn].replace(/^on:\s*/, "").trim();
      if (inline.startsWith("[")) {
        for (const x of inline.replace(/^\[|\]$/g, "").split(",")) if (x.trim()) gatilhos.push(x.trim());
      } else {
        for (let k = iOn + 1; k < L.length && !/^\S/.test(L[k]); k++) {
          const m = L[k].match(/^ {2}([a-z_]+):/);
          if (m) gatilhos.push(m[1]);
        }
      }
    }
    const iJ = L.findIndex((l) => /^jobs:\s*$/.test(l));
    const jobs = [];
    if (iJ >= 0) {
      for (let k = iJ + 1; k < L.length && !/^\S/.test(L[k]); k++) {
        const m = L[k].match(/^ {2}([A-Za-z0-9_-]+):/);
        if (m) jobs.push(m[1]);
      }
    }
    return { arquivo: f, nome, gatilhos: Array.from(new Set(gatilhos)).sort(), jobs };
  });
}

/** Corpo do bloco de workflows do DEPLOY. Pura. */
function renderDeployWorkflows() {
  const lista = lerWorkflows();
  const linhasTab = lista.map((w) => "| `" + w.arquivo + "` | " + (w.nome || "—") + " | " + (w.gatilhos.join(", ") || "—") + " | " + (w.jobs.join(", ") || "—") + " |");
  const totalJobs = lista.reduce((s, w) => s + w.jobs.length, 0);
  return ["| Arquivo | `name:` | Gatilhos (`on`) | Jobs |", "|---|---|---|---|"]
    .concat(linhasTab, ["", "**Medido:** " + lista.length + " workflows e " + totalJobs + " jobs no total (fonte: `" + DEPLOY_WF_DIR + "/*.yml`)."]).join("\n");
}

/** Le o IaC da Railway (.railway/railway.ts) — NOMES/estrutura, nunca valores. Pura. */
function lerRailway() {
  const t = norm(fs.readFileSync(path.join(ROOT, DEPLOY_RAILWAY), "utf8"));
  const defs = [...t.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(postgres|service|volume)\("([^"]+)"/g)]
    .map((m) => ({ ident: m[1], tipo: m[2], nome: m[3] }));
  const uniq = (re, g) => Array.from(new Set([...t.matchAll(re)].map((m) => m[g]))).sort();
  return {
    defs,
    projeto: (t.match(/project\("([^"]+)"/) || [])[1] || "—",
    recursosDeclarados: ((t.match(/resources:\s*\[([^\]]+)\]/) || [])[1] || "").split(",").map((s) => s.trim()).filter(Boolean),
    envPreserve: uniq(/([A-Z][A-Z0-9_]{2,})\s*:\s*preserve\(\)/g, 1),
    envLiteral: uniq(/([A-Z][A-Z0-9_]{2,})\s*:\s*"/g, 1),
    regioes: uniq(/region:\s*"([^"]+)"/g, 1),
    tamanhos: [...t.matchAll(/sizeMB:\s*(\d+)/g)].map((m) => m[1]),
    source: (t.match(/github\("([^"]+)"/) || [])[1] || "—",
    rootDirectory: (t.match(/rootDirectory:\s*"([^"]+)"/) || [])[1] || "—",
    healthcheck: (t.match(/healthcheck:\s*"([^"]+)"/) || [])[1] || "—",
    mounts: uniq(/mountPath:\s*"([^"]+)"/g, 1),
  };
}

/** Corpo do bloco da secao Railway do DEPLOY — nomes/estrutura apenas. Pura. */
function renderDeployRailway() {
  const r = lerRailway();
  const rotulo = (ident) => {
    const d = r.defs.find((x) => x.ident === ident);
    return d ? "`" + d.nome + "` (" + d.tipo + ")" : "`" + ident + "`";
  };
  const linhasTab = r.defs.map((d) => "| `" + d.nome + "` | " + d.tipo + " | — |");
  if (r.projeto !== "—") linhasTab.unshift("| `" + r.projeto + "` | project | resources: " + (r.recursosDeclarados.map(rotulo).join(", ") || "—") + " |");
  const envTodas = Array.from(new Set(r.envPreserve.concat(r.envLiteral))).sort();
  const nomeServico = (r.defs.find((d) => d.tipo === "service") || {}).nome || "—";
  return ["| Recurso | Tipo | Detalhe (nomes apenas) |", "|---|---|---|"]
    .concat(linhasTab, [
      "",
      "**Fonte:** `github(" + r.source + ")`, `rootDirectory: " + r.rootDirectory + "`, healthcheck `" + r.healthcheck + "`; regiões: " + (r.regioes.join(", ") || "—") + "; volumes: " + (r.tamanhos.map((s) => s + " MB").join(", ") || "—") + "; mounts: " + (r.mounts.join(", ") || "—") + ".",
      "",
      "**Env do serviço `" + nomeServico + "` — " + envTodas.length + " chaves (nomes apenas; nenhum valor):** " + (envTodas.join(", ") || "—") + ".",
    ]).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// P1.4 — docs/LOCALSTORAGE-KEYS.md (inversao: o CODIGO e a fonte de dados).
// alive = code_found - dead_declared. O tokenizer e REUSADO do gate
// scripts/verificar-localstorage-keys.cjs (require lazy: o gate consome o
// gerador — o ciclo nao pode resolver em tempo de load).
// ─────────────────────────────────────────────────────────────────────────────

const LS_DIR = "src/lib";
const LS_HYGIENE = "src/lib/storage-hygiene.ts";
const LS_SOFTCONTEXT = "src/lib/softcontext.ts";
const RE_MORTE_STORAGE = /REMOVID[OA]|saiu da superf|n[aã]o s[aã]o lidas|nunca mais|fantasma|apagad|morreram|mortas?\b/i;

/** Arquivos .ts/.tsx de um diretorio (recursivo, ordenado por nome). Pura. */
function listarTs(relDir) {
  const out = [];
  const visitar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) visitar(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  visitar(path.join(ROOT, relDir));
  return out;
}

/** Conjunto resolvido de arquivos sob `src/lib` com acesso a storage. Pura (le o FS). */
function arquivosComStorage() {
  return listarTs(LS_DIR).filter((abs) => /localStorage|sessionStorage/.test(fs.readFileSync(abs, "utf8")));
}

/** Chaves declaradas MORTAS: arrays DEAD_* em storage-hygiene.ts + comentarios de morte. Pura. */
function mortasStorage() {
  const v = require("./verificar-localstorage-keys.cjs");
  const out = new Map();
  const Lh = linhas(fs.readFileSync(path.join(ROOT, LS_HYGIENE), "utf8"));
  let dentro = false;
  for (let i = 0; i < Lh.length; i++) {
    if (/^export const DEAD_[A-Z_]+/.test(Lh[i])) { dentro = true; continue; }
    if (dentro && /^\];/.test(Lh[i].trim())) { dentro = false; continue; }
    if (!dentro) continue;
    for (const t of v.extraiTokens(Lh[i])) if (!out.has(t.token)) out.set(t.token, LS_HYGIENE + ":" + (i + 1));
  }
  const Ls = linhas(fs.readFileSync(path.join(ROOT, LS_SOFTCONTEXT), "utf8"));
  for (let i = 0; i < Ls.length; i++) {
    if (!RE_MORTE_STORAGE.test(Ls[i])) continue;
    for (const t of v.extraiTokens(Ls[i])) if (!out.has(t.token)) out.set(t.token, LS_SOFTCONTEXT + ":" + (i + 1));
  }
  return out;
}

/**
 * Varredura deterministica: CANDIDATAS (linha com acesso a storage, ou const de
 * chave cujo nome casa KEY/PREFIX/STORAGE) + conjunto BRUTO (todo `lila*` em
 * literal, usado para a colisao morta x codigo). Comentarios ficam fora. Pura.
 */
function escanearChavesStorage() {
  const v = require("./verificar-localstorage-keys.cjs");
  const candidatos = new Map();
  const bruto = new Map();
  const arquivos = [];
  for (const abs of arquivosComStorage()) {
    const relArq = rel(abs);
    arquivos.push(relArq);
    const L = linhas(fs.readFileSync(abs, "utf8"));
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue;
      const achados = v.extraiTokens(l);
      for (const t of achados) {
        if (!bruto.has(t.token)) bruto.set(t.token, []);
        bruto.get(t.token).push(relArq + ":" + (i + 1));
      }
      const mDecl = l.match(/(?:const|let|var)\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*[("'`]/);
      const ehDecl = Boolean(mDecl) && /(KEY|PREFIX|STORAGE)/i.test(mDecl[1]);
      const ehUso = /(localStorage|sessionStorage)\s*[.[]/.test(l);
      if (!ehDecl && !ehUso) continue;
      for (const t of achados) {
        if (!candidatos.has(t.token)) candidatos.set(t.token, []);
        candidatos.get(t.token).push({ arquivo: relArq, linha: i + 1, origem: ehDecl ? "const" : "uso" });
      }
    }
  }
  return { candidatos, bruto, arquivos };
}

/** Inventario estruturado (fonte unica de leitura para o gate P1.4). Pura. */
function inventarioStorage() {
  const v = require("./verificar-localstorage-keys.cjs");
  const { candidatos, bruto, arquivos } = escanearChavesStorage();
  const mortas = mortasStorage();
  const chavesMortas = Array.from(mortas.keys()).sort();
  const chavesBruto = Array.from(bruto.keys()).sort();
  const ehMorta = (k) => chavesMortas.some((m) => v.casa(k, m));
  const vivos = Array.from(candidatos.keys()).filter((k) => !ehMorta(k)).sort(); // alive = code_found - dead_declared
  const colisoes = chavesMortas.filter((m) => chavesBruto.some((b) => v.casa(b, m)));
  const foraDoCriterio = chavesBruto.filter((b) => !vivos.some((k) => v.casa(k, b)) && !ehMorta(b));
  return { vivos, mortas, colisoes, foraDoCriterio, arquivos, candidatos, bruto };
}

/** Corpo do bloco de inventario de storage (sem versao/data dentro dos marcadores). Pura. */
function renderLocalstorageKeys() {
  const inv = inventarioStorage();
  const lista = (a) => (a.length ? a.map((s) => "`" + s + "`").join(", ") : "(nenhuma)");
  const linhasTab = inv.vivos.map((k) => {
    const oc = (inv.candidatos.get(k) || []).map((o) => o.arquivo + ":" + o.linha).sort();
    const origem = Array.from(new Set((inv.candidatos.get(k) || []).map((o) => o.origem))).sort().join("/");
    return "| `" + k + "` | " + (oc.slice(0, 3).join(", ") + (oc.length > 3 ? " (+" + (oc.length - 3) + ")" : "")) + " | " + (origem || "—") + " |";
  });
  const mortasAplicaveis = inv.candidatos.size - inv.vivos.length;
  return ["| Chave (viva) | Ocorrências no código | Origem |", "|---|---|---|"]
    .concat(linhasTab, [
      "",
      "**Fórmula:** `alive = code_found - dead_declared` — candidatas " + inv.candidatos.size + "; mortas aplicáveis (∩ candidatas) " + mortasAplicaveis + " → **vivas: " + inv.vivos.length + "**; mortas declaradas: " + inv.mortas.size + ".",
      "",
      "**Mortas declaradas (subtraídas — nunca listadas como vivas):** " + lista(Array.from(inv.mortas.keys()).sort()) + ".",
      "",
      "**Colisão morta × código (declarada morta E presente em literal de código):** " + (inv.colisoes.length ? inv.colisoes.map((c) => "`" + c + "` → `" + inv.mortas.get(c) + "`").join("; ") : "(nenhuma)") + ".",
      "",
      "**Tokens `lila*` fora do critério de chave (nome de asset/fence/tool — NÃO chaves):** " + lista(inv.foraDoCriterio) + ".",
      "",
      "**Escopo da varredura:** `" + LS_DIR + "/**` — " + inv.arquivos.length + " arquivos com acesso a storage; mortas de `" + LS_HYGIENE + "` (`DEAD_STORAGE_KEYS`/`DEAD_SESSION_KEYS`) + `" + LS_SOFTCONTEXT + "`. Chaves usadas FORA de `" + LS_DIR + "` não são medidas por este bloco (seguem na tabela curada acima).",
    ]).join("\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// P1.2 — docs/TESTING.md (estrutura ESTÁVEL: PATH-GATE mapping + E2E gold list).
// REGRA DE CHURN (dura): o bloco comitado NÃO carrega número volátil (contagem de
// testes, % de coverage, carimbo de data). Números vivos: `--live` (stdout,
// read-time) + comando resolvido do package.json. Fonte do PATH-GATE = os
// `test.coverage.thresholds` dos configs do vitest (resolvidos, não assumidos).
// KF-TEST-REGRESSION é frozen C2: NUNCA citado; `kf-testes.md` que o referencie
// => fail-closed.
// ─────────────────────────────────────────────────────────────────────────────

const TESTS_KF = "LILA-DEV/kfs/kf-testes.md";
const TESTS_E2E_DIR = "test/e2e";
// raiz: prefixo para renderizar a chave do threshold como path da RAIZ do repo —
// chaves do backend/vitest.config.ts são relativas a backend/, e a régua C de
// pontos cegos resolve refs de docs a partir da raiz (ref não resolvível = vermelho).
const TESTS_PG_CONFIGS = [
  { superficie: "frontend", raiz: "", path: "vitest.config.ts", live: "npm run test:coverage", test: "test:coverage" },
  { superficie: "backend", raiz: "backend/", path: "backend/vitest.config.ts", live: "cd backend && npm run test:coverage", test: "test:coverage" },
];
const TESTS_FROZEN = "KF-TEST-REGRESSION";

/** Guard do C2 congelado: fonte viva que cite o KF congelado => falha explicita. Pura. */
function guardKfTestes() {
  const abs = path.join(ROOT, TESTS_KF);
  const texto = lerTexto(abs);
  if (texto === null) throw new Error("fonte viva ausente: " + TESTS_KF);
  if (texto.includes(TESTS_FROZEN)) throw new Error("fonte viva " + TESTS_KF + " cita " + TESTS_FROZEN + " (frozen C2) — proibido citar como fonte");
  return texto;
}

/** PATH-GATE: gate -> path, lido dos `test.coverage.thresholds` dos configs. Pura. */
function lerPathGate() {
  const linhasTab = [];
  for (const cfg of TESTS_PG_CONFIGS) {
    const L = linhas(fs.readFileSync(path.join(ROOT, cfg.path), "utf8"));
    let dentro = false;
    let n = 0;
    for (const l of L) {
      if (!dentro && /^\s*thresholds:\s*\{\s*$/.test(l)) { dentro = true; continue; }
      if (!dentro) continue;
      if (/^\s*\},?\s*$/.test(l)) break;
      const m = l.match(/^\s*"([^"]+)":\s*\{\s*(.*?)\s*\},?\s*$/);
      if (!m) continue;
      const st = /statements:\s*(\d+)/.exec(m[2]);
      const br = /branches:\s*(\d+)/.exec(m[2]);
      linhasTab.push({ superficie: cfg.superficie, path: cfg.raiz + m[1], stmts: st ? st[1] : "—", brch: br ? br[1] : "—" });
      n++;
    }
    if (n === 0) throw new Error("config sem thresholds legiveis: " + cfg.path);
  }
  return linhasTab.sort((a, b) => (a.superficie + a.path).localeCompare(b.superficie + b.path));
}

/** Specs E2E do filesystem: gold (g<N>-) e demais — conjuntos ordenados. Pura. */
function lerE2e() {
  const dir = path.join(ROOT, TESTS_E2E_DIR);
  const specs = fs.readdirSync(dir).filter((f) => f.endsWith(".spec.ts") && fs.statSync(path.join(dir, f)).isFile()).sort();
  const gold = specs.filter((f) => /^g\d+-/.test(f));
  const outros = specs.filter((f) => !/^g\d+-/.test(f));
  return { specs, gold, outros };
}

/** Comandos vivos resolvidos dos package.json (nao inventados). Pura. */
function lerComandosVivos() {
  const raiz = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts || {};
  const back = lerTexto(path.join(ROOT, "backend", "package.json"));
  const b = back ? (JSON.parse(back).scripts || {}) : {};
  const existe = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  const cmds = [];
  if (existe(raiz, "test:coverage")) cmds.push("npm run test:coverage");
  if (existe(b, "test:coverage")) cmds.push("cd backend && npm run test:coverage");
  if (existe(raiz, "test:e2e")) cmds.push("npm run test:e2e");
  if (existe(raiz, "test:ci")) cmds.push("npm run test:ci");
  if (cmds.length === 0) throw new Error("nenhum comando de teste/coverage resolvivel nos package.json");
  return cmds;
}

/** Numeros VIVOS (read-time; nunca escritos no derivado). Pura (le o FS). */
function numerosVivos() {
  const pg = lerPathGate();
  const e2e = lerE2e();
  const art = ["coverage/coverage-summary.json", "backend/coverage/coverage-summary.json"]
    .map((p) => ({ path: p, texto: lerTexto(path.join(ROOT, p)) }))
    .filter((a) => a.texto !== null)
    .map((a) => {
      const tot = (() => {
        try { return JSON.parse(a.texto).total || null; } catch { return null; }
      })();
      return { path: a.path, total: tot };
    });
  return { pg, e2e, cmds: lerComandosVivos(), artefatos: art };
}

/** Bloco A — PATH-GATE (gate -> path): só decisões de gate, zero baseline/stamp. Pura. */
function renderTestsPathGate() {
  guardKfTestes();
  const pg = lerPathGate();
  const linhasTab = pg.map((g) => "| " + g.superficie + " | `" + g.path + "` | " + g.stmts + " / " + g.brch + " |");
  return ["| Superfície | Path crítico | Gate (stmts/brch) |", "|---|---|---|"]
    .concat(linhasTab, [
      "",
      "**Fonte do mapeamento (resolvida por grep, não assumida):** `" + TESTS_PG_CONFIGS.map((c) => c.path).join("` + `") + "` — campo `test.coverage.thresholds` (a tabela renderiza os paths da raiz do repo; as chaves do config de backend são relativas a `backend/`). Só DECISÕES de gate: baseline medido, fórmula de cálculo e histórico de hardening vivem nas tabelas curadas acima.",
      "**Fonte viva da política de testes:** `" + TESTS_KF + "` (projeção KF-area compilada de `LILA-DEV/kf-fonte.yaml`).",
      "",
      "**Live numbers:** run `" + lerComandosVivos().join("` / `") + "` — never hand-copied here.",
    ]).join("\n");
}

/** Bloco B — E2E gold list (só membros gold do filesystem; não-gold ficam no --live). Pura. */
function renderTestsE2e() {
  guardKfTestes();
  const e = lerE2e();
  const lista = (a) => (a.length ? a.map((f) => "`" + TESTS_E2E_DIR + "/" + f + "`").join(", ") : "(nenhum)");
  return [
    "**Gold (membros do filesystem `" + TESTS_E2E_DIR + "/` — padrão `g<N>-*.spec.ts`):** " + lista(e.gold) + ".",
    "",
    "**Live numbers:** run `" + lerComandosVivos().join("` / `") + "` — never hand-copied here.",
  ].join("\n");
}

/**
 * P1.5 — docs/README.md: catalogo dos docs governados.
 * Fonte: meta line + primeiro heading de cada docs/*.md (exceto o proprio README)
 * + header curado de docs/manifest-fonte.yaml. Sem timestamps (deterministico).
 */
function renderDocsCatalog() {
  const dir = path.join(ROOT, "docs");
  const arquivos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort((a, b) => a.localeCompare(b));
  const campo = (meta, chave) => {
    const m = new RegExp("(^|\\|)\\s*" + chave + "=([^|]*)").exec(meta || "");
    return m ? m[2].trim() : "—";
  };
  const linhas = [
    "| File | Title | Version | Last update | Status |",
    "|---|---|---|---|---|",
  ];
  for (const f of arquivos) {
    const txt = lerTexto(path.join(dir, f));
    const meta = (txt.split(/\r?\n/).find((l) => l.startsWith("meta:")) || "").trim();
    const mTitulo = txt.match(/^#\s+(.+)$/m);
    const titulo = mTitulo ? mTitulo[1].trim() : "—";
    linhas.push(`| \`${f}\` | ${titulo} | ${campo(meta, "version")} | ${campo(meta, "last_update")} | ${campo(meta, "status")} |`);
  }
  const yaml = lerTexto(path.join(dir, "manifest-fonte.yaml"));
  const mVersao = yaml.match(/versao_manifesto:\s*"([^"]+)"/);
  const mData = yaml.match(/last_update:\s*"([^"]+)"/);
  const vYaml = mVersao ? mVersao[1] : "—";
  const dYaml = mData ? mData[1] : "—";
  linhas.push(`| \`manifest-fonte.yaml\` | Curated source of the MANIFEST — edit here, never in the generated .md | ${vYaml} | ${dYaml} | — |`);
  linhas.push("");
  linhas.push(`count: ${arquivos.length + 1} entradas (docs/*.md + manifest-fonte.yaml) — regeneration: \`node scripts/gerar-docs-derivados.cjs --pair docs-catalog\`.`);
  return linhas.join("\n");
}


/** Renderer por bloco (mapa explicito por `bloco.key`; JSON nao carrega funcao). Fail-closed. */
const RENDERERS = {
  "docs-catalog": renderDocsCatalog,
  "protocolo-indices-rule3": renderRule3,
  "scripts-readme-table": renderScriptsReadme,
  "readme-tactical-areas": renderAreasTaticas,
  "deploy-env": renderDeployEnv,
  "deploy-workflows": renderDeployWorkflows,
  "deploy-railway": renderDeployRailway,
  "localstorage-keys": renderLocalstorageKeys,
  "tests-path-gate": renderTestsPathGate,
  "tests-e2e-gold": renderTestsE2e,
};

function renderBloco(par, bloco) {
  const chave = (bloco && bloco.key) || par.id;
  const f = RENDERERS[chave];
  if (!f) throw new Error("kind=block sem renderer implementado no gerador: " + chave);
  return f(par, bloco);
}

/** Plano de escrita: 1 item por derivado, com o conteudo esperado (memoria). Deterministico. */
function planejar(pairs, opts) {
  const pairId = opts && opts.pairId;
  const alvo = pairId ? pairs.filter((p) => p.id === pairId) : pairs;
  if (pairId && alvo.length === 0) throw new Error("pair nao registrado: " + pairId);
  const plano = [];
  const estado = new Map(); // derivado -> conteudo acumulado (2 pares podem tocar o mesmo arquivo)
  const base = (relPath) => (estado.has(relPath) ? estado.get(relPath).conteudo : lerTexto(path.join(ROOT, relPath)));
  for (const par of alvo) {
    if (par.kind === "module") {
      const mod = require(path.join(ROOT, par.module));
      if (typeof mod.gerar !== "function") throw new Error("modulo sem gerar(): " + par.module);
      const g = mod.gerar();
      for (const d of par.derived_paths) {
        const chave = typeof d === "string" ? null : d.module_key;
        const rp = typeof d === "string" ? d : d.path;
        if (!chave || typeof g[chave] !== "string") throw new Error("modulo " + par.module + " nao produz a chave registrada '" + chave + "' para " + rp);
        const conteudo = norm(g[chave]);
        estado.set(rp, { conteudo });
        plano.push({ par, derivado: rp, conteudo });
      }
      continue;
    }
    const atual = base(par.derived_path);
    if (atual === null) throw new Error("derivado ausente: " + par.derived_path);
    const bks = blocosDe(par);
    let texto = atual;
    for (const b of bks) texto = substituirBloco(texto, b.begin, b.end, renderBloco(par, b));
    const conteudo = norm(texto);
    estado.set(par.derived_path, { conteudo });
    plano.push({ par, derivado: par.derived_path, conteudo, blocos: bks.map((b) => b.key) });
  }
  return plano;
}

/** Relatorio de resolucao do dead-list (stdout; nao entra no bloco — sem churn por linha). */
function relatarFontes(pairs) {
  for (const par of pairs) {
    const src = (par.sources || []).find((s) => s.type === "deadlist");
    if (!src) continue;
    const dl = resolverDeadList(src);
    const inv = inventario();
    const colisao = inv.presentes.filter((f) => dl.lista.indexOf(f) >= 0);
    console.log("[fonte] par " + par.id + " — dead-list resolvido em " + dl.resolvido + " (ancora '" + src.anchor + "' @ linha " + dl.linha + "; candidatos verificados: " + dl.candidatos.map((c) => c.path + ":" + c.linha).join(", ") + ")");
    const vivosFs = inv.presentes.filter((f) => dl.lista.indexOf(f) < 0);
    console.log("[fonte] par " + par.id + " — mortos declarados = " + dl.lista.length + " (" + dl.lista.join(", ") + ") | fs presentes = " + inv.presentes.length + " | intersecao morto x fs = " + colisao.length + " | vivos (fs - mortos) = " + vivosFs.length);
  }
}

/** Relatorio LIVE (read-time; NUNCA escreve no derivado; nao afeta o veredito do --check). */
function relatarVivos() {
  const n = numerosVivos();
  console.log("[live] estrutura lida AGORA (nunca escrita no derivado):");
  console.log("  test/e2e: " + n.e2e.specs.length + " spec(s) — gold: " + (n.e2e.gold.join(", ") || "(nenhum)") + " | demais: " + (n.e2e.outros.join(", ") || "(nenhum)"));
  console.log("  PATH-GATE: " + n.pg.length + " gate(s) — " + TESTS_PG_CONFIGS.map((c) => c.superficie + ": " + n.pg.filter((g) => g.superficie === c.superficie).length).join(" | "));
  console.log("  comandos vivos (resolvidos dos package.json): " + n.cmds.join(" ; "));
  if (n.artefatos.length === 0) {
    console.log("  coverage: SEM artefato local — rode " + n.cmds.filter((c) => c.includes("coverage")).join(" ; ") + " para produzi-lo (nada e copiado para o doc)");
  }
  for (const a of n.artefatos) {
    console.log("  coverage [" + a.path + "]: " + (a.total ? "lines " + a.total.lines.pct + "% | statements " + a.total.statements.pct + "% | branches " + a.total.branches.pct + "% | functions " + a.total.functions.pct + "%" : "artefato sem campo 'total'"));
  }
  console.log("  fontes vivas: " + TESTS_KF + " + " + TESTS_PG_CONFIGS.map((c) => c.path).join(" + "));
  console.log("[live] numeros acima sao read-time: NUNCA entram no bloco comitado (regra de churn P1.2).");
}

const USO = [
  "Uso: node scripts/gerar-docs-derivados.cjs [--check|--dry-run] [--pair <id>] [--list] [--json]",
  "  (sem flag)     regenera TODOS os pares do registry scripts/docs-pairs.registry.json",
  "  --check        nao escreve; exit 1 se algum derivado difere do regen",
  "  --dry-run      nao escreve; lista o que mudaria",
  "  --pair <id>    restringe a um par registrado",
  "  --live         imprime numeros VIVOS (read-time) no stdout; NUNCA escreve no derivado",
  "  --list         lista os pares registrados",
  "  --json         relatorio JSON no stdout",
  "Exit: 0 fresco/aplicado | 1 stale (--check) | 2 erro de execucao",
].join("\n");

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) { console.log(USO); return; }
  const modoCheck = argv.includes("--check");
  const modoDry = argv.includes("--dry-run");
  const modoJson = argv.includes("--json");
  const modoLive = argv.includes("--live");
  const iP = argv.indexOf("--pair");
  const pairId = iP >= 0 ? argv[iP + 1] : null;
  if (iP >= 0 && !pairId) { console.error("ERRO: --pair exige um id de par"); process.exit(2); }
  const conhecidas = ["--check", "--dry-run", "--json", "--list", "--pair", "--live", "--help", "-h"];
  const desconhecidas = argv.filter((a, i) => a.startsWith("-") && conhecidas.indexOf(a) < 0 && !(i > 0 && argv[i - 1] === "--pair"));
  if (desconhecidas.length) { console.error("ERRO: flag desconhecida: " + desconhecidas.join(", ")); console.error(USO); process.exit(2); }

  let pairs = [];
  let plano = [];
  try {
    pairs = carregarRegistry();
    if (argv.includes("--list")) {
      for (const p of pairs) console.log(p.id + " [" + p.kind + "] " + (p.derived_path || p.derived_paths.map((d) => (typeof d === "string" ? d : d.path)).join(", ")));
      return;
    }
    plano = planejar(pairs, { pairId });
  } catch (e) { console.error("ERRO: " + e.message); process.exit(2); }

  const resultados = plano.map((it) => {
    const atual = lerTexto(path.join(ROOT, it.derivado));
    return { par: it.par.id, derivado: it.derivado, blocos: it.blocos || [], fontes: it.par.sources.map((s) => s.path_or_cmd), regen_cmd: it.par.regen_cmd, ausente: atual === null, fresco: atual !== null && norm(atual) === it.conteudo };
  });
  const stale = resultados.filter((r) => !r.fresco);

  if (modoCheck) {
    if (modoJson) { console.log(JSON.stringify({ comando: "gerar-docs-derivados", modo: "check", pares: pairs.length, derivados: resultados.length, stale: stale.length, achados: stale }, null, 2)); process.exit(stale.length === 0 ? 0 : 1); }
    if (stale.length === 0) { console.log("docs derivados: frescos (" + resultados.length + " derivado(s) de " + pairs.length + " par(es) registrados == regen)"); if (modoLive) relatarVivos(); process.exit(0); }
    for (const s of stale) console.error("STALE [par " + s.par + "] " + s.derivado + (s.blocos.length > 1 || (s.blocos.length === 1 && s.blocos[0] !== s.par) ? " [blocos: " + s.blocos.join(", ") + "]" : "") + (s.ausente ? " (ausente)" : "") + " — fontes: " + s.fontes.join(" | ") + " | regen: " + s.regen_cmd);
    if (modoLive) relatarVivos();
    process.exit(1);
  }

  if (!modoJson && !modoLive) relatarFontes(pairId ? pairs.filter((p) => p.id === pairId) : pairs);
  if (modoLive) { relatarVivos(); return; } // read-time apenas: NUNCA escreve no derivado
  let escritos = 0;
  for (let i = 0; i < plano.length; i++) {
    if (resultados[i].fresco) continue;
    escritos++;
    if (modoDry) { console.log("[MUDARIA] " + resultados[i].derivado + " (par " + resultados[i].par + ")"); continue; }
    fs.writeFileSync(path.join(ROOT, resultados[i].derivado), plano[i].conteudo);
    console.log("escrito: " + resultados[i].derivado + " (par " + resultados[i].par + ")");
  }
  if (modoJson) { console.log(JSON.stringify({ comando: "gerar-docs-derivados", modo: modoDry ? "dry-run" : "write", pares: pairs.length, derivados: resultados.length, mudaria: escritos, frescos: resultados.length - escritos }, null, 2)); return; }
  console.log(escritos === 0 ? "nada a fazer: " + resultados.length + " derivado(s) ja frescos" : escritos + " derivado(s) " + (modoDry ? "mudariam" : "escritos"));
}

module.exports = {
  carregarRegistry,
  medir,
  lerTexto,
  substituirBloco,
  extrairBloco,
  normalizarBloco,
  blocosDe,
  renderRule3,
  renderScriptsReadme,
  renderAreasTaticas,
  renderDeployEnv,
  renderDeployWorkflows,
  renderDeployRailway,
  renderLocalstorageKeys,
  renderTestsPathGate,
  renderTestsE2e,
  renderDocsCatalog,
  renderBloco,
  guardKfTestes,
  lerPathGate,
  lerE2e,
  lerComandosVivos,
  numerosVivos,
  relatarVivos,
  resolverDeadList,
  inventario,
  proposito,
  areasTaticas,
  lerEnvKeys,
  lerWorkflows,
  lerRailway,
  escanearChavesStorage,
  mortasStorage,
  inventarioStorage,
  planejar,
  relatarFontes,
  RENDERERS,
  RULE3_FONTES,
  LS_DIR,
  LS_HYGIENE,
  LS_SOFTCONTEXT,
  AREAS_GRAFO,
  AREAS_KF_FONTE,
  DEPLOY_ENV_FILES,
  DEPLOY_WF_DIR,
  DEPLOY_RAILWAY,
  TESTS_KF,
  TESTS_E2E_DIR,
  TESTS_PG_CONFIGS,
  ROOT,
  REGISTRY_PATH,
};

if (require.main === module) main();






