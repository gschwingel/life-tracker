#!/usr/bin/env node
// lila-grafo-mcp.cjs — MCP server (stdio) para leitura e mutação ESTRUTURADA do
// grafo LILA (grafo.json + grafo-historico.json + decisoes-ledger.json).
//
// Propósito: substituir a edição manual/100% IA do grafo.json por operações
// atômicas validadas (voto do Evento "MCP grafo + ledger", 2026-08-27). NÃO usa
// LLM — JSON canônico exige determinismo (integridade referencial, E-INV-01/02).
//
// Tools (5):
//   read_units     — consulta o ledger de decisões (filtros: node, status)
//   deprecate_unit — marca uma unidade como deprecated (id, substituidoPor?, motivo, evidencia)
//   register_unit  — registra unidade nova com ID estável alinhado ao snapshot
//   read_node      — lê um nó de grafo.json ou grafo-historico.json
//   update_node    — mutação estruturada de nó (whitelist de campos, refs validadas)
//
// Padrão: fachada fina (WET > DRY, mesmo dispatcher JSON-RPC do lila-estado-mcp).
// Reutiliza os exports puros de grafo-normalize.cjs (módulo, sem efeito colateral).
// Env (testes): LILA_GRAFO_ROOT (DEPRECATED — fallback 3 da cadeia de root;
//               ver resolveRoot() abaixo) | LILA_GRAFO_LEDGER | LILA_GRAFO_PATH |
//               LILA_GRAFO_HISTORICO
// Exit: servidor roda até SIGINT/SIGTERM; erros de tool viram isError (nunca crash).

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
  extrairUnidades, normalizarTexto
} = require("./grafo-normalize.cjs");

// ── Resolucao do workspace root (LAZY — por chamada, cadeia git-aware) ───────
// Cadeia de precedencia (PROMPT-MCP-AUTOROOT-20260911 / F1):
//   1. LILA_WORKSPACE_ROOT         override explicito de sessao (nome canonico)
//   2. git toplevel do CWD herdado (`git rev-parse --show-toplevel`)
//   3. LILA_GRAFO_ROOT             LEGADO — DEPRECATED, somente compat de leitura
//   4. __dirname/..                instalacao in-repo (comportamento historico)
// Projetos conhecidos pinam o root na definicao do servidor (LILA_WORKSPACE_ROOT,
// MULTIPROJETO 12/09 — fronteira e o ROOT, nao a copia do script); a cadeia
// CWD-based abaixo permanece como fallback para worktree ad-hoc.
// Nunca lanca para o chamador: falha/empty simplesmente desce a cadeia.
// Log de resolucao vai para STDERR (stdout e o canal do protocolo JSON-RPC).
function gitToplevel(cwd) {
  try {
    const out = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 2000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
    if (!out || out.error || out.status !== 0) return null;
    const linha = String(out.stdout || "").split(/\r?\n/)[0].trim();
    return linha || null;
  } catch {
    return null;
  }
}

function resolveRootDetailed() {
  let root = process.env.LILA_WORKSPACE_ROOT;
  let via = "LILA_WORKSPACE_ROOT";
  if (!root) { root = gitToplevel(process.cwd()); via = "git-toplevel"; }
  if (!root) { root = process.env.LILA_GRAFO_ROOT; via = "LILA_GRAFO_ROOT(deprecated)"; }
  if (!root) { root = path.resolve(__dirname, ".."); via = "__dirname"; }
  process.stderr.write(`[mcp-root] resolved=${root} via=${via}\n`);
  return { root, via };
}

function resolveRoot() {
  return resolveRootDetailed().root;
}

// Contexto anunciado no inicio de cada resposta (initialize + tools/call): o
// modelo ve para onde o servidor aponta antes de consumir/executar.
function workspaceContext() {
  const detalhe = resolveRootDetailed();
  return { workspaceRoot: detalhe.root, workspaceRootVia: detalhe.via };
}

function comContextoWorkspace(resultado) {
  const ctx = workspaceContext();
  if (resultado && typeof resultado === "object" && !Array.isArray(resultado)) {
    return { workspaceRoot: ctx.workspaceRoot, workspaceRootVia: ctx.workspaceRootVia, ...resultado };
  }
  return { workspaceRoot: ctx.workspaceRoot, workspaceRootVia: ctx.workspaceRootVia, resultado };
}

