"use strict";
/**
 * scripts/lib/fila-checks.cjs
 * Biblioteca compartilhada (fila-drain + fila-diagnostico) para ler o estado de
 * checks e mergeabilidade de um PR do LilaV2.
 *
 * POR QUE EXISTE (drenagem de 2026-10-06: 6 PRs pousáveis classificados como
 * "re-despachar merge-gate"): a branch protection exige o contexto `merge-gate`,
 * mas no regime EAGER o único check do gate visível no statusCheckRollup é o
 * NATIVO do job (`merge-gate-runner`) — o `merge-gate` required é autorreportado
 * via Checks API (E5, ver merge-gate.yml:42-53) no sha do MERGE-REF e NÃO entra
 * no rollup. No path de DESPACHO (drenador), o E5-v2 publica TAMBÉM um commit
 * status clássico `merge-gate` (StatusContext: `context`/`state`, sem `name`).
 * Procurar o nome exato `merge-gate` em `x.name` classificava todo PR pousável
 * como "gate ausente — re-despachar".
 *
 * DESENHO:
 * - FAMÍLIA: `merge-gate` OU `merge-gate-runner`, sobre `name` (CheckRun) OU
 *   `context` (StatusContext) — as duas formas de entrada do rollup e os dois
 *   nomes vivos do gate.
 * - mss-FIRST: o mergeStateStatus é o veredito do próprio GitHub sobre a
 *   protection — pousável exige mss mergeável, então um falso verde de leitura
 *   de rollup nunca vira pouso errado. `strict=false` (runbook, 2026-10-06):
 *   BEHIND é mergeável.
 * - Conservador na direção certa: pendência domina; qualquer conclusão que não
 *   seja SUCCESS é falha — "nunca merge em skipped/neutral/ausente" (runbook,
 *   garantias). Falso-vermelho custa uma olhada; falso-verde custa um pouso
 *   errado.
 *
 * A lista REQUIRED espelha a branch protection de main (lida da API em
 * 2026-10-06; strict=false). Drift futuro da protection é pego no pouso (o
 * GitHub bloqueia e o PR fica BLOCKED) — esta lib orienta a LEITURA do rollup,
 * não duplica a protection como fonte de verdade.
 */

const REQUIRED = ["merge-gate", "pr-gate", "gates-grafo", "manifest-frescor"];
const GATE_RE = /^merge-gate(-runner)?$/;
const MERGEAVEL = ["CLEAN", "UNSTABLE", "BEHIND"];
const PENDENTES = new Set(["PENDING", "IN_PROGRESS", "QUEUED", "EXPECTED"]);

/** Nome normalizado de uma entrada do rollup (CheckRun: `name`; StatusContext: `context`). */
function nomeDe(entrada) {
  return String((entrada && (entrada.name || entrada.context)) || "").trim().toLowerCase();
}

/** Conclusão/estado normalizado (CheckRun: conclusion|status; StatusContext: state). */
function conclDe(entrada) {
  return String((entrada && (entrada.conclusion || entrada.state || entrada.status)) || "").trim().toUpperCase();
}

/** Entradas da família do gate presentes no rollup (qualquer forma/nome vivo). */
function entradasGate(rollup) {
  return (rollup || []).filter((c) => GATE_RE.test(nomeDe(c)));
}

/**
 * Estado agregado da família do gate: SUCCESS | PENDING | FAILURE | AUSENTE.
 * Pendência domina; só a ausência TOTAL autoriza re-despacho (playbook C).
 */
function estadoGate(rollup) {
  const entradas = entradasGate(rollup);
  if (!entradas.length) return "AUSENTE";
  const cs = entradas.map(conclDe);
  if (cs.some((c) => PENDENTES.has(c))) return "PENDING";
  if (cs.every((c) => c === "SUCCESS")) return "SUCCESS";
  return "FAILURE";
}

/** Estado dos 3 estados possíveis de exibição: SUCCESS | PENDING | FAILURE. */
function normalizaEstado(entrada) {
  const s = conclDe(entrada);
  if (s === "SUCCESS") return "SUCCESS";
  if (PENDENTES.has(s)) return "PENDING";
  return "FAILURE";
}

