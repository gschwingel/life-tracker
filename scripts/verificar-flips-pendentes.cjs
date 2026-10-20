#!/usr/bin/env node
/**
 * scripts/verificar-flips-pendentes.cjs
 * FR-GUARDA-FLIPS-PENDENTES-20260920 -- família guards (SP-GUARDS-VALIDADORES / KF-FERRAMENTAS).
 *
 * POR QUE ESTE SCRIPT EXISTE
 * (fonte: LILA-DEV/planejamento/prompts/executados/2026-09-21-act-higiene-estado-grafo-flips-guarda.md,
 *  tarefa 4; decisão humana Igor datada 2026-09-20; path corrigido em 2026-09-21 pelo
 *  PATCH-PROMPTS-CONSOLIDACAO-20260921 após o arquivamento do prompt em executados/)
 *
 * A auditoria de 2026-09-20 encontrou 7 frames executados e merged cujo nó no
 * grafo nunca foi flipado para 🟢 (falha de flip anterior ao ritual de
 * fechamento pós-merge, padrão PR #607). A guarda institucionaliza a detecção:
 *
 *   log de execução existe + código na main + nó não-🟢  →  ACHADO
 *
 * NATUREZA NÃO-BLOQUEANTE: exit 0 SEMPRE, mesmo com achados. A guarda é alerta
 * visível no stdout, não gate. Promoção a required check é decisão humana
 * futura.
 *
 * FONTES DA REGRA
 * - "log de execução existe": varredura de LILA-DEV/execucao/logs/*.md —
 *   diretório canônico dos logs de execução (mesma fonte do validar-integridade).
 *   O prompt-fonte cita LILA-DEV/planejamento/log/*.md; esse caminho NUNCA
 *   existiu no repo (verificado em 2026-09-21), então a varredura cobre os DOIS:
 *   o canônico sempre, o do prompt se um dia existir.
 * - "código na main": implícito — o script roda sobre a árvore corrente
 *   (checkout da main no CI); nada além disso é verificado aqui.
 * - "nó não-🟢": leitura DIRETA do estado no grafo.json (a proibição do
 *   prompt-fonte é de ESCRITA manual do JSON; leitura é permitida).
 *
 * HEURÍSTICA DE "ENTRADA" (documentada conforme exigido)
 * - Um arquivo de log é dividido em ENTRADAS por cabeçalho markdown (linhas
 *   iniciando com "#"); o preâmbulo antes do 1º cabeçalho é uma entrada.
 * - Antes de extrair ids, o texto da entrada passa por DUAS limpezas que só
 *   removem ruído de formato (calibradas no 1º run da guarda, 2026-09-21):
 *     1. tokens de caminho/arquivo (ex.: "LILA-DEV/.../FR-X-log.md",
 *        "FRAME-X.md") — referências a ARQUIVOS não são ids;
 *     2. pontuação final de match (ex.: "FR-X.", "FR-X-" de enumeração).
 * - Uma entrada EVIDENCIA execução merged de um id quando contém o id E um
 *   traço de execução merged: /PR #\d+/ OU /\bmerged\b/i (mesma entrada,
 *   linhas quaisquer). Coocorrência na mesma entrada é frouxa POR DESIGN
 *   (prompt-fonte 4.1): falso positivo é sinal para triagem humana, nunca
 *   mutação automática — a guarda NÃO escreve nada.
 * - Ids considerados: FR-*, FRAME-*, SP-* (prompt-fonte 4.1), via regex
 *   /\b(?:FRAME|FR|SP)-[A-Za-z0-9][A-Za-z0-9._-] + /g (ver RE_ID).
 * - Um id com múltiplas evidências gera UM achado (a primeira, arquivos em
 *   ordem alfabética, entradas em ordem de arquivo).
 *
 * MENÇÕES QUE NÃO RESOLVEM EM NÓ
 * A regra da guarda é sobre NÓS ("nó não-🟢 → achado"): um id extraído do log
 * que não corresponde a nenhum nó do grafo ATIVO (ex.: referências a arquivos
 * de log, fragmentos de enumeração, ids de fósseis) NÃO gera achado — a guarda
 * NÃO inventa alvo. Essas menções são contadas no resumo como "menções sem nó"
 * para visibilidade, sem listar (o 1º run mostrou ~90/95 de ruído desse tipo).
 *
 * EXCEÇÕES LEGÍTIMAS (marcadores de justificativa deliberada de não-🟢)
 * Um nó não-🟢 NÃO vira achado quando (decisão Igor 2026-10-06,
 * FRAME-LOTE-HIGIENE-GRAFO-20261006; revê a decisão de 2026-09-20):
 *   1. campo `deprecated` presente  — morte ESTRUTURADA do nó (padrão atual);
 *   2. nota contém "⚫"             — morte declarada no padrão do farol;
 *   3. nota contém "aguardando veredito" — decisão humana pendente registrada.
 * A substring "deprecated" AVULSA na nota NÃO isenta: notas vivas descrevem
 * features que tocam status deprecated de TERCEIROS — foi exatamente assim que
 * a isenção falsa escondeu o flip pendente de SP/FRAME-LACO-ESTADO-20261002
 * (trabalho merged no #1017; o "flip" anunciado no #1022 nunca tocou o campo
 * estado; descoberto na auditoria de cores de 2026-10-06). A lista acima é
 * exaustiva por decisão.
 *
 * SAÍDA
 * Uma linha por achado: "ACHADO | <id> | estado: <estado> | <arquivo>:<linha>"
 * (arquivo:linha = 1-based, linha do traço de execução merged). Resumo ao fim.
 *
 * EXIT
 * - 0 sempre que a varredura rodou (com ou sem achados) — não-bloqueante.
 * - 2 falha de infraestrutura (grafo ilegível, nenhum diretório de log
 *   existente) — falha explícita, nunca silenciosa (padrão do irmão vivacidade).
 *
 * USO
 *   node scripts/verificar-flips-pendentes.cjs
 * Env (testes/ferrado): LILA_GRAFO_PATH, LILA_FLIPS_LOG_DIR (substitui os dirs
 * padrão por um único diretório — usado pela suíte de teste com fixture).
 * Sem dependência externa: apenas builtins do Node.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const GRAFO_PATH = process.env.LILA_GRAFO_PATH ||
  path.join(REPO_ROOT, "LILA-DEV", "planejamento", "grafo.json");

const LOG_DIRS_PADRAO = [
  path.join(REPO_ROOT, "LILA-DEV", "execucao", "logs"),
  path.join(REPO_ROOT, "LILA-DEV", "planejamento", "log"),
];

const RE_ID = /\b(?:FRAME|FR|SP)-[A-Za-z0-9][A-Za-z0-9._-]*/g;
const RE_EVIDENCIA = /PR #\d+|\bmerged\b/i;
// Ruído de formato: tokens de caminho/arquivo dentro da entrada (não são ids).
const RE_ARQUIVO = /\S*\.(?:md|json|cjs|ts|tsx|js|mjs|yml|yaml|log|bin)\b/gi;
// Exceções de não-🟢 (estruturadas — ver header EXCEÇÕES LEGÍTIMAS): campo
// `deprecated`, "⚫" na nota, "aguardando veredito" na nota. Exportado para a
// suíte fixar o contrato.
const MARCADORES_EXCECAO = ["campo deprecated", "⚫", "aguardando veredito"];