// ── Caminhos (resolução LAZY — env lido na chamada, p/ testes) ────────────────

function caminhos() {
  const root = resolveRoot();
  return {
    root,
    ledger: process.env.LILA_GRAFO_LEDGER || path.join(root, "LILA-DEV", "planejamento", "decisoes-ledger.json"),
    atual: process.env.LILA_GRAFO_PATH || path.join(root, "LILA-DEV", "planejamento", "grafo.json"),
    historico: process.env.LILA_GRAFO_HISTORICO || path.join(root, "LILA-DEV", "planejamento", "grafo-historico.json")
  };
}

// Régua canônica do farol (evento deliberado 2026-09-06 — ciclo de vida unidirecional):
//   🟢 executado e finalizado (com rastro: log de execução, referências resolvendo, código vivo)
//   🟡 planejado e pronto para execução (planejamento completo e confirmado)
//   🔴 não aprovado para execução (default de nó novo — sem planejamento completo ou dependente de nó não 🟢)
//   🟣 desbloqueado para revalidação (dependência concluiu — revalidar antes de 🟡)
const ESTADOS_VALIDOS = new Set(["🟢", "🟡", "🔴", "🟣"]);
const CAMPOS_NODE = new Set(["estado", "nota", "titulo", "area_tatica", "colapsado", "ordem_execucao", "pai", "depende_de", "desbloqueia", "frames_negocio", "delegacoes_tecnicas", "codigo", "deprecated", "snapshot", "log_execucao"]);
// FR-GRAFO-T8A (A9): campos estruturais com validação de payload (ids devem
// resolver no universo consolidado; frames_negocio exige prefixo FR-).
// FR-GRAFO-T8B: delegacoes_tecnicas entra na whitelist para o fix A4 (limpeza
// dos ids deslocados) — array de strings livre (prosa técnica/ids), sem exigência
// de resolução nem de prefixo.
const CAMPOS_ESTRUTURAIS = ["pai", "depende_de", "desbloqueia", "frames_negocio", "delegacoes_tecnicas", "codigo"];

function carregarJson(caminho) {
  return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

/** Localiza um nó nos dois grafos. Retorna {node, grafo, colecao} | null. */
function acharNo(id) {
  const c = caminhos();
  for (const grafo of ["atual", "historico"]) {
    const g = carregarJson(c[grafo]);
    for (const colecao of ["keyframes", "sprints", "frames"]) {
      const node = (g[colecao] || []).find((n) => n && n.id === id);
      if (node) return { node, grafo, colecao, grafoObj: g };
    }
  }
  return null;
}

function salvarSeMudou(caminho, obj) {
  const serializado = JSON.stringify(obj, null, 2) + "\n";
  if (!fs.existsSync(caminho) || fs.readFileSync(caminho, "utf8") !== serializado) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, serializado, "utf8");
    return true;
  }
  return false;
}

// ── Tools ─────────────────────────────────────────────────────────────────────

/** read_units: consulta o ledger. Filtros: node, status ("ativa"|"deprecated"|null). */
function readUnits(args) {
  const c = caminhos();
  if (!fs.existsSync(c.ledger)) {
    return { ok: true, unidades: [], total: 0, nota: "ledger ausente — rode grafo-normalize --apply" };
  }
  const ledger = carregarJson(c.ledger);
  let unidades = ledger.unidades || [];
  if (args.node) unidades = unidades.filter((u) => u.node === args.node);
  if (args.status) unidades = unidades.filter((u) => u.status === args.status);
  return {
    ok: true, total: unidades.length,
    unidades: unidades.map((u) => ({
      id: u.id, node: u.node, grafo: u.grafo, tipo: u.tipo, granularidade: u.granularidade,
      texto: u.texto, status: u.status,
      deprecated: u.deprecated ? { em: u.deprecated.em, substituidoPor: u.deprecated.substituidoPor, motivo: u.deprecated.motivo } : null,
      revisao: u.revisao || null
    }))
  };
}

/**
 * deprecate_unit: marca unidade ativa como deprecated no ledger.
 * substituidoPor opcional: id de unidade do ledger OU id de nó em qualquer grafo.
 */
