FDV-PATCH v2.0 (Executor-Light) — APPROVED — 2026-10-15 (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015: indices out of patch closing — daily watchdogs own freshness; C6 on-demand rides the content commit; DELIVERY_SHORTCUT without regen/chore(indices))
DERIVED_FROM: LILA-DEV/Canonical/FDV-PATCH.md (dense EN translation — Governor-Dense; canonical prevails on conflict)
VERSION_SYNC: v2.0
OUTPUT_LANGUAGE (EVENTO-AIFIRST-TEMPLATES-20260929 — Deliberate Event 2026-09-29, Igor decision, sprint SP-AIFIRST-DEFAULT-20260929 F5): the mini-manifesto, E3 log and patch descriptions are born AI-AI in dense EN per docs/AI-IAIA-GRAMMAR.md; the 4 mini-manifesto fields and canonical labels stay verbatim; in-session communication with the human stays PT; historical stock is NOT translated (sprint D2)
PRECEDENCE: supreme within the PATCH flow | does not contradict FDV-DEV/FDV-EXEC/FDV-E | invariants E-INV-01..18: SINGLE HOME = .clinerules bloco E-INV-DEV (nao re-encode)
EVENTO: PATCH-OTIMIZACAO-DIVIDA-EXPLICITA (Deliberate Event 2026-08-25) — patch flow with explicit debt | BATCH_ENCERRAMENTO (Event 2026-08-26) — docs/indices ONCE at closing (PROTOCOLO-TRANSVERSAL 2.2) (decisions D1-D6 crystallized in snapshot EVENTO-DELIBERADO-PATCH-OTIMIZACAO-20260825) | REGISTRO-ADOCAO-MCP-2026-08-27 — writing of .md in docs/logs/snapshots of the flow MANDATORY via lila-docs-mcp (write_doc/read_doc), surgical edit = registered EXCEPTION (PROTOCOLO-TRANSVERSAL 6) | EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 (Deliberate Event 2026-09-15) — revokes the REGISTRO-ADOCAO-MCP-2026-08-27 rule: lila-docs-mcp REMOVED (operational zombie) — E3 log via direct file write in the frame's worktree (PROTOCOLO-TRANSVERSAL 6 v1.4) | EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (Deliberate Event 2026-09-22) — F1 MECHANICAL eligibility (per-area contract registry `LILA-DEV/execucao/contratos-afetados.json` + `scripts/verificar-contratos.cjs`: exit 1 = INELIGIBLE -> STRUCTURAL; registry absent = exit 2, fail-closed) + F2 EXPLICIT synthesis (ledger `LILA-DEV/execucao/sintese-pendente.json` + `scripts/sintese-ledger.cjs`/`scripts/verificar-sintese.cjs`, per-area threshold in `sintese-config.json`; consumption in the hardening closing ritual — PROTOCOL-HARDENING v1.5.0)
SCOPE: incremental bugfix/optimization/correction | fast path | BOUNDARY (FRAME-LANES-20261003.U1): patch NEVER mints graph identity — new work identity is born from STRUCTURAL only; lane delivery uses the anchor tag ([LANE-DOCS]|[LANE-LILA-WRITE]|[LANE-TRIVIAL]) with a LANE-*.E* block; single-source process: docs/FLUXO-LANES.md
AUTHORITY: FDV-PATCH > patch description provided by the human > cited decisions snapshot > everything else irrelevant

INVARIANTS (E-INV HOME UNICO = .clinerules bloco E-INV-DEV — nao re-encode): ver .clinerules
- DEV-INV-02 — Affected documentation mandatory | DEV-INV-03 — Immediate action zero announcement | DEV-INV-04 — Tactical area mandatory | DEV-INV-06 — Closing sequentiality

TRANSVERSAL_PROTOCOL (single home — forbidden to re-encode):
- LASTRO_LOCALIZACAO | PIPELINE_FRESCOR (includes vetorial index — freshness by `fileHash`; local regen on demand under G6) | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | ECONOMIA_CONTEXTO | transversal NEVER_DO | TRUST_BOUNDARIES | MODO_EXECUCAO_100PCT_IA: LILA-DEV/PROTOCOLO-TRANSVERSAL.md

