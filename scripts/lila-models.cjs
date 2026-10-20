#!/usr/bin/env node
/**
 * scripts/lila-models.cjs
 * Proposito: CLI consolidado do ferramental de modelos OpenRouter.
 * Subcomandos:
 *   search <termo>  — busca fuzzy por id/name no catalogo /models
 *   inspect <id>    — payload bruto de um modelo (keys + JSON)
 *   check           — auditoria MODEL_OPTIONS (src/lib/models.ts) vs API
 *   qi [id]         — intelligence_index (artificial_analysis); sem id, audita lista fixa
 * Entrada: args CLI + src/lib/models.ts (check) + https://openrouter.ai/api/v1/models
 * Saida:   stdout estruturado | exit 0 sucesso | exit 1 falha/recurso ausente
 * Erros:   mensagem acionavel com codigo OPENROUTER_* (espelho embedding-client.cjs)
 */
const fs = require("fs");
const path = require("path");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
const MODELS_TS_PATH = path.join(__dirname, "..", "src", "lib", "models.ts");
const DEFAULT_QI_IDS = [
  // PATCH-MODELOS-DROPDOWN-REVERT-ALIAS-20260914: catalogo voltou a ids especificos
  // (alias antiga~...-latest proibido no dropdown — decisao humana). Ids pinados Expoem benchmark AA
  // proprio — o audit qi volta a reportar valores reais.
  // PATCH-MODELOS-DROPDOWN-20260921: Grok 4.6→4.7, Qwen 3.8 Flash→Mimo 2.6 Pro,
  // GPT Sol/Luna→variantes Pro. Mimo sem benchmark AA proprio — QI 40 no catalogo é
  // estimativa fallback herdada do slot (ver log do patch).
  // FRAME-LUNA-GPT6-CATALOGO-20260925: lista espelha o catálogo das 4 categorias —
  // luna-pro sai (eliminado), luna assume; entram omni-flash, mimo-v2.6-flash,
  // qwen3.8-max-0902, muse-spark-1.3 (volta), kimi-k3 e gpt-6-astra. Slots
  // experimentais (env-only desde este frame) ficam fora da lista fixa.
  // PATCH-MODELOS-DROPDOWN-HAIKU-20261007: gemini-3.8-flash sai do dropdown (segue
  // servível fora da oferta) — haiku-5.5 entra com AA próprio (QI 43.4).
  // PATCH-MODELOS-DROPDOWN-DEEPSEEK1017-GEMINI4-20261018: o dropdown oferta o PIN
  // deepseek/deepseek-v4.1-flash-1017 (id flutuante vira legado do migrateModelId).
  // gemini-4-argon NÃO é adicionado — o Sonnet 5.5 (substituído) também nunca esteve
  // nesta lista fixa; a lista já espelha o catálogo apenas parcialmente (drift anterior).
  "z-ai/glm-5.3-flash",
  "deepseek/deepseek-v4.1-flash-1017",
  "qwen/qwen3.8-omni-flash",
  "xiaomi/mimo-v2.6-flash", // família Mimo sem benchmark AA proprio — QI 38 no catalogo = estimativa fallback
  "z-ai/glm-5.3",
  "deepseek/deepseek-v4-pro-0813",
  "xiaomi/mimo-v2.6-pro", // sem benchmark AA proprio — QI 40 no catalogo = estimativa fallback
  "qwen/qwen3.8-max-0902",
  "openai/gpt-6-luna",
  "meta/muse-spark-1.3-contributor",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.1-sol-pro", // FRAME-SOL61-OPUS-CATALOGO-20260930: rename do gpt-6-sol-pro (mandato M1)
  "x-ai/grok-4.7",
  "moonshotai/kimi-k3",
  "openai/gpt-6-astra",
 ];

const USAGE = `Uso: node scripts/lila-models.cjs <subcomando> [args]
  search <termo>          busca modelos por id/name (fuzzy)
  inspect <id>            payload bruto de um modelo
  check                   audita MODEL_OPTIONS (src/lib/models.ts) vs OpenRouter API
  qi [id]                 intelligence_index; sem id, audita lista fixa de modelos

Exit: 0 sucesso | 1 falha/recurso nao encontrado.`;

if (process.argv.includes("--help") || process.argv.includes("-h") || !process.argv[2]) {
  console.log(USAGE);
  process.exit(process.argv[2] ? 0 : 1);
}

const sub = process.argv[2];
const args = process.argv.slice(3);

function codeForStatus(status) {
  let code = "OPENROUTER_SERVER_ERROR";
  if (status === 401 || status === 403) code = "OPENROUTER_KEY_INVALID";
  else if (status === 429) code = "OPENROUTER_RATE_LIMITED";
  return code;
}