function deprecateUnit(args) {
  const c = caminhos();
  if (!args.id) return { ok: false, error: "id obrigatório (ex.: KF-03.U1)" };
  if (!["contradicao", "remocao"].includes(args.motivo)) {
    return { ok: false, error: 'motivo deve ser "contradicao"|"remocao"' };
  }
  if (!fs.existsSync(c.ledger)) return { ok: false, error: "ledger ausente: " + c.ledger };
  const ledger = carregarJson(c.ledger);
  const un = (ledger.unidades || []).find((u) => u.id === args.id);
  if (!un) return { ok: false, error: "unidade não encontrada no ledger: " + args.id };
  if (un.status === "deprecated") return { ok: false, error: "unidade já está deprecated: " + args.id + " (em " + un.deprecated.em + ")" };

  let substituidoPor = null;
  if (args.substituidoPor) {
    const alvoUnidade = (ledger.unidades || []).some((u) => u.id === args.substituidoPor);
    const alvoNo = acharNo(args.substituidoPor);
    if (!alvoUnidade && !alvoNo) {
      return { ok: false, error: "substituidoPor não resolve para unidade nem nó: " + args.substituidoPor };
    }
    substituidoPor = args.substituidoPor;
  }
  un.status = "deprecated";
  un.deprecated = {
    em: args.em || new Date().toISOString().slice(0, 10),
    substituidoPor, motivo: args.motivo,
    evidencia: args.evidencia || null, fonte: "lila-grafo-mcp"
  };
  fs.writeFileSync(c.ledger, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  return { ok: true, id: un.id, status: un.status, deprecated: un.deprecated };
}

/**
 * register_unit: registra unidade nova com ID estável.
 * ID alinhado à extração do snapshot (texto idêntico → ID da extração; senão, próximo índice livre).
 */
function registerUnit(args) {
  const c = caminhos();
  if (!args.node || !args.texto || !String(args.texto).trim()) return { ok: false, error: "node e texto são obrigatórios" };
  if (!["decisao", "comportamento"].includes(args.tipo)) return { ok: false, error: 'tipo deve ser "decisao"|"comportamento"' };
  const achou = acharNo(args.node);
  if (!achou) return { ok: false, error: "nó não encontrado nos grafos: " + args.node };
  const rel = achou.node.snapshot;
  if (!rel) return { ok: false, error: "nó sem snapshot declarado: " + args.node };
  const abs = path.isAbsolute(rel) ? rel : path.join(c.root, rel);
  if (!fs.existsSync(abs)) return { ok: false, error: "snapshot ausente: " + rel };

  const ledger = fs.existsSync(c.ledger) ? carregarJson(c.ledger) : { schema: "v1", geradoEm: new Date().toISOString(), resumo: {}, unidades: [], nodos: [] };
  ledger.unidades = ledger.unidades || [];
  const textoNorm = normalizarTexto(args.texto).replace(/\s+/g, " ").trim();
  const dupTexto = ledger.unidades.find((u) => u.node === args.node && u.texto.replace(/\s+/g, " ").trim() === textoNorm);
  if (dupTexto) return { ok: false, error: "unidade duplicada (texto idêntico já no ledger): " + dupTexto.id };

  const extraidas = extrairUnidades(fs.readFileSync(abs, "utf8"), args.node).unidades;
  const alvo = extraidas.find((u) => u.texto === textoNorm);
  let id;
  if (alvo) {
    id = alvo.id;
  } else {
    const doNo = ledger.unidades.filter((u) => u.node === args.node)
      .map((u) => parseInt(String(u.id).split(".U")[1], 10)).filter(Number.isFinite);
    const idx = Math.max(extraidas.length, ...doNo, 0) + 1;
    id = args.node + ".U" + idx;
  }
  if (ledger.unidades.some((u) => u.id === id)) return { ok: false, error: "id já existe no ledger: " + id };

  const un = {
    id, node: args.node, grafo: achou.grafo, nivel: achou.nivel,
    snapshot: rel, tipo: args.tipo, granularidade: alvo ? alvo.granularidade : "bullet",
    texto: textoNorm, tomadaPor: args.tomadaPor || null, data: args.data || null,
    status: "ativa", deprecated: null, revisao: null
  };
  ledger.unidades.push(un);
  ledger.geradoEm = new Date().toISOString();
  ledger.resumo = { unidades: ledger.unidades.length, deprecated: ledger.unidades.filter((u) => u.status === "deprecated").length, nodos: (ledger.nodos || []).length };
  fs.writeFileSync(c.ledger, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  return { ok: true, id, alinhadoAoSnapshot: !!alvo, unidade: un };
}

/** read_node: lê um nó de qualquer grafo (com status derivado dos campos estruturados + ledger). */
function readNode(args) {
  if (!args.id) return { ok: false, error: "id obrigatório" };
  const achou = acharNo(args.id);
  if (!achou) return { ok: false, error: "nó não encontrado nos grafos: " + args.id };
  const { node, grafo, colecao } = achou;
  const c = caminhos();
  let unidadesNo = [];
  if (fs.existsSync(c.ledger)) {
    unidadesNo = (carregarJson(c.ledger).unidades || []).filter((u) => u.node === args.id);
  }
  const ativas = unidadesNo.filter((u) => u.status === "ativa").length;
  const deprecadas = unidadesNo.filter((u) => u.status === "deprecated").length;
  // Fonte primária: campos estruturados escritos pelo grafo-normalize (cobrem o
  // snapshot inteiro). Ledger é complemento — pode conter só o subconjunto proposto.
  let statusDocumento;
  if (node.deprecated) statusDocumento = "morre";
  else if (node.decisoes_deprecated) statusDocumento = "parcial";
  else if (unidadesNo.length) statusDocumento = deprecadas === unidadesNo.length ? "morre" : "parcial";
  else statusDocumento = "sem-unidades-no-ledger";
  return {
    ok: true, id: args.id, grafo, colecao, node,
    ledger: { unidades: unidadesNo.length, ativas, deprecadas, statusDocumento }
  };
}

/**
 * update_node: mutação estruturada com whitelist de campos e validação de estado.
 * fields permitidos: estado, nota, titulo, area_tatica, colapsado, ordem_execucao.
 */
function updateNode(args) {
  if (!args.id) return { ok: false, error: "id obrigatório" };
  if (typeof args.fields !== "object" || args.fields === null || Array.isArray(args.fields)) {
    return { ok: false, error: "fields deve ser um objeto" };
  }
  const ilegais = Object.keys(args.fields).filter((k) => !CAMPOS_NODE.has(k));
  if (ilegais.length) return { ok: false, error: "campos fora da whitelist: " + ilegais.join(", ") + " (permitidos: " + [...CAMPOS_NODE].join(", ") + ")" };
  if (args.fields.estado !== undefined && !ESTADOS_VALIDOS.has(args.fields.estado)) {
    return { ok: false, error: "estado inválido (régua: 🟢 executado e finalizado | 🟡 planejado e pronto | 🔴 não aprovado | 🟣 revalidação)" };
  }
  // FR-GRAFO-T8A (A9): validação dos campos estruturais — ids resolvíveis no
  // universo consolidado (dual-universe do acharNo); frames_negocio exige FR-.
  for (const campo of CAMPOS_ESTRUTURAIS) {
    const v = args.fields[campo];
    if (v === undefined) continue;
    if (campo === "pai") {
      if (typeof v !== "string" || !v.trim()) return { ok: false, error: "pai deve ser string não vazia" };
      if (!acharNo(v)) return { ok: false, error: "pai não resolvível no universo consolidado: " + v };
      continue;
    }
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !x.trim())) {
      return { ok: false, error: campo + " deve ser array de strings não vazias" };
    }
    if (campo === "delegacoes_tecnicas") continue; // prosa técnica/ids — sem resolução nem prefixo
    if (campo === "codigo") continue; // declaração de implementação — validação de FORMA apenas (o caminho pode ter sido removido; existência é job do checker T5)
    for (const id of v) {
      if (campo === "frames_negocio" && !id.startsWith("FR-")) {
        return { ok: false, error: "frames_negocio exige prefixo FR- em todo id: " + id };
      }
      if (!acharNo(id)) return { ok: false, error: campo + " aponta para id não resolvível no universo consolidado: " + id };
    }
  }
  // FR-GRAFO (veredito humano 2026-09-06 — snapshot retroativo): snapshot e
  // log_execucao são strings não vazias; validação de FORMA apenas — existência em
  // disco é verificada pelos validadores/gates (padrão do campo codigo). snapshot:
  // caminho do doc de planejamento (1:1 nó↔doc). log_execucao: arquivo de log que
  // cobre a execução (fonte primária do validar-integridade — permite rastro
  // agregado de sprint para frames executados sob o log do pai).
  for (const campo of ["snapshot", "log_execucao"]) {
    const v = args.fields[campo];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" || !v.trim()) {
      return { ok: false, error: campo + " deve ser string não vazia (use null para remover)" };
    }
  }
  // FR-GRAFO (veredito humano 2026-08-31): deprecated é marcador de morte de nó —
  // exige evidência do veredito humano e segue a disciplina do deprecate_unit.
  if (args.fields.deprecated !== undefined) {
    const d = args.fields.deprecated;
    if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, error: "deprecated deve ser um objeto { em, motivo, substituido_por, evidencia, fonte }" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.em || "")) return { ok: false, error: "deprecated.em deve ser YYYY-MM-DD" };
    if (!["contradicao", "remocao"].includes(d.motivo)) return { ok: false, error: 'deprecated.motivo deve ser "contradicao"|"remocao"' };
    if (typeof d.evidencia !== "string" || !d.evidencia.trim()) return { ok: false, error: "deprecated.evidencia é obrigatório (veredito humano rastreável)" };
    if (d.substituido_por != null && !acharNo(d.substituido_por)) return { ok: false, error: "deprecated.substituido_por não resolvível no universo consolidado: " + d.substituido_por };
  }
  const achou = acharNo(args.id);
  if (!achou) return { ok: false, error: "nó não encontrado nos grafos: " + args.id };
  // Freeze guard (FR-GRAFO-T1 / achado A1): grafo-historico.json é fóssil por
  // design. Gravação só com overrideFrozen explícito, sempre logada no output.
  if (achou.grafo === "historico" && args.overrideFrozen !== true) {
    return {
      ok: false,
      errorCode: "GRAPH_FROZEN",
      error: "GRAPH_FROZEN: nó pertence ao grafo congelado (grafo-historico.json): " + args.id + " — gravação negada; use overrideFrozen: true para autorizar explicitamente",
      message: "GRAPH_FROZEN: nó " + args.id + " está no grafo congelado (grafo-historico.json); gravação negada",
      id: args.id,
      grafo: achou.grafo
    };
  }
  const antes = {};
  for (const k of Object.keys(args.fields)) antes[k] = achou.node[k] === undefined ? null : achou.node[k];
  for (const [k, v] of Object.entries(args.fields)) achou.node[k] = v;
  const c = caminhos();
  const mudou = salvarSeMudou(c[achou.grafo], achou.grafoObj);
  const resultado = { ok: true, id: args.id, grafo: achou.grafo, antes, depois: args.fields, gravado: mudou };
  if (achou.grafo === "historico") {
    resultado.overrideFrozenLog = { em: new Date().toISOString(), id: args.id, grafo: achou.grafo, fields: args.fields, aviso: "overrideFrozen:true — gravação autorizada explicitamente em grafo congelado" };
  }
  return resultado;
}

