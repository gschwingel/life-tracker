
// Contrato da régua canônica do farol do grafo — evento deliberado 2026-09-06
// (NORMALIZACAO-FAROL-GRAFO). Fixa a legenda ÚNICA (README-DEV-AI, docs/MCP-GRAFO
// e o comentário de semântica do MCP) e impede regressão para as três legendas
// concorrentes (verde=planejamento, verde="estabilizado",
// "em andamento"/"bloqueado"/"desbloqueado").
//
// MIGRACAO 2026-09-13 (veredito humano — prompt Estrutura-Canonical-FDV-PLAN-V7,
// F2): o FDV-PLAN v7.0 (Deliberate Event "KF como Posicionamento e Estado") remove
// o farol do KF — FDV-PLAN v7.0 §3: "SEM farol: estado de execução é propriedade
// de SP/FR; KF-área carrega apenas meta de geração". As assertions que amarravam
// REGUA_ESTADOS a LILA-DEV/FDV-PLAN.md foram movidas para o invariante INVERTIDO:
// a AUSÊNCIA de farol no FDV-PLAN passa a ser o que o teste guarda.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("regua-estados: README-DEV-AI + MCP carregam a MESMA legenda (🟢 executado | 🟡 planejado | 🔴 não aprovado | 🟣 revalidação) e o farol permanece FORA do FDV-PLAN (v7.0 §3)", () => {
  const readme = read("LILA-DEV/README-DEV-AI.md");
  const mcpDoc = read("docs/MCP-GRAFO.md");
  const mcpSrc = read("scripts/lila-grafo-mcp.cjs");
  const fdvPlan = read("LILA-DEV/Canonical/FDV-PLAN.md");

  assert.match(readme, /régua canônica do farol/);
  assert.match(readme, /executado e finalizado/);
  assert.match(readme, /regra de interrupção|Regra de interrupção/);
  assert.match(mcpDoc, /régua canônica do farol/);
  assert.match(mcpDoc, /executado e finalizado/);
  assert.match(mcpSrc, /Régua canônica do farol/);
  assert.match(mcpSrc, /não aprovado para execução/);

  // Valores do farol inalterados e default determinístico 🔴 no create_nodes.
  assert.match(mcpSrc, /new Set\(\["🟢", "🟡", "🔴", "🟣"\]\)/);

  // Invariante invertido (FDV-PLAN v7.0 §3): a ausência de farol é o contrato —
  // a canônica declara "SEM farol" e o estado de execução é propriedade de SP/FR.
  assert.match(fdvPlan, /SEM farol/);
  assert.doesNotMatch(fdvPlan, /REGUA_ESTADOS/);
});

test("regua-estados: semântica antiga erradicada dos docs canônicos", () => {
  const readme = read("LILA-DEV/README-DEV-AI.md");
  const mcpDoc = read("docs/MCP-GRAFO.md");

  for (const doc of [readme, mcpDoc]) {
    assert.doesNotMatch(doc, /🟢 = estabilizado/, "verde = planejamento estabilizado (antigo)");
    assert.doesNotMatch(doc, /🟡 = em andamento/, "amarelo = sessão aberta (antigo)");
    assert.doesNotMatch(doc, /🟣 = desbloqueado \(dependente/, "roxo = desbloqueado aguardando início (antigo)");
    assert.doesNotMatch(doc, /🔴 = bloqueado \(dependente/, "vermelho = bloqueado (antigo)");
  }
});