async function fetchModels() {
  const resp = await fetch(OPENROUTER_URL);
  if (!resp.ok) {
    throw new Error(`OpenRouter models falhou (HTTP ${resp.status}) [${codeForStatus(resp.status)}]`);
  }
  const data = await resp.json();
  return new Map((data.data ?? []).map((m) => [m.id, m]));
}

function findModel(map, id) {
  const baseId = id.replace(/:online$/, "");
  return map.get(id) ?? map.get(baseId);
}

// ── search ────────────────────────────────────────────────────────────────
async function cmdSearch(termo) {
  const t = (termo || "").toLowerCase();
  const map = await fetchModels();
  const results = [...map.values()].filter(
    (m) =>
      (m.id ?? "").toLowerCase().includes(t) ||
      (m.name ?? "").toLowerCase().includes(t),
  );
  console.log(`${results.length} resultado(s) para "${termo || ""}":\n`);
  for (const m of results) {
    const price =
      ((parseFloat(m.pricing?.prompt ?? "0") + parseFloat(m.pricing?.completion ?? "0")) / 2 * 1_000_000).toFixed(2);
    const mods = m.architecture?.input_modalities ?? [];
    const multimodal = mods.includes("image");
    const webSearch = !!m.pricing?.web_search;
    const params = m.supported_parameters ?? [];
    const toolUse = params.includes("tools");
    console.log(`  id: ${m.id}`);
    console.log(`  name: ${m.name}`);
    console.log(
      `  multimodal: ${multimodal} | webSearch: ${webSearch} | toolUse: ${toolUse} | price: $${price}`,
    );
    console.log("");
  }
}

// ── inspect ───────────────────────────────────────────────────────────────
async function cmdInspect(id) {
  if (!id) {
    console.error("Uso: node scripts/lila-models.cjs inspect <id>");
    process.exit(1);
  }
  const map = await fetchModels();
  const found = findModel(map, id);
  if (!found) {
    console.log(`Modelo ${id} não encontrado no catálogo (${map.size} modelos)`);
    process.exit(1);
  }
  console.log("=== KEYS DO MODELO ===");
  console.log(Object.keys(found).join(", "));
  console.log("\n=== JSON completo ===");
  console.log(JSON.stringify(found, null, 2));
}

// ── check ─────────────────────────────────────────────────────────────────
// Espelha verificar-modelos-openrouter.cjs (parse por contagem de chaves —
// unico aninhamento conhecido: reasoning:{effort}; dívida documentada em scripts/README.md).
function extractModelOptions(tsSource) {
  const start = tsSource.indexOf("export const MODEL_OPTIONS");
  if (start === -1) throw new Error("MODEL_OPTIONS não encontrado em src/lib/models.ts");
  const end = tsSource.indexOf("] as const;", start);
  const block = tsSource.slice(start, end);

  const items = [];
  let i = 0;
  while (i < block.length) {
    const open = block.indexOf("{", i);
    if (open === -1) break;
    let depth = 0;
    let j = open;
    for (; j < block.length; j++) {
      if (block[j] === "{") depth++;
      else if (block[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const chunk = block.slice(open, j + 1);
    const valueMatch = chunk.match(/value:\s*"([^"]+)"/);
    const labelMatch = chunk.match(/label:\s*"([^"]+)"/);
    if (valueMatch && labelMatch) {
      items.push({ value: valueMatch[1], label: labelMatch[1], chunk });
    }
    i = j + 1;
  }
  return items;
}

function parseBoolField(chunk, field) {
  const re = new RegExp(`${field}:\\s*(true|false)`);
  const m = chunk.match(re);
  return m ? m[1] === "true" : undefined;
}

function parsePrice(chunk) {
  const re = /price:\s*"([^"]+)"/;
  const m = chunk.match(re);
  return m ? m[1] : undefined;
}

function isMultimodal(apiModel) {
  if (!apiModel?.architecture) return false;
  const inputMods = apiModel.architecture.input_modalities ?? [];
  return Array.isArray(inputMods) && inputMods.includes("image");
}

function hasWebSearch(apiModel, apiModelsMap) {
  if (apiModel?.pricing?.web_search) return true;
  const baseId = apiModel?.id?.replace(/:online$/, "") ?? "";
  return [...apiModelsMap.keys()].some((k) => k.startsWith(`${baseId}:`));
}

function hasToolUse(apiModel) {
  const params = apiModel?.supported_parameters ?? [];
  return Array.isArray(params) && (params.includes("tools") || params.includes("function_calling"));
}