// ── create_nodes: criação estruturada de nós no grafo ATIVO ──────────────────
// Whitelist de nível → coleção. Nível define a coleção de destino; sprint/frame
// exigem pai existente (keyframe/sprint respectivamente) no grafo ativo ou no
// mesmo lote. Colisão de id é checada contra o universo consolidado (ativo +
// histórico) — namespace único é invariante do resolvedor dual-universe.

const NIVEIS_COLECAO = { keyframe: "keyframes", sprint: "sprints", frame: "frames" };

function createNodes(args) {
  if (!Array.isArray(args.nodes) || args.nodes.length === 0) {
    return { ok: false, error: "nodes deve ser um array não vazio" };
  }
  const c = caminhos();
  const g = carregarJson(c.atual);
  // Universo consolidado em memória (mesma semântica dual-universe do acharNo).
  const existentes = new Set();
  for (const gc of [g, carregarJson(c.historico)]) {
    for (const colecao of ["keyframes", "sprints", "frames"]) {
      for (const n of gc[colecao] || []) if (n && n.id) existentes.add(n.id);
    }
  }
  const criados = [];
  for (const spec of args.nodes) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      return { ok: false, error: "cada item de nodes deve ser um objeto" };
    }
    const { id, nivel, pai, estado, snapshot, titulo, area_tatica, depende_de, desbloqueia } = spec;
    if (!id) return { ok: false, error: "id obrigatório" };
    if (!NIVEIS_COLECAO[nivel]) return { ok: false, error: 'nivel deve ser "keyframe"|"sprint"|"frame": ' + id };
    if (existentes.has(id)) return { ok: false, error: "id já existe no universo consolidado (ativo + histórico): " + id };
    if (nivel !== "keyframe" && !pai) return { ok: false, error: "sprint/frame exige pai: " + id };
    if (pai) {
      const colecaoPai = NIVEIS_COLECAO[nivel === "sprint" ? "keyframe" : "sprint"];
      const paiNo = (g[colecaoPai] || []).find((n) => n && n.id === pai) || criados.find((n) => n.id === pai);
      if (!paiNo) return { ok: false, error: "pai não encontrado no grafo ativo ou no lote (" + colecaoPai + "): " + pai };
    }
    if (estado !== undefined && !ESTADOS_VALIDOS.has(estado)) {
      return { ok: false, error: "estado inválido (régua: 🟢 executado e finalizado | 🟡 planejado e pronto | 🔴 não aprovado | 🟣 revalidação): " + id };
    }
    if (snapshot !== undefined && (typeof snapshot !== "string" || !snapshot.trim())) {
      return { ok: false, error: "snapshot, quando presente, deve ser caminho não vazio: " + id };
    }
    for (const [campo, lista] of [["depende_de", depende_de], ["desbloqueia", desbloqueia]]) {
      if (lista === undefined) continue;
      if (!Array.isArray(lista) || lista.some((x) => typeof x !== "string")) {
        return { ok: false, error: campo + " deve ser array de strings: " + id };
      }
      for (const alvo of lista) {
        if (!existentes.has(alvo)) {
          return { ok: false, error: campo + " aponta para id não resolvível no universo consolidado nem no lote: " + alvo + " (em " + id + ")" };
        }
      }
    }
    // default determinístico 🔴 — não aprovado para execução (régua canônica do farol, evento 2026-09-06)
    const node = { id, estado: estado || "🔴", snapshot: snapshot === undefined ? null : snapshot };
    if (pai !== undefined) node.pai = pai;
    if (titulo !== undefined) node.titulo = titulo;
    if (area_tatica !== undefined) node.area_tatica = area_tatica;
    if (depende_de !== undefined) node.depende_de = depende_de;
    if (desbloqueia !== undefined) node.desbloqueia = desbloqueia;
    g[NIVEIS_COLECAO[nivel]].push(node);
    existentes.add(id);
    criados.push({ id, nivel, colecao: NIVEIS_COLECAO[nivel] });
  }
  const gravado = salvarSeMudou(c.atual, g);
  return { ok: true, criados, gravado };
}

