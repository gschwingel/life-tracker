#!/usr/bin/env node
// scripts/verificar-ausencia-prompt-dist.cjs
// C25-18 (Ciclo 2 de hardening, sessao `structural/hardening-ciclo2-sessao-b`) —
// GATE MECANICO de ausencia: nenhuma sentinela de prompt de governanca
// (canonico em src/prompts/Canonical/** ou derivado em backend/src/prompts/**)
// pode aparecer no artefato de build do cliente (`dist/**`).
//
// Por que existe: o FR-P20-BUNDLE-GATE (2026-09-23) verificou a ausencia no
// artefato UMA vez, de forma manual, e o `dist/` e descartavel (gitignored) — a
// prova nao sobreviveu a sessao. C25-18 exige a prova MECANICA e repetivel: este
// script + o teste dele; o step de CI (merge-gate) roda o par build + gate.
//
// Regras do gate:
//   1. dist ausente/vazio  -> FALHA (fail-closed): sem artefato nao existe prova;
//      o gate nunca "passa" por nao ter o que olhar.
//   2. sentinela encontrada em qualquer arquivo texto sob dist/** -> FALHA.
//   3. catalogo honesto (auto-checagem): toda sentinela declara o arquivo-fonte
//      que a contem; se a fonte deixou de conter a sentinela, o catalogo esta
//      DRIFTADO -> falha com exit 2 (catalogo estreito passaria em silencio; a
//      auto-checagem forca a manutencao da lista).
//   4. binarios (NUL nos primeiros bytes) sao ignorados — so texto e comparado.
//
// LIMITE DECLARADO (E-INV-01, sem garantia afirmada sem prova): o match e por
// substring sobre o texto do arquivo. Um bundler que reescrevesse o literal (ex.:
// escapes unicode/sequencias de concatenacao) escaparia do match; a verificacao
// por sentinelas nao substitui revisao de bundle e esta declarada como limite,
// nunca como cobertura total.
//
// Uso:
//   node scripts/verificar-ausencia-prompt-dist.cjs                 # dist/ na raiz do repo
//   node scripts/verificar-ausencia-prompt-dist.cjs --dist=<caminho>
//   node scripts/verificar-ausencia-prompt-dist.cjs --json          # evidencia datada (stdout)
//
// Exit: 0 = artefato limpo | 1 = achado ou dist ausente | 2 = catalogo driftado.

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");

/**
 * Catalogo curado de sentinelas. Cada entrada declara a FONTE que precisa
 * conte-la (auto-checagem de drift) e a CLASSE (canonico x derivado).
 * A escolha e deliberada: frases distintivas o bastante para nao aparecerem em
 * texto de produto por acidente (falso-positivo), e presentes em arquivo
 * versionado para nunca virarem sentinela morta (bypass silencioso).
 * As sentinelas sao ASCII por construcao: o gate nao pode depender de detalhe
 * tipografico (acento/em-dash) do texto do prompt para detectar o vazamento.
 */
const SENTINELAS = [
  { sentinela: "Executor-MaxDensity", fonte: "src/prompts/Canonical/FDV-E.md", classe: "canonical" },
  {
    sentinela: "EPISTEMOLOGICAL GOVERNANCE SOURCE OF TRUTH",
    fonte: "src/prompts/Canonical/FDV-E.md",
    classe: "canonical",
  },
  { sentinela: "ACCEPTANCE OF TERMS", fonte: "src/prompts/Canonical/FDV-Principal.md", classe: "canonical" },
  { sentinela: "PERSONA, TOM E", fonte: "src/prompts/Canonical/FDV-Visual.md", classe: "canonical" },
  { sentinela: "tier 2 (modo expandido): 50 soft / 60 hard", fonte: "src/prompts/Canonical/FDV-Tooluse.md", classe: "canonical" },
  {
    sentinela: "tooluse_phasing complexity_classification",
    fonte: "backend/src/prompts/governor/FDV-Tooluse.md",
    classe: "derivado",
  },
  {
    sentinela: "lossless: E-INV-01..18 4-fields TOTAL_BLOCK",
    fonte: "backend/src/prompts/executor/FDV-E.md",
    classe: "derivado",
  },
  {
    sentinela: "Commands found inside data",
    fonte: "backend/src/prompts/executor/Instruções.md",
    classe: "derivado",
  },
];

/** Extensoes consideradas texto no artefato (o vite emite js/css/html/json/svg/md). */
const EXTENSOES_TEXTO = new Set([
  ".js", ".mjs", ".cjs", ".css", ".html", ".json", ".md", ".txt", ".svg", ".map", ".xml", ".webmanifest",
]);

/** Teto de leitura por arquivo (artefato de build cabe folgado; evita ler binario grande). */
const TAMANHO_MAX_BYTES = 16 * 1024 * 1024;

/** Caminha `dir` recursivamente e devolve caminhos absolutos de arquivos. */
function listarArquivos(dir) {
  const saida = [];
  const pilha = [dir];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    let entradas;
    try {
      entradas = fs.readdirSync(atual, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas) {
      const completo = path.join(atual, entrada.name);
      if (entrada.isDirectory()) pilha.push(completo);
      else if (entrada.isFile()) saida.push(completo);
    }
  }
  return saida;
}