function formatPriceUsd(promptPrice, completionPrice) {
  const p = parseFloat(promptPrice ?? "0");
  const c = parseFloat(completionPrice ?? "0");
  return ((p + c) / 2) * 1_000_000;
}

async function cmdCheck() {
  const map = await fetchModels();
  const tsSource = fs.readFileSync(MODELS_TS_PATH, "utf8");
  const items = extractModelOptions(tsSource);

  console.log("=".repeat(140));
  console.log("VERIFICACAO — multimodal / websearch / tooluse / pricing");
  console.log("=".repeat(140));

  let totalDiscrepancies = 0;

  for (const item of items) {
    const { value, label, chunk } = item;
    const baseId = value.replace(/:online$/, "");
    const onlineId = `${baseId}:online`;

    const apiModel = map.get(value) ?? map.get(baseId) ?? map.get(onlineId);
    if (!apiModel) {
      console.log("");
      console.log(`AVISO ${label} [${value}]`);
      console.log(`   -> Modelo NAO encontrado na API (nem ${value}, nem ${baseId}, nem ${onlineId})`);
      totalDiscrepancies++;
      continue;
    }

    const currentMultimodal = parseBoolField(chunk, "multimodal");
    const currentWebSearch = parseBoolField(chunk, "webSearch");
    const currentPrice = parsePrice(chunk);

    const apiMultimodal = isMultimodal(apiModel);
    const apiWebSearch = hasWebSearch(apiModel, map);
    const apiToolUse = hasToolUse(apiModel);
    const apiPrice = formatPriceUsd(apiModel.pricing?.prompt, apiModel.pricing?.completion);

    const discrepancies = [];
    if (currentMultimodal !== undefined && currentMultimodal !== apiMultimodal) {
      discrepancies.push(`multimodal: local=${currentMultimodal} api=${apiMultimodal}`);
    }
    if (currentWebSearch !== undefined && currentWebSearch !== apiWebSearch) {
      discrepancies.push(`webSearch: local=${currentWebSearch} api=${apiWebSearch}`);
    }
    if (currentPrice !== undefined) {
      const localNum = parseFloat(currentPrice.replace("$", ""));
      if (Math.abs(localNum - apiPrice) > 0.05) {
        discrepancies.push(`price: local=$${localNum.toFixed(2)} api=$${apiPrice.toFixed(2)}`);
      }
    }

    if (discrepancies.length > 0) {
      totalDiscrepancies++;
      console.log("");
      console.log(`X ${label} [${value}]`);
      console.log(`   API     : multimodal=${apiMultimodal} webSearch=${apiWebSearch} toolUse=${apiToolUse} price=$${apiPrice.toFixed(2)}`);
      for (const d of discrepancies) {
        console.log(`   -> ${d}`);
      }
    }
  }

  console.log("");
  console.log("=".repeat(140));
  console.log(
    totalDiscrepancies === 0
      ? "Nenhuma discrepancia encontrada."
      : `${totalDiscrepancies} modelo(s) com discrepancia.`,
  );
  console.log("=".repeat(140));
  process.exit(totalDiscrepancies > 0 ? 1 : 0);
}

// ── qi ────────────────────────────────────────────────────────────────────
async function cmdQi(id) {
  const map = await fetchModels();
  const ids = id ? [id] : DEFAULT_QI_IDS;

  for (const target of ids) {
    const model = findModel(map, target);
    if (!model) {
      console.log(`${target} => NAO ENCONTRADO`);
      continue;
    }
    if (id) {
      // Modo inspect-qi: payload de benchmark detalhado
      console.log(`=== ${model.id} ===`);
      console.log("keys de benchmarks:", model.benchmarks ? Object.keys(model.benchmarks).join(", ") : "SEM benchmarks");
      if (model.benchmarks?.artificial_analysis) {
        console.log("artificial_analysis:", JSON.stringify(model.benchmarks.artificial_analysis, null, 2));
      }
      if (model.benchmarks?.design_arena) {
        const sample = model.benchmarks.design_arena.slice(0, 3);
        console.log("design_arena (3 exemplos):", JSON.stringify(sample, null, 2));
      }
      console.log("reasoning:", JSON.stringify(model.reasoning, null, 2));
    } else {
      const qi = model.benchmarks?.artificial_analysis?.intelligence_index;
      console.log(`${target} => ${qi ?? "N/A"}`);
    }
  }
}

// ── dispatch ──────────────────────────────────────────────────────────────
const handlers = {
  search: cmdSearch,
  inspect: cmdInspect,
  check: cmdCheck,
  qi: cmdQi,
};

const handler = handlers[sub];
if (!handler) {
  console.error(`Subcomando desconhecido: ${sub}`);
  console.error(USAGE);
  process.exit(1);
}

handler(...args).catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});