// ── Tools (schema MCP) ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "read_units",
    description: "Consulta o ledger de decisões (decisoes-ledger.json). Filtros: node, status (\"ativa\"|\"deprecated\"). Sem side effects.",
    inputSchema: { type: "object", properties: { node: { type: "string" }, status: { type: "string", enum: ["ativa", "deprecated"] } } }
  },
  {
    name: "deprecate_unit",
    description: "Marca uma unidade ATIVA como deprecated no ledger. Args: id, motivo (\"contradicao\"|\"remocao\"), substituidoPor? (id de unidade ou de nó, validado), evidencia?, em?.",
    inputSchema: { type: "object", required: ["id", "motivo"], properties: {
      id: { type: "string" }, motivo: { type: "string", enum: ["contradicao", "remocao"] },
      substituidoPor: { type: "string" }, evidencia: { type: "string" }, em: { type: "string" }
    } }
  },
  {
    name: "register_unit",
    description: "Registra unidade nova (decisao|comportamento) no ledger com ID estável alinhado à extração do snapshot do nó. Args: node, tipo, texto, tomadaPor?, data?.",
    inputSchema: { type: "object", required: ["node", "tipo", "texto"], properties: {
      node: { type: "string" }, tipo: { type: "string", enum: ["decisao", "comportamento"] },
      texto: { type: "string" }, tomadaPor: { type: "string" }, data: { type: "string" }
    } }
  },
  {
    name: "read_node",
    description: "Lê um nó (keyframe/sprint/frame) de grafo.json ou grafo-historico.json + status derivado do ledger (ativas/deprecadas, morte de documento). Sem side effects.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } }
  },
  {
    name: "create_nodes",
    description: "Cria nós (keyframe|sprint|frame) no grafo ATIVO. Args: nodes: [{id, nivel, pai?, estado?, snapshot?, titulo?, area_tatica?, depende_de?, desbloqueia?}]. Valida colisão de id no universo consolidado (ativo + histórico), pai existente no grafo ativo ou no lote, estados válidos e ids de depende_de/desbloqueia resolvíveis. Idempotente: rejeita id duplicado.",
    inputSchema: { type: "object", required: ["nodes"], properties: {
      nodes: { type: "array", items: { type: "object", required: ["id", "nivel"], properties: {
        id: { type: "string" }, nivel: { type: "string", enum: ["keyframe", "sprint", "frame"] },
        pai: { type: "string" }, estado: { type: "string" }, snapshot: { type: "string" },
        titulo: { type: "string" }, area_tatica: { type: "string" },
        depende_de: { type: "array", items: { type: "string" } },
        desbloqueia: { type: "array", items: { type: "string" } }
      } } }
    } }
  },
  {
    name: "update_node",
    description: "Mutação estruturada de nó com whitelist (estado, nota, titulo, area_tatica, colapsado, ordem_execucao + campos estruturais pai, depende_de, desbloqueia, frames_negocio com validação de ids). Grava somente o grafo do nó, só se mudar.",
    inputSchema: { type: "object", required: ["id", "fields"], properties: {
      id: { type: "string" },
      overrideFrozen: { type: "boolean", description: "Autoriza gravação em grafo congelado (historico) — sempre logada no output" },
      fields: { type: "object", properties: {
        estado: { type: "string" }, nota: { type: "string" }, titulo: { type: "string" },
        area_tatica: { type: "string" }, colapsado: { type: "boolean" }, ordem_execucao: { type: "string" },
        pai: { type: "string" },
        depende_de: { type: "array", items: { type: "string" } },
        desbloqueia: { type: "array", items: { type: "string" } },
        frames_negocio: { type: "array", items: { type: "string" } },
        delegacoes_tecnicas: { type: "array", items: { type: "string" } },
        codigo: { type: "array", items: { type: "string" }, description: "Declaração de implementação: caminho ou caminho#simbolo" },
        deprecated: { type: "object", description: "Marcador de morte de nó — exige evidencia do veredito humano" }
      } }
    } }
  }
];