/** Divide o conteúdo em entradas por cabeçalho markdown. Pura. */
function extrairEntradas(conteudo) {
  const linhas = String(conteudo).split(/\r?\n/);
  const entradas = [];
  let atual = { linhaInicio: 1, linhas: [] };
  for (let i = 0; i < linhas.length; i += 1) {
    const ehCabecalho = /^#{1,6} /.test(linhas[i]);
    if (ehCabecalho && atual.linhas.length > 0) {
      entradas.push(atual);
      atual = { linhaInicio: i + 1, linhas: [] };
    }
    atual.linhas.push(linhas[i]);
  }
  if (atual.linhas.length > 0) entradas.push(atual);
  return entradas.map((e) => ({
    linhaInicio: e.linhaInicio,
    texto: e.linhas.join("\n"),
    linhas: e.linhas,
  }));
}

/** Limpa ruído de formato do texto da entrada antes de extrair ids. Pura. */
function limparRuidoFormato(texto) {
  return String(texto).replace(RE_ARQUIVO, " ");
}

/** Apara pontuação final do match de id (ex.: "FR-X." → "FR-X"). Pura. */
function apararId(bruto) {
  return bruto.replace(/[._-]+$/, "");
}

/**
 * Motivo de exceção do nó não-🟢, ou null se não isento. Pura.
 * Estruturada por decisão (2026-10-06): campo `deprecated` presente, "⚫" na
 * nota ou "aguardando veredito" na nota. Substring "deprecated" avulsa NÃO
 * isenta (falso positivo que escondeu o flip do LACO-ESTADO — ver header).
 */
function temMarcadorExcecao(no) {
  if (no && typeof no === "object" && no.deprecated !== undefined && no.deprecated !== null) {
    return "campo deprecated";
  }
  const nota = String((no && typeof no === "object" ? no.nota : no) || "").toLowerCase();
  if (nota.includes("⚫")) return "⚫";
  if (nota.includes("aguardando veredito")) return "aguardando veredito";
  return null;
}

/**
 * Varre os diretórios de log e coleta a 1ª evidência de execução merged por id.
 * Pura em relação ao grafo; IO só de leitura. Retorna:
 *   { evidencias: Map id -> { arquivo, linha }, arquivosLidos: n }
 */