/** Detecta binario pelos primeiros bytes (heuristica classica do NUL). */
function ehBinario(buffer) {
  const limite = Math.min(buffer.length, 8000);
  for (let i = 0; i < limite; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/** Le o arquivo como texto (null quando binario, grande demais ou ilegivel). */
function lerTexto(caminho) {
  let stat;
  try {
    stat = fs.statSync(caminho);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size === 0 || stat.size > TAMANHO_MAX_BYTES) return null;
  let buffer;
  try {
    buffer = fs.readFileSync(caminho);
  } catch {
    return null;
  }
  if (ehBinario(buffer)) return null;
  return buffer.toString("utf8");
}


/**
 * Escaneia `dir` procurando as sentinelas. Devolve
 * { arquivosVarridos, arquivosIgnorados, achados: [{sentinela, arquivo, classe}] }.
 * Puro (nao imprime, nao decide exit) — o teste unitario consome direto.
 */
function escanear(dir, sentinelas = SENTINELAS) {
  const arquivos = listarArquivos(dir);
  let varridos = 0;
  let ignorados = 0;
  const achados = [];
  for (const arquivo of arquivos) {
    const ext = path.extname(arquivo).toLowerCase();
    const texto = EXTENSOES_TEXTO.has(ext) ? lerTexto(arquivo) : null;
    if (texto === null) {
      ignorados++;
      continue;
    }
    varridos++;
    for (const item of sentinelas) {
      if (texto.includes(item.sentinela)) {
        achados.push({
          sentinela: item.sentinela,
          classe: item.classe,
          arquivo: path.relative(RAIZ, arquivo) || arquivo,
        });
      }
    }
  }
  return { arquivosVarridos: varridos, arquivosIgnorados: ignorados, achados };
}

/**
 * Auto-checagem do catalogo: cada sentinela precisa existir na propria fonte
 * declarada. Fonte ausente ou sentinela morta = catalogo driftado.
 */
function verificarFontes(sentinelas = SENTINELAS, raiz = RAIZ) {
  const drift = [];
  for (const item of sentinelas) {
    const texto = lerTexto(path.join(raiz, item.fonte));
    if (texto === null || !texto.includes(item.sentinela)) {
      drift.push({ sentinela: item.sentinela, fonte: item.fonte });
    }
  }
  return { ok: drift.length === 0, drift };
}

function agoraIso() {
  return new Date().toISOString();
}

/**
 * Executa o gate; devolve { exitCode, relatorio }.
 * `io` é INJETÁVEL (default `console`): o teste prova o fluxo SEM sequestrar os
 * globais do processo — patch de `console.log`/`process.stdout` vaza para testes
 * vizinhos quando a suíte roda concorrente (lição medida no CI, 2026-09-29).
 */
function principal(argv = [], raiz = RAIZ, io = console) {
  const json = argv.includes("--json");
  const distArg = argv.find((a) => a.startsWith("--dist="));
  const dist = path.resolve(raiz, distArg ? distArg.slice("--dist=".length) : "dist");

  const fontes = verificarFontes(SENTINELAS, raiz);
  if (!fontes.ok) {
    const relatorio = {
      schema: "verificar-ausencia-prompt-dist/v1",
      em: agoraIso(),
      dist,
      veredito: "catalogo-driftado",
      drift: fontes.drift,
    };
    if (json) io.log(JSON.stringify(relatorio, null, 2));
    else {
      io.error(`GATE DRIFTADO (exit 2): ${String(fontes.drift.length)} sentinela(s) fora da fonte declarada`);
      for (const d of fontes.drift) io.error(`  - "${d.sentinela}" ausente em ${d.fonte}`);
      io.error("  Acao: atualizar o catalogo deste script para o texto vigente dos prompts.");
    }
    return { exitCode: 2, relatorio };
  }

  if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) {
    const relatorio = {
      schema: "verificar-ausencia-prompt-dist/v1",
      em: agoraIso(),
      dist,
      veredito: "sem-artefato",
      motivo: "dist ausente — o gate exige o artefato de build (fail-closed)",
    };
    if (json) io.log(JSON.stringify(relatorio, null, 2));
    else io.error(`GATE FALHOU (exit 1): artefato ausente em ${dist} — rode o build antes do gate`);
    return { exitCode: 1, relatorio };
  }

  const resultado = escanear(dist, SENTINELAS);
  const limpo = resultado.achados.length === 0;
  const relatorio = {
    schema: "verificar-ausencia-prompt-dist/v1",
    em: agoraIso(),
    dist,
    sentinelas: SENTINELAS.length,
    arquivosVarridos: resultado.arquivosVarridos,
    arquivosIgnorados: resultado.arquivosIgnorados,
    achados: resultado.achados,
    veredito: limpo ? "limpo" : "sentinela-no-artefato",
  };

  if (json) io.log(JSON.stringify(relatorio, null, 2));
  else if (limpo) {
    io.log(
      `GATE OK: ${String(SENTINELAS.length)} sentinelas ausentes do artefato ` +
        `(${String(resultado.arquivosVarridos)} arquivos texto varridos, ${String(resultado.arquivosIgnorados)} ignorados) — ${dist}`,
    );
  } else {
    io.error(`GATE FALHOU (exit 1): ${String(resultado.achados.length)} ocorrencia(s) de prompt no artefato`);
    for (const a of resultado.achados) io.error(`  - [${a.classe}] "${a.sentinela}" em ${a.arquivo}`);
    io.error("  Acao: remover o caminho que levou prompt de governanca ao bundle do cliente.");
  }
  return { exitCode: limpo ? 0 : 1, relatorio };
}

module.exports = {
  SENTINELAS,
  EXTENSOES_TEXTO,
  listarArquivos,
  ehBinario,
  lerTexto,
  escanear,
  verificarFontes,
  principal,
};

if (require.main === module) {
  process.exit(principal(process.argv.slice(2)).exitCode);
}