/**
 * Resumo dos 4 required com o gate AGREGADO por família (uma linha "merge-gate"
 * mesmo quando o rollup só traz "merge-gate-runner").
 */
function resumoChecks(rollup) {
  const arr = rollup || [];
  const saida = [];
  for (const nome of REQUIRED) {
    if (nome === "merge-gate") {
      const entradas = entradasGate(arr);
      saida.push({ nome, estado: estadoGate(arr), url: entradas.length ? entradas[0].detailsUrl || null : null });
      continue;
    }
    const c = arr.find((x) => nomeDe(x) === nome);
    saida.push({ nome, estado: c ? normalizaEstado(c) : "AUSENTE", url: c ? c.detailsUrl || null : null });
  }
  return saida;
}

/**
 * Classificador puro de um PR (campos do `gh pr list --json`: mergeStateStatus +
 * statusCheckRollup). Retorna { classe, motivo, checks, pendentes?, vermelhos?,
 * extras? }. Classes: DIRTY | PENDENTE | VERMELHO | POUSAVEL | REDESPACHAR_GATE |
 * ANOMALIA_D | AVALIAR — POUSAVEL/REDESPACHAR_GATE/ANOMALIA_D são classes de AÇÃO
 * na skill (pousar / despachar C / playbook D); as demais são diagnóstico.
 */
function classificarPR(pr) {
  const rollup = (pr && pr.statusCheckRollup) || [];
  const mss = pr && pr.mergeStateStatus;
  const checks = resumoChecks(rollup);
  const gateEstado = estadoGate(rollup);
  const info = { checks };

  if (mss === "DIRTY")
    return { ...info, classe: "DIRTY", motivo: "conflito real com a main — resync do autor/drenador (B/O), nunca automático" };

  const pendentes = (rollup || [])
    .filter((c) => PENDENTES.has(String(c.status || c.state || "").trim().toUpperCase()))
    .map(nomeDe);
  if (pendentes.length)
    return { ...info, classe: "PENDENTE", motivo: "gates em curso — próxima passada", pendentes };

  const vermelhos = checks.filter((c) => c.estado === "FAILURE" && c.nome !== "merge-gate").map((c) => c.nome);
  if (gateEstado === "FAILURE")
    return { ...info, classe: "VERMELHO", motivo: "merge-gate reprovado — gh run view <id> --log-failed", vermelhos: ["merge-gate", ...vermelhos] };
  if (vermelhos.length)
    return { ...info, classe: "VERMELHO", motivo: "required vermelho: " + vermelhos.join(", "), vermelhos };

  // Non-required vermelho (docs-einv-frescor, sonda-gate, flips-pendentes, alerta)
  // não bloqueia (UNSTABLE = mergeável) — reportado como extras, nunca como vermelho.
  const requiredSet = new Set(REQUIRED);
  const extras = (rollup || [])
    .filter((c) => !requiredSet.has(nomeDe(c)) && !GATE_RE.test(nomeDe(c)) && normalizaEstado(c) === "FAILURE")
    .map(nomeDe);

  if (MERGEAVEL.includes(mss))
    return {
      ...info,
      classe: "POUSAVEL",
      motivo: "mss " + mss + " com required verdes" + (extras.length ? " (non-required vermelho não bloqueia: " + extras.join(", ") + ")" : ""),
      extras,
    };
  if (mss === "BLOCKED" && gateEstado === "AUSENTE")
    return { ...info, classe: "REDESPACHAR_GATE", motivo: "gate ausente com leves verdes — playbook C (despacho com base_sha de rev-parse isolado)" };
  if (mss === "BLOCKED" && gateEstado === "SUCCESS")
    return { ...info, classe: "ANOMALIA_D", motivo: "required verde + BLOCKED — prova viva (merge)/re-despacho/close-reopen (D)" };
  return { ...info, classe: "AVALIAR", motivo: "mstate=" + mss + " fora do conjunto conhecido" };
}

module.exports = { REQUIRED, GATE_RE, MERGEAVEL, nomeDe, entradasGate, estadoGate, resumoChecks, classificarPR };