function coletarEvidencias(diretorios) {
  const evidencias = new Map();
  let arquivosLidos = 0;
  for (const dir of diretorios) {
    let entradasDir;
    try {
      entradasDir = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // diretório ausente — o canônico existir é validado no main()
    }
    const arquivos = entradasDir
      .filter((f) => f.isFile() && /\.md$/i.test(f.name))
      .map((f) => f.name)
      .sort();
    for (const nome of arquivos) {
      const caminho = path.join(dir, nome);
      const conteudo = fs.readFileSync(caminho, "utf8");
      arquivosLidos += 1;
      for (const entrada of extrairEntradas(conteudo)) {
        const ids = [...new Set((limparRuidoFormato(entrada.texto).match(RE_ID) || []).map(apararId))];
        if (ids.length === 0) continue;
        const idxEvid = entrada.linhas.findIndex((l) => RE_EVIDENCIA.test(l));
        if (idxEvid === -1) continue; // id sem traço de execução merged
        const relativo = path.relative(REPO_ROOT, caminho).split(path.sep).join("/");
        const linha = entrada.linhaInicio + idxEvid;
        for (const id of ids) {
          if (!evidencias.has(id)) evidencias.set(id, { arquivo: relativo, linha });
        }
      }
    }
  }
  return { evidencias, arquivosLidos };
}

/** Mapa id -> nó do grafo ATIVO (keyframes + sprints + frames). Pura. */
function indexarGrafo(grafo) {
  const nos = new Map();
  for (const colecao of ["keyframes", "sprints", "frames"]) {
    for (const no of (grafo && grafo[colecao]) || []) {
      if (no && no.id) nos.set(no.id, no);
    }
  }
  return nos;
}

/**
 * Aplica a regra da guarda. Pura.
 *   evidências + nó não-🟢 (exceto exceção estruturada — ver header) → achado
 * Menções a ids sem nó no grafo ativo NÃO viram achado (contadas à parte).
 */
function coletarAchados({ nos, evidencias }) {
  const achados = [];
  const excecoes = [];
  let mencoesSemNo = 0;
  for (const [id, evidencia] of [...evidencias.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const no = nos.get(id);
    if (!no) {
      mencoesSemNo += 1;
      continue;
    }
    if (no.estado === "🟢") continue;
    const motivo = temMarcadorExcecao(no);
    if (motivo) {
      excecoes.push({ id, estado: no.estado, motivo });
      continue;
    }
    achados.push({ id, estado: no.estado || "?", ...evidencia });
  }
  return { achados, excecoes, mencoesSemNo };
}

/** Relatório textual (alerta visível, nunca silencioso). Puro. */
function formatarRelatorio({ achados, excecoes, mencoesSemNo, arquivosLidos }) {
  const linhas = [];
  linhas.push("=== guarda flips-pendentes — log executado + código na main + nó não-🟢 (decisão Igor 2026-09-20) ===");
  if (achados.length === 0) {
    linhas.push("Nenhum achado — nenhum frame/sprint com execução merged pendente de flip.");
  }
  for (const a of achados) {
    linhas.push("ACHADO | " + a.id + " | estado: " + a.estado + " | " + a.arquivo + ":" + a.linha);
  }
  for (const e of excecoes) {
    linhas.push("ISENTO  | " + e.id + " | estado: " + e.estado + " | marcador: \"" + e.motivo + "\"");
  }
  linhas.push("");
  linhas.push("Resultado: " + achados.length + " achado(s), " + excecoes.length + " isento(s) por marcador, "
    + mencoesSemNo + " menção(ões) a id sem nó no grafo ativo (fora do escopo da regra), "
    + arquivosLidos + " log(s) varrido(s). Alerta NÃO-bloqueante (exit 0) — veredito e flip são sempre humanos.");
  return linhas.join("\n");
}

function main() {
  // env lido LAZY (na chamada) — mesmo padrão dos irmãos; permite fixture de teste.
  const grafoPath = process.env.LILA_GRAFO_PATH || GRAFO_PATH;
  let grafo;
  try {
    grafo = JSON.parse(fs.readFileSync(grafoPath, "utf8"));
  } catch (err) {
    process.stderr.write("[flips-pendentes] ERRO: grafo ilegível em " + grafoPath + " (" + (err && err.message ? err.message : String(err)) + ") — falha explícita, nunca silenciosa\n");
    return 2;
  }
  const diretorios = process.env.LILA_FLIPS_LOG_DIR ? [process.env.LILA_FLIPS_LOG_DIR] : LOG_DIRS_PADRAO;
  const dirsExistentes = diretorios.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  if (dirsExistentes.length === 0) {
    process.stderr.write("[flips-pendentes] ERRO: nenhum diretório de log encontrado (" + diretorios.join(", ") + ") — falha explícita, nunca silenciosa\n");
    return 2;
  }
  const { evidencias, arquivosLidos } = coletarEvidencias(dirsExistentes);
  const { achados, excecoes, mencoesSemNo } = coletarAchados({ nos: indexarGrafo(grafo), evidencias });
  process.stdout.write(formatarRelatorio({ achados, excecoes, mencoesSemNo, arquivosLidos }) + "\n");
  return 0; // exit 0 SEMPRE com varredura concluída — guarda não-bloqueante por design
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  GRAFO_PATH,
  LOG_DIRS_PADRAO,
  RE_ID,
  RE_EVIDENCIA,
  MARCADORES_EXCECAO,
  extrairEntradas,
  limparRuidoFormato,
  apararId,
  temMarcadorExcecao,
  coletarEvidencias,
  indexarGrafo,
  coletarAchados,
  formatarRelatorio,
  main,
};
