# LILA-DEV — Transversal Execution Protocol
DERIVED_FROM: LILA-DEV/Canonical/PROTOCOLO-TRANSVERSAL.md (verbatim; canonical prevails on conflict)
VERSION_SYNC: v1.7

**Version:** v1.7 — 2026-10-02 — APPROVED
**Bump:** v1.0 (implicit, created 2026-08-18 — meta_updated_fdv_exec_otimizacao) -> v1.1 (Deliberate Event PATCH-OTIMIZACAO-DIVIDA-EXPLICITA) -> v1.2 (Deliberate Event BATCH-ENCERRAMENTO-DOCS-INDICES) -> v1.3 (Deliberate Event REGISTRO-ADOCAO-MCP-2026-08-27 — writing of .md in docs/logs/snapshots MANDATORY via lila-docs-mcp) -> v1.4 (Deliberate Event EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 — revokes the v1.3 rule: lila-docs-mcp REMOVED (operational zombie — 3 root incidents in 1 day, zero valuable usage); writing of .md in docs/logs/snapshots is now ALWAYS direct file write in the frame's worktree; docs MCPs are not the log flow) -> v1.5 (PATCH-PROCESSO-SESSAO-MCP-20260922 — NEVER_DO gains the `core.hooksPath` read note) -> v1.6 (FRAME-CONTRATOS-DE-FRONTEIRA-20260922 — F4: TRUST_BOUNDARIES, single-home policy of trust boundaries) -> v1.7 (FRAME-LACO-ESTADO-20261002 — §2.2 gains the NARROW EXCEPTION of the incremental snapshot draft during PLAN; + FDV-PLAN v7.3 §2 RELATION TO ACTIVE DECISIONS, Igor decision 2026-10-02)
> Canonical document that centralizes the operational blocks replicated across the FDVs (FDV-DEV, FDV-EXEC, FDV-PATCH).
> Each FDV points to this protocol in 1 line — forbidden to re-encode the content defined here.
> Precedence: FDV-PLAN v7.1 -> FDV-DEV -> FDV-EXEC -> FDV-PATCH. This protocol is subordinate to the FDVs that reference it.

---

## 1. LOCATION_BALLAST (fence rule — transversal)

- indices (semantic, reverse, docs, tests, rastreabilidade, cobertura, **vetorial**) + AI-PROJECT-MANIFEST.md = LOCALIZATION ballast. The **vetorial index** (indice-vetorial.json + .bin) is consumed exclusively via `node scripts/buscar-vetorial.cjs` (never read the .bin — 7-30MB blows the context; same pattern as the reverse index).
- allowed: resolving a path, confirming existence of file/contract/symbol, locating a module, composing a catalog ("Documentacao afetada").
- forbidden: source of business decision, inference argument, authority over frame behavior. Business decision = snapshot/prompt/declared plan, exclusively.
- opening an index does not carry previous session context (current repo state) — explicit memory preserved (E-INV-13).

## 2. FRESHNESS_PIPELINE — SINGLE HOME: `LILA-DEV/PROTOCOLO-INDICES.md` (RULE 2)

- The full pipeline (freshness by `fileHash` | sidecar↔bin integrity | vetorial tests | selective regen | on-demand local regen under G6) lives in `LILA-DEV/PROTOCOLO-INDICES.md` RULE 2 — single home (sentenca G3). **Forbidden to re-encode here.**
- Operational minimum (does not replace the home): never consume a stale index; `npm run indices:check` before consuming any index (exit 1 -> regenerate). The vetorial's freshness outside the PR window belongs to the CI watchdog (G6) — local regen is on demand, never a recurring obligation.

## 2.1 PATCH RULE — SINGLE HOME: `LILA-DEV/PROTOCOLO-INDICES.md` (RULE 2, on-demand regen)

- Vetorial failure in a patch under G6 (REANC-L4 2026-09-20) **no longer registers debt**: the freshness outside the PR window belongs to the CI watchdog. Debt registration/payment (D6) remains for the debts FDV-PATCH declares explicitly (§EXPLICIT_DEBT). Single home — forbidden to re-encode.

## 2.2 BATCH_CLOSING (anti-fragmentation — docs and indices ONCE per flow)

Hard rule: the execution documentary writing (E3 logs, snapshots, E4 audit) and the indices regeneration happen ONCE per flow, grouped at closing (sequence E1.5 -> E3 -> E4 and CHECKLIST), in the same window as the end — never at intermediate steps.

FORBIDDEN:
- commit/regeneration of indices at every step of the flow (do not generate chore(indices) per partial E2/E3/E4);
- execution log created/committed in parts per stage — the E3 log is written COMPLETE, in ONE shot, at closing;
- updating AI-PROJECT-MANIFEST mid-cycle instead of at closing.

CONSENTED (does not count as fragmentation): emergent regen of a stale index MID-flow if it is blocking location/consumption (see `LILA-DEV/PROTOCOLO-INDICES.md` RULE 2 — single home) — however the commit of that index accompanies the closing batch, and the one-round-at-the-end rule remains as the signal for the E4 audit.

- Closing (ONE round of `indices:smart` + `indices:check` + `indices:status` at the structural/patch closing): see `LILA-DEV/PROTOCOLO-INDICES.md` RULE 2 — single home, forbidden to re-encode.

NARROW EXCEPTION — INCREMENTAL SNAPSHOT DRAFT DURING PLAN (FRAME-LACO-ESTADO-20261002, Igor decision 2026-10-02):
- the frame/sprint SNAPSHOT DRAFT (LILA-DEV/planejamento/snapshots/) is EXEMPT from this rule DURING PLAN: it may be written and committed incrementally (commit per DELIBERATE DECISION, on the session branch) — session death before crystallization loses a decision only the (non-technical) human can re-derive; the decision must be born durable in the repo at deliberation time
- exemption limits: (1) snapshot draft only — E3 log, E4 audit, indices and manifest remain ONCE at closing; (2) commit per deliberate decision, never per line edit; (3) zero indices regeneration mid-PLAN; (4) the draft's intermediate commits vanish on merge squash — the canon on main keeps seeing one clean commit per frame
- the mother rule (one round at closing) remains integral for the execution phase and remains the signal for the E4 audit

## 3. ANTI_STALL

- DETECTION: message without a tool call promising action | silence after announcement | long text without progress
- HUMAN_ACTION: interrupts the session | sends "Continue executando a proxima tool call. Sem anuncio." | repeated pattern -> closes and opens a new session with fresh anchoring (E-INV-13)
- CLASSIFICATION: operational failure — not a P1 | does not change frame state
- PREVENTION: never text before a tool call | never intro or confirmation | multiple tool calls one at a time | long answer -> partition into smaller tool calls

## 4. ACTIVATION_INSTRUCTION (system prompt)

"Voce e o FDV-[X]. NUNCA anuncie o que vai fazer — execute a proxima tool call imediatamente. NUNCA diga 'vou olhar', 'me da 2 minutos' ou equivalente. Se voce nao tem tool call imediata, declare 'Nenhuma tool call necessaria — proxima acao: [acao minima]' e execute. Parar de processar apos anuncio e travamento — proibido."

## 5. CONTEXT_ECONOMY

- does not reproduce file content -> references by name and path | does not explain the protocol | generates no intro/conclusion/confirmation
- minimal intermediate answers | long outputs: canonical signal, P1/P2 report, E1 validation, E1.5 verification, E3 execution log
- CoT and intermediate reasoning (internal scratchpad) run strictly in technical English for maximum token density and latent-space efficiency; outputs, logs and final deliverables to the human keep the pt-BR pattern
- forbidden to paraphrase/confirm/plan_out_loud/announce — the tool call is executed immediately

## 6. NEVER_DO (transversal)

- use context from previous sessions | resolve P1 by inference | explain one's own protocol
- announce action without a tool call | generate intermediate text replacing a tool call | wait for instruction when the action is already determined
- write to a file not declared in the plan/description | make a business decision
- never `git config core.hooksPath --worktree` as a read — in this git `--worktree` becomes a VALUE and writes `core.hooksPath = --worktree`, pointing every hook at an invalid path (`sh: --worktree/post-commit: invalid option`); reading is always `git config --get core.hooksPath` — happened 2026-09-22, fixed in 9146fd96 (PATCH-PROCESSO-SESSAO-MCP-20260922)
- docs MCPs are not the log flow: writing of .md in docs/, LILA-DEV/execucao/logs/ or LILA-DEV/planejamento/snapshots/ is ALWAYS a direct file write in the frame's worktree (native file tools) — lila-docs-mcp was REMOVED on 2026-09-15 (Deliberate Event EVENTO-REMOCAO-LILA-DOCS-MCP-20260915; revokes the REGISTRO-ADOCAO-MCP-2026-08-27 rule)

## 7. EXECUTION_MODE_100PCT_IA

- LILA's execution method: **100% AI** — the human decides and architects; the AI executes all the mechanics.
- human does not type commands, does not run scripts, does not fill logs, does not edit execution files — decision/architecture only.
- AI executes: tool calls, git add/commit/push, execution log writing, indices regeneration (**vetorial on demand** — the CI watchdog owns freshness outside the PR window, G6), FDV-EXEC audit, documentary update.
- DEBT reinforcement: the AI is responsible for registering debt audibly (E3 log + patch-debt.json ledger + `Debt: [id]` trailer in the commit) — a debt is never silent (FDV-PATCH §DIVIDA_EXPLICITA / home unico do pipeline: `LILA-DEV/PROTOCOLO-INDICES.md` RULE 2).
- reinforcement: the AI is responsible for indices freshness (incl. vetorial) per `LILA-DEV/INDICES.md` §5 — verifies by content/`fileHash`; the recurring local regen obligation was removed by G6 (REANC-L4) — does not depend on human action.

---

## 8. TRUST_BOUNDARIES (política de fronteiras de confiança — FRAME-CONTRATOS-DE-FRONTEIRA-20260922)

Casa ÚNICA da política de fronteiras de confiança — os FDVs apontam para este protocolo (blocos TRANSVERSAL_PROTOCOL) e nunca re-encodam. Decisão deliberada 2026-09-22 (F4 do frame).

Régua (3 regras — verbatim da decisão):
- defesa obrigatória onde a entrada é não-confiável;
- fallback proibido onde há garantia dupla verificável;
- garantia afirmada sem prova = tipo honesto + dívida registrada (D1/D6), nunca silêncio.

Fronteiras classificadas:

| Fronteira | Confiança | Defesa obrigatória |
|---|---|---|
| Payload do LLM (tool calls / `arguments`) | não-confiável | tipagem honesta (`arguments?: string`) + normalização explícita ÚNICA no dispatch (`ausente/"" ⇒ "{}"`); edge omitido é silencioso — warning ao modelo proibido nesse edge (pagamento: PATCH-20260922-001) |
| Bundler / interop ESM↔CJS (módulos externos) | não-confiável | tipagem interop honesta (`{ default?: unknown }`) + validação estrutural da API usada na fronteira do módulo; fallback sem validação proibido; sem braço válido = degradação controlada declarada, nunca TypeError latente (pagamento: PATCH-20260922-002) |
| Banco legado (linhas/colunas do Postgres) | não-confiável | validação por schema (zod) / redaction / allowlist existentes; nunca confiar no shape declarado |
| Rede/JSON externo (respostas de API) | não-confiável | parse com try/catch + validação de forma; erro nunca propaga cru ao modelo/usuário |

Garantia dupla verificável (ex.: default notNull no DDL + tipo do schema; tipo do pacote + build ESM conferido por sonda registrada) ⇒ o fallback é MORTO e sai com lastro (padrão REPARO-POS-BUMP-20260922 §3). Toda deliberação que afirme forma de runtime exige sonda registrada antes do veredito (lição de processo FRAME-CONTRATOS-DE-FRONTEIRA-20260922).

---

**END OF PROTOCOLO-TRANSVERSAL.md v1.6**

## Batch commands = PARALLEL (2026-09-06)
In the Cline harness, commands of the same call may run in parallel. Mandatory sequence: dependent commands go in SEPARATE calls (git commit/push, read after write).

