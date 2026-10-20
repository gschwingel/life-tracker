#!/usr/bin/env node
/**
 * scripts/sintese-ledger.cjs
 * Proposito: mutador UNICO do ledger de sintese pendente do fluxo PATCH (F2 do
 * EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922). Todo log E3 de patch gera uma
 * entrada AQUI (F2 — a sintese do patch deixa de ser orfa: ledger + verificador +
 * ritual de consumo no hardening). O script so REGISTRA e MARCA consumo — nunca
 * sintetiza (sintese por LLM e' proibida; o consumo e' humano/estrutural).
 * Entrada: LILA-DEV/execucao/sintese-pendente.json (schema sintese-pendente/v1;
 *          env SINTESE_JSON sobrepoe p/ testes)
 * Saida:   entrada criada/marcada (stdout) + exit code
 * Erros:   exit 0 = sucesso ou idempotencia (patch-id ja registrado / id ja consumido)
 *          exit 1 = falha operacional (ledger ilegivel, id inexistente, log/snapshot ausente)
 *          exit 2 = uso invalido
 * Nota (P1-03 ratificado 2026-09-22): ledger AUSENTE no `registrar` cria o ledger
 * vazio e registra (exit 0) — o bootstrap do mecanismo foi o proprio evento; o
 * fail-closed fica no `consumir` (ledger ausente = exit 1) e no verificar-contratos.
 * Flags:
 *   registrar --patch-id <ID> --area <area> --log <caminho>
 *   consumir  --ids <id1,id2> --por <FRAME-ID> --snapshot <caminho>
 * Testes: scripts/__tests__/sintese-ledger.test.cjs (node --test)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SCHEMA = "sintese-pendente/v1";

function caminhoLedger() {
  return process.env.SINTESE_JSON || path.join(REPO_ROOT, "LILA-DEV", "execucao", "sintese-pendente.json");
}

function imprimeUso() {
  console.log("Uso: node scripts/sintese-ledger.cjs registrar --patch-id <ID> --area <area> --log <caminho>");
  console.log("     node scripts/sintese-ledger.cjs consumir --ids <id1,id2> --por <FRAME-ID> --snapshot <caminho>");
  console.log("  registrar  cria entrada pendente (id SINTESE-YYYYMMDD-NNN; idempotente por patch-id)");
  console.log("  consumir   marca status consumida + consumidaEm + consumidaPor + consumidaSnapshot");
  console.log("Exit: 0 = sucesso/idempotente | 1 = falha operacional | 2 = uso invalido");
}

/** Data local em YYYY-MM-DD (mesmo formato do ledger de dividas). */
function hojeISO(agora) {
  const d = agora || new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Proximo id do dia: SINTESE-YYYYMMDD-NNN (NNN = maior existente + 1). */
function gerarId(entradas, data) {
  const prefixo = "SINTESE-" + data.replace(/-/g, "") + "-";
  let maior = 0;
  for (const e of entradas || []) {
    const id = String((e && e.id) || "");
    if (!id.startsWith(prefixo)) continue;
    const n = parseInt(id.slice(prefixo.length), 10);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return prefixo + String(maior + 1).padStart(3, "0");
}

/** Le o ledger. Nunca lanca: { ok, entradas } ou { ok:false, motivo }. */
function carregar(caminho) {
  const alvo = caminho || caminhoLedger();
  if (!fs.existsSync(alvo)) return { ok: false, motivo: "ledger ausente", caminho: alvo, entradas: [] };
  let json;
  try {
    json = JSON.parse(fs.readFileSync(alvo, "utf8"));
  } catch (e) {
    return { ok: false, motivo: `ledger ilegivel (${e.message})`, caminho: alvo, entradas: [] };
  }
  if (!json || !Array.isArray(json.entradas)) {
    return { ok: false, motivo: `ledger sem campo 'entradas' (schema ${SCHEMA})`, caminho: alvo, entradas: [] };
  }
  return { ok: true, caminho: alvo, ledger: json, entradas: json.entradas };
}

/** Grava o ledger preservando o schema e o restante do documento. */
function escrever(caminho, ledger) {
  fs.writeFileSync(caminho, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

/** Ledger vazio no schema canonico (uso interno do registrar). */
function ledgerVazio() {
  return { schema: SCHEMA, entradas: [] };
}

// ── Mutacoes (registrar | consumir) ─────────────────────────────────────────

/**
 * registrar: append de entrada pendente. Idempotente por patch-id.
 * Ledger ausente -> cria vazio e registra (P1-03 (a), ratificado 2026-09-22).
 */
function registrar({ patchId, area, log }, { caminho, agora, logExiste } = {}) {
  const alvo = caminho || caminhoLedger();
  const existente = carregar(alvo);
  if (!existente.ok && existente.motivo !== "ledger ausente") {
    return { exit: 1, mensagem: `🔴 sintese-ledger — ${existente.motivo}` };
  }
  const ledger = existente.ok ? existente.ledger : ledgerVazio();
  const entradas = Array.isArray(ledger.entradas) ? ledger.entradas : [];

  const jaRegistrado = entradas.find((e) => e && e.patchId === patchId);
  if (jaRegistrado) {
    return {
      exit: 0,
      id: jaRegistrado.id,
      mensagem: `✅ sintese-ledger — patch-id '${patchId}' ja registrado (id ${jaRegistrado.id}) — idempotente, nada a fazer.`,
    };
  }

  const checarLog = logExiste || ((p) => fs.existsSync(path.resolve(REPO_ROOT, p)));
  if (!checarLog(log)) {
    return {
      exit: 1,
      mensagem: `🔴 sintese-ledger — log informado nao existe: ${log} (evidencia obrigatoria do registro)`,
    };
  }

  const data = hojeISO(agora);
  const entrada = {
    id: gerarId(entradas, data),
    patchId,
    area,
    logPath: String(log).replace(/\\/g, "/"),
    data,
    status: "pendente",
    consumidaEm: null,
    consumidaPor: null,
  };
  entradas.push(entrada);
  ledger.schema = ledger.schema || SCHEMA;
  ledger.entradas = entradas;
  try {
    escrever(alvo, ledger);
  } catch (e) {
    return { exit: 1, mensagem: `🔴 sintese-ledger — falha ao gravar ${alvo}: ${e.message}` };
  }
  return {
    exit: 0,
    id: entrada.id,
    mensagem: `✅ sintese-ledger — registrado ${entrada.id} | patch ${patchId} | area ${area} | log ${entrada.logPath}`,
  };
}

/** consumir: marca entradas como consumidas (append-only de fato — nunca remove). */
function consumir({ ids, por, snapshot }, { caminho, agora, snapshotExiste } = {}) {
  const alvo = caminho || caminhoLedger();
  const lido = carregar(alvo);
  if (!lido.ok) {
    return { exit: 1, mensagem: `🔴 sintese-ledger — ${lido.motivo}: ${alvo} (nada a consumir)` };
  }
  const checarSnapshot = snapshotExiste || ((p) => fs.existsSync(path.resolve(REPO_ROOT, p)));
  if (!checarSnapshot(snapshot)) {
    return {
      exit: 1,
      mensagem: `🔴 sintese-ledger — snapshot informado nao existe: ${snapshot} (evidencia obrigatoria do consumo)`,
    };
  }

  const faltantes = ids.filter((id) => !lido.entradas.some((e) => e && e.id === id));
  if (faltantes.length > 0) {
    return { exit: 1, mensagem: `🔴 sintese-ledger — id(s) inexistente(s) no ledger: ${faltantes.join(", ")}` };
  }

  const data = hojeISO(agora);
  const snapshotNorm = String(snapshot).replace(/\\/g, "/");
  const marcadas = [];
  const jaConsumidas = [];
  for (const id of ids) {
    // Defensivo contra ID DUPLICADO no ledger (colisao entre sessoes concorrentes
    // no mesmo dia — caso real SINTESE-20261008-001, 2 patches, 1 id): consome
    // TODAS as entradas com o id. Com `find` (so a 1a), a duplicata ficava presa
    // em "pendente" para sempre — a 1a ocorrencia ja consumida curto-circuitava
    // o id e o script reportava "idempotente" sem consumir o resto.
    const entradasDoId = lido.entradas.filter((e) => e && e.id === id);
    const pendentes = entradasDoId.filter((e) => e.status !== "consumida");
    if (pendentes.length === 0) {
      jaConsumidas.push(id);
      continue;
    }
    for (const entrada of pendentes) {
      entrada.status = "consumida";
      entrada.consumidaEm = data;
      entrada.consumidaPor = por;
      entrada.consumidaSnapshot = snapshotNorm;
    }
    marcadas.push(id);
  }
  lido.ledger.entradas = lido.entradas;
  try {
    escrever(alvo, lido.ledger);
  } catch (e) {
    return { exit: 1, mensagem: `🔴 sintese-ledger — falha ao gravar ${alvo}: ${e.message}` };
  }

  const partes = [];
  if (marcadas.length > 0) partes.push(`consumida(s): ${marcadas.join(", ")} (por ${por}, em ${data})`);
  if (jaConsumidas.length > 0) partes.push(`ja consumida(s) antes: ${jaConsumidas.join(", ")} (idempotente)`);
  return {
    exit: 0,
    id: marcadas[0] || null,
    mensagem: `✅ sintese-ledger — ${partes.join(" | ")} | snapshot ${snapshotNorm}`,
  };
}

function valor(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !String(args[i + 1]).startsWith("--") ? args[i + 1] : null;
}

/** Imprime a mensagem no canal do exit code (sucesso = stdout, falha = stderr). */
function saida(resultado) {
  if (resultado.exit === 0) console.log(resultado.mensagem);
  else console.error(resultado.mensagem);
  return resultado.exit;
}

function main(argv) {
  const args = argv === undefined ? process.argv.slice(2) : argv;
  if (args.includes("--help") || args.includes("-h")) {
    imprimeUso();
    return 0;
  }
  const sub = args.find((a) => !a.startsWith("--"));
  if (!sub) {
    console.error("🔴 sintese-ledger — uso invalido: informe 'registrar' ou 'consumir'");
    imprimeUso();
    return 2;
  }

  if (sub === "registrar") {
    const patchId = valor(args, "--patch-id");
    const area = valor(args, "--area");
    const log = valor(args, "--log");
    if (!patchId || !area || !log) {
      console.error("🔴 sintese-ledger — uso invalido: registrar exige --patch-id <ID> --area <area> --log <caminho>");
      imprimeUso();
      return 2;
    }
    return saida(registrar({ patchId, area, log }));
  }

  if (sub === "consumir") {
    const raw = valor(args, "--ids");
    const por = valor(args, "--por");
    const snapshot = valor(args, "--snapshot");
    const ids = raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];
    if (ids.length === 0 || !por || !snapshot) {
      console.error(
        "🔴 sintese-ledger — uso invalido: consumir exige --ids <id1,id2> --por <FRAME-ID> --snapshot <caminho>",
      );
      imprimeUso();
      return 2;
    }
    return saida(consumir({ ids, por, snapshot }));
  }

  console.error(`🔴 sintese-ledger — subcomando desconhecido: ${sub} (use registrar | consumir)`);
  imprimeUso();
  return 2;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  REPO_ROOT,
  SCHEMA,
  caminhoLedger,
  hojeISO,
  gerarId,
  carregar,
  escrever,
  ledgerVazio,
  registrar,
  consumir,
  main,
};