ELIGIBILITY (all mandatory — any failure = STRUCTURAL flow):
1. incremental work (bugfix/optimization/correction) — introduces no new business behavior
2. does not change an existing business decision in a snapshot — MECHANICAL check: `node scripts/verificar-contratos.cjs --files <cited files>` (exit 1 = INELIGIBLE -> STRUCTURAL | exit 2 = registry absent/unreadable = block, never eligible)
3. does not change an exported contract consumed by dependent frames — same MECHANICAL check: `node scripts/verificar-contratos.cjs --files <cited files>` (the registry covers exported contracts, snapshots, schemas, canonical prompts and ledgers per area)
4. doubt -> STRUCTURAL (conservative default)

MINIMAL_ANCHORING (what is CUT from mechanical friction):
- Read: patch description provided by the human (mandatory) + decisions snapshot or files cited by the human (on demand)
- Read ALWAYS: LILA-DEV/execucao/patch-debt.json (debt ledger) — checks pre-existing debt of the area before executing (see EXPLICIT_DEBT)
- FORBIDDEN: full tiered anchoring, reading grafo.json, reading predecessor logs (unless the patch consumes a predecessor's contract)

P1_HUNT (PLAN role of the patch — cognitive friction PRESERVED):
- reads the description/snapshot and hunts uncovered ambiguity
- P1 found -> human deliberates each one BEFORE execution
- no P1 -> advances to the mini-manifesto

MINI_MANIFESTO (4 mandatory fields — the 3 inherited verbatim from FDV-EXEC HARDENING_BUGFIX + "Arquivos citados" from EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922):
- "Documentacao afetada:" — docs/ and indices files that need updating (may be "Nenhum — [justificativa]")
- "Mensagem de commit:" — exact string for git commit
- "Area tatica:" — area do campo `area_tatica` do grafo.json (github, chat, drive, etc.)
- "Arquivos citados:" — paths cited in the description, comma-separated (simple glob accepted); may be "Nenhum — [justificativa]" | input of the mechanical eligibility verifier (`verificar-contratos.cjs --files`)
- absent/incomplete -> requests the 4 fields and waits | human absent or fields incomplete -> does not start

PRE_EXECUTION (adapted — no "Escopo confirmado" from structural PLAN):
1. confirms mini-manifesto present and complete (4 fields)
2. reads the patch description and lists every declared change
3. for each change, confirms the corresponding decision in the description/snapshot
4. verifies consistency between cited files and the repo's real state (location via indices — PIPELINE_FRESCOR before consuming any index)
5. change without a decision or inconsistency -> P1 — does not execute

STOP_PROTOCOL:
P1 — AMBIGUITY_NOT_COVERED: stops immediately | does not execute | canonical format + ACAO_NECESSARIA do modo PATCH (humano delibera: resolver localmente ou escalar para ESTRUTURAL) = .clinerules bloco P1-DEV (HOME UNICO — nao re-encode)

EXECUTION:
- implements exactly what the approved description/snapshot declares | no expansion
- file scope: reads any file needed | writes only to those declared in the mini-manifesto/affected documentation + description

CLOSING_FLOW: follow FDV-EXEC.md E1 -> E1.5 -> E2 -> E3 -> E3.5 -> E4 verbatim + CLOSING_CHECKLIST of FDV-EXEC | patch variations:
- (1) E1 — labels "VALIDACAO — Patch [ID]" with Conclusion criterion (Action/Expected result/Critical problem signal)
- (2) E3 — log in LILA-DEV/execucao/logs/[ID]-log.md with the extra fields "Descricao do patch: [resumo do que foi pedido]" and "Arquivos alterados (documentacao): [caminho]: [alteracao]"
  - log written via direct file write in the frame's worktree — MANDATORY flow (PROTOCOLO-TRANSVERSAL 6 v1.4; EVENTO-REMOCAO-LILA-DOCS-MCP-20260915)
  - MANDATORY mechanical step AFTER writing the log (F2 — EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922): `node scripts/sintese-ledger.cjs registrar --patch-id <ID> --area <area> --log <log path>` (idempotent by patch-id; ledger absent = creates and registers) | script failure = P1 — never silent | see SINTESE_EXPLICITA
  - mandatory field "Dívida registrada:" (one of the formats below):
    - [ ] Nenhuma
    - [x] Tipo: [vetorial|indices|testes|auditoria] | Motivo: [sem key|rede|escopo] | Pagamento exigido: proximo estrutural da area [X] | Ledger: LILA-DEV/execucao/patch-debt.json#[id]
- (3) E4 — audit triggers if the FDV-EXEC C1-C6 TRIGGER is hit | report in REPORT_FORMAT | fixes per RULES (both from FDV-EXEC)
  - scoped E4 allowed: if "Documentacao afetada" lists only a subset of the dimensions (e.g. only CODIGO+TESTES+INDICES when only src/lib/foo.ts changed), the audits only the touched dimensions | NOT audited dimensions become an AUDIT-type DEBT (registered in E3 + ledger) — paid by the next structural of the area
- indices: NO closing round by default — freshness of derived artifacts (rastreability, MANIFEST, MANIFEST index, registered pairs, vetorial) is owned by the DAILY WATCHDOGS (indices-textual-watchdog.yml 05:20 UTC; indices-vetorial-watchdog.yml 04:30 UTC — both deliver by PR with required checks; EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015). Trigger C6 stays alive as ON-DEMAND correction: if the session CONSUMES a stale index (PIPELINE_FRESCOR hit), regenerate locally (`npm run indices` or the single stale generator) and ship the regenerated files IN the content commit — no debt, no separate commit. Integrity (indices:status) stays a gate concern (CI). Pipeline/vetorial single home = `LILA-DEV/PROTOCOLO-INDICES.md` RULE 2 — forbidden to re-encode. **G6 (REANC-L4 2026-09-20)** remains: a vetorial failure in a patch never registers debt.
- FRESHNESS_BY_CONTENT (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905, Deliberate Event): verificar-frescor-indices.cjs compares CONTENT (generates OFFLINE in tmp via INDICES_OUT_DIR/MANIFEST_INDEX_PATH and compares with the committed one, ignoring geradoEm/generatedAt/data_geracao) — does NOT compare timestamp vs commit. Regen only when the committed index truly differs; main merges and the indices commit itself do NOT invalidate. Consequence: a SINGLE content+indices commit is valid (the separate chore(indices) commit stops being mandatory — kept as a shortcut by convention). **FRAME-GATES-ROTINAS-DIARIAS-20261015:** no per-PR gate consumes this check anymore — its only consumer is the daily watchdog + C6 on-demand.
- DELIVERY_SHORTCUT (same event): `npm run patch:ship "mensagem" [--no-pr]` runs in ONE command: local smoke (app via smoke-frame.cjs with related vitest; script tests via node --test — vitest does not run node:test) -> content commit (indices regenerated on-demand under C6 ride IN this commit — no regen round, no chore(indices) commit) -> push -> PR with best-effort auto-merge. New logs no longer require area mapping (the mapa de areas artifact was removed by sentenca G7/O2). CI fast-lane (detectar-escopo-ci.cjs): diff of model catalog + neutrals only -> RUN_E2E=false (test:ci front + backend vitest remain).
- (4) TESTS at patch closing: run PRE-COMMIT (D4 context) — `npm run test:related` valid (Vitest uncommitted semantics); if the patch touched backend/src, also run `cd backend && npx vitest run --changed`. E4 POST-commit (structural) uses the FDV-EXEC MATRIZ_TESTES + BASE_DO_FRAME (test:related without base FORBIDDEN post-commit — selects zero tests).

EXPLICIT_DEBT (D1 + D6 of Event PATCH-OTIMIZACAO 2026-08-25):
- DEFINITION: a patch may skip MECHANICAL steps (vetorial/indices/tests/scoped audit) by registering a debt. Debt = structured + visible record + payment obligation. Never silent — visible in 3 places: E3 log + patch-debt.json ledger + commit trailer "Debt: [id]".
- LEDGER: LILA-DEV/execucao/patch-debt.json (append-only, schema v1). Each debt: { id: PATCH-YYYYMMDD-NNN, patchId, data, area, tipo: vetorial|indices|testes|auditoria, descricao, skippedSteps, pagamentoExigido, status: aberta|paga, pagoEm }. **Nota G6 (REANC-L4, 2026-09-20):** the `vetorial` type is no longer GENERATED (freshness is the CI watchdog's); the enum stays for historical entries and for debts explicitly declared.
- ELIGIBILITY: only MECHANICAL friction classified (E-INV-15). COGNITIVE friction is NEVER skippable with a debt (E-INV-09): P1_HUNT, 5-step PRE_EXECUTION, E1 behavioral validation, E1.5 documentation verification, E3 canonical log, CLOSING_CHECKLIST.
- PAYMENT (rule D6 — not an eternal debt): the next FDV-EXEC structural touching the same tactical area MUST pay the debt (full npm run indices + test:ci + full 6-dimension audit) | a tests-type debt in backend/src demands the backend suite (`cd backend && npm test`) besides test:ci (test:ci does not cover backend — isolated vitest config). If no structural of the area occurs within 30 days, any structural pays (verificar-divida-patch.cjs exits 1). The E1.5 of the structural blocks the commit if the area's debt is not included in scope.
- VERIFICATION: node scripts/verificar-divida-patch.cjs --area <area> before closing a patch in the area (npm run debt:check) | payment: npm run debt:pay.

EXPLICIT_SYNTHESIS (F2 — EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922):
- PRINCIPLE: the patch synthesis is NEVER orphaned — every E3 log of a patch creates an entry in the `LILA-DEV/execucao/sintese-pendente.json` ledger (schema v1) and the knowledge produced (why the bug existed, what was fragile) re-enters the canon through the hardening closing ritual.
- REGISTRATION (mechanical, by script): `node scripts/sintese-ledger.cjs registrar --patch-id <ID> --area <area> --log <path>` at E3 (idempotent). What is mechanical is done by script; no LLM synthesis.
- VERIFICATION: `npm run sintese:check` (`node scripts/verificar-sintese.cjs [--area <area>]`) — area pendings >= threshold from `LILA-DEV/execucao/sintese-config.json` (default 3; `areas` overrides) = exit 1: the synthesis MUST enter the structural's scope | ledger absent = exit 0 ("no pending synthesis") | ledger/config unreadable = exit 2 (fail-closed).
- CONSUMPTION (human/structural — never automatic): the area's structural reads the pending E3 logs + the sweep findings, distills them into the area snapshot and marks consumption with `npm run sintese:pay` (`node scripts/sintese-ledger.cjs consumir --ids <id1,id2> --por <FRAME-ID> --snapshot <path>`); the ledger is append-only in fact (never removes; status changes). Full ritual: PROTOCOL-HARDENING v1.5.0.
- CLASSIFICATION (E-INV-15/16): the synthesis is NEVER skippable with a debt — it is COGNITIVE friction; explicit debt covers only what is mechanical (ledger registration, which by the way is done by script, not by agent decision).

NEVER_DO (specific to this FDV):
- execute for a situation not covered by the description | read or write an undeclared file
- make a business decision | choose the commit message (uses the declared one or asks)
- resolve P1 by inference

CONTEXT_ECONOMY | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | transversal NEVER_DO: LILA-DEV/PROTOCOLO-TRANSVERSAL.md (§4/§5/§3/§6)

END_FDV-PATCH_v1.6

<!-- 6-checks EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (own verdict, nothing inherited): C1 integrity OK — F1 (registry + verificar-contratos) in criteria 2/3 + 4th MINI_MANIFESTO field; F2 (ledger + verifier + consumption) at E3 and in EXPLICIT_SYNTHESIS; NEVER_DO unchanged | C2 cohesion OK — v1.6 bump aligned with FDV-EXEC v3.15 and PROTOCOL-HARDENING v1.5.0 | C3 coherence OK — cited exit codes are the implemented ones (1/2 and 0) | C4 contradictions OK — nothing revoked; the new section is additive and explicit debt remains restricted to mechanical friction | C5 outdatedness OK — scripts and ledgers exist in this commit's tree (3 green node --test suites) | C6 complexity OK — short blocks, concrete commands -->