// S7 (2026-09-06): fingerprint do código no handshake — permite à IA detectar server
// stale (código alterado no repo mas MCP não reiniciado) comparando com o arquivo.
const CODIGO_FINGERPRINT = (() => {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(__filename, "utf8")).digest("hex").slice(0, 16);
  } catch {
    return "indisponivel";
  }
})();

// ── Dispatcher JSON-RPC (mesmo padrão do lila-estado-mcp) ─────

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
  function respond(id, result) { send({ jsonrpc: "2.0", id, result }); }
  function fail(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

  rl.on("line", (line) => {
    let req;
    try { req = JSON.parse(line); } catch { return; }
    const { id, method, params } = req;
    try {
      switch (method) {
        case "initialize":
          respond(id, { protocolVersion: (params && params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lila-grafo-mcp", version: "0.2.0" }, serverFingerprint: CODIGO_FINGERPRINT, ...workspaceContext() });
          break;
        case "notifications/initialized":
        case "notifications/cancelled":
          break;
        case "ping":
          respond(id, {});
          break;
        case "tools/list":
          respond(id, { tools: TOOLS });
          break;
        case "tools/call": {
          const name = params && params.name;
          const args = (params && params.arguments) || {};
          if (typeof args !== "object" || args === null || Array.isArray(args)) {
            respond(id, { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "arguments deve ser um objeto" }) }], isError: true });
            break;
          }
          let result;
          if (name === "read_units") result = readUnits(args);
          else if (name === "deprecate_unit") result = deprecateUnit(args);
          else if (name === "register_unit") result = registerUnit(args);
          else if (name === "read_node") result = readNode(args);
          else if (name === "update_node") result = updateNode(args);
          else if (name === "create_nodes") result = createNodes(args);
          else { fail(id, -32601, "Unknown tool: " + name); break; }
          respond(id, { content: [{ type: "text", text: JSON.stringify(comContextoWorkspace(result)) }], isError: result && result.ok === false });
          break;
        }
        default:
          fail(id, -32601, "Method not found: " + method);
      }
    } catch (err) {
      fail(id, -32603, String(err && err.message ? err.message : err));
    }
  });

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

module.exports = { readUnits, deprecateUnit, registerUnit, readNode, updateNode, createNodes, acharNo, caminhos, salvarSeMudou, resolveRoot, resolveRootDetailed, workspaceContext, comContextoWorkspace };



