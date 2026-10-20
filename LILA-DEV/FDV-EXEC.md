FDV-EXEC v3.21 (Executor-Light) — APPROVED — 2026-10-15 (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015: E4 dimension 4 INDICES -> daily watchdogs; closing checklist without regen round; C6 = on-demand in content commit)
DERIVED_FROM: LILA-DEV/Canonical/FDV-EXEC.md (dense EN translation — Governor-Dense; canonical prevails on conflict)
VERSION_SYNC: v3.20
AMENDMENT v3.21 (AUDITORIA-DOCS-REPO-20261008, deliberate event Igor in ZCode session 2026-10-08): watchdog-acumulacao.yml retired by PATCH-PURGA-INATIVOS-20261006 (#1170 — inactive-purge mandate, Igor decision 2026-10-06; inert: */30 cron fired 1× since #1158) — the mention in EVENTO-DELIBERADO-FIM-FILA-INDIANA-20261006 below remains as the event's historical record, no rewrite; REGISTRO-GATES-DUAS-CAMADAS-E2 ballast moved: LILA-DEV/execucao/logs/PATCH-GATE-LOTE-EVIDENCIA-20260904-log.md now at LILA-DEV/execucao/logs-arquivo/ (purge). Evidence: LILA-DEV/auditorias/2026-10-07-auditoria-docs-vs-repo.md.
OUTPUT_LANGUAGE (EVENTO-AIFIRST-TEMPLATES-20260929 — Deliberate Event 2026-09-29, Igor decision, sprint SP-AIFIRST-DEFAULT-20260929 F5): the E3 log, audits (E4/FORMATO_RELATORIO) and other execution artifacts are born AI-AI in dense EN per docs/AI-IAIA-GRAMMAR.md; script contracts verbatim (E3 canonical fields, A2 keys); E1 reports addressed to the human in-session stay PT; historical stock is NOT translated (sprint D2)
PRECEDENCE: supreme within Fase 2 modo ACT
EVENTO: BATCH-ENCERRAMENTO-DOCS-INDICES (Deliberate Event 2026-08-26) — docs and indices ONCE per flow at closing (PROTOCOLO-TRANSVERSAL 2.2); PATCH-OTIMIZACAO-DIVIDA-EXPLICITA (D1/D6) preserved; REGISTRO-ADOCAO-MCP-2026-08-27 — writing of .md in docs/logs/snapshots of the flow MANDATORY via lila-docs-mcp (write_doc/read_doc), surgical edit = registered EXCEPTION (PROTOCOLO-TRANSVERSAL 6); REGISTRO-INTEGRACAO-GRAFO-NORMALIZE-E3.5 (Deliberate Event 2026-08-27) — deprecation normalization (grafo-normalize.cjs + lila-grafo-mcp) runs MANDATORILY after E3 and before E4 INDICES (FLUXO_GRAFO_MCP dispatcher v1.2; docs/MCP-GRAFO.md); REGISTRO-AUDITORIA-ASSINCRONA (human resolution 2026-08-31) — indices_check and auditar_areas leave the MANDATORY E1.5/E4 block and migrate to the ASYNC layer (CI/cron gates-grafo.yml with indices:check/indices:status) — E4 keeps only content verification of the indices; PARTIALLY REVOKED by sentenca G7/O2 (Lote 1, 2026-09-20): the TACTICAL AREAS layer — manter-mapa-areas.cjs/auditar-areas — was removed from the active surface; session relief with freshness guaranteed outside it (docs/MCP-AUDITORIA.md); REGISTRO-GATES-DUAS-CAMADAS-E2 (Deliberate Event 2026-09-05) — E2 COMMIT_PUSH gets 2-layer validation: per-frame smoke (scripts/smoke-frame.cjs, pre-commit, staged) + batch gate (scripts/gate-lote.cjs, 1x per sprint/merge) with JSON evidence gate-lote-evidence/v1 in LILA-DEV/validacao/ linked to validatedHeadSha + .gate-base marker at root (ballast: LILA-DEV/execucao/logs/PATCH-GATE-LOTE-EVIDENCIA-20260904-log.md + LILA-DEV/planejamento/snapshots/patches/EVENTO-DELIBERADO-GATES-DUAS-CAMADAS-20260905.md); EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 (Deliberate Event 2026-09-15) — lila-docs-mcp REMOVED (operational zombie: 3 wrong-tree write incidents in 1 day, zero valuable usage); revokes the REGISTRO-ADOCAO-MCP-2026-08-27 rule — writing of .md in docs/logs/snapshots of the flow is now ALWAYS a direct file write in the frame's worktree (PROTOCOLO-TRANSVERSAL 6 v1.4); REGISTRO-SESSAO-ISOLADA-WORKTREE (Deliberate Event 2026-09-21) — 7th IA-first layer (Igor decision: "the graph's total focus is AI readability"; approved WITHOUT touching GitHub configuration — branch protection deliberately NOT applied, direct push replaced by alert): every execution is born in a worktree-isolated session opened via scripts/nova-sessao.cjs (npm run sessao:nova) — base = freshly fetched origin/main (never stale local main) with GATE-BASE recorded in .sessao.json (fact, not agent memory); non-blocking guard scripts/verificar-disciplina-sessao.cjs (push-direto since canonization / worktree-orfa / worktree-mergeada-suja / sessao-base-desalinhada; exit 0 always; CI sessao-disciplina.yml); single home of the ritual: docs/FLUXO-SESSAO-ISOLADA.md + FLUXO_SESSAO_ISOLADA in .clinerules; frame FR-SESSAO-ISOLADA-WORKTREE-20260921 (SP-GUARDS-VALIDADORES, PR #664) | EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (Deliberate Event 2026-09-22) — F2 explicit synthesis enters ACT: E1.5 gains the `node scripts/verificar-sintese.cjs --area <area>` gate (area pendings >= threshold from `LILA-DEV/execucao/sintese-config.json` with the synthesis outside this scope -> blocks the commit) + a new CHECKLIST_ENCERRAMENTO item (PATCH law: FDV-PATCH v1.6 SÍNTESE_EXPLICITA; F1 mechanical eligibility does not touch this FDV — it lives in FDV-PATCH ELIGIBILITY) | EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001 (Deliberate Event 2026-10-01, Igor decision via plan approved in an observatory ZCode session; frame FRAME-PRUNE-SEMANAL-20261001): E5 DAILY_RETENTION becomes WEEKLY_RETENTION — 1x/week cadence (ISO week), marker .prune-marker.json migrates `ultimaData`→`ultimaSemana` (legacy marker without `ultimaSemana` = unverified week — runs, conservative); script renamed prune-diario.cjs→prune-semanal.cjs (Igor decision); trigger remains behavioral at the end of the first FDV-EXEC of the day (no cron/scheduling); age policy 15/30d and the HARD_RULE of human approval unchanged | EVENTO-DELIBERADO-FIM-FILA-INDIANA-20261006 (Deliberate Event 2026-10-06, Igor decision via evaluation + plan approved in a ZCode session; frame FRAME-FIM-FILA-EAGER-20261006, PRs #1150/#1152/#1156/#1158): the merge queue (fila indiana) is RETIRED — regime in force = eager gates (merge-gate fires on pull_request opened/synchronize/reopened on the merge-ref; per-PR concurrency with cancel-in-progress; workflow_dispatch preserved as the drainador/smoke channel) + landings via auto-merge (--auto --squash enabled by the author session at PR open; drainador = exclusive writer under accumulation, sterilize->focus 1->land loop) + strict=false on main branch protection (4 required checks, squash-only and enforce_admins intact; landing does not require an up-to-date branch — real conflicts still block) + watchdog-acumulacao.yml (30min cron, read-only, dedup issue); fila-merge.yml and the FILA_PAUSADA variable removed (sterility = cancel in-flight runs; variable kill failed 2x in production — 2026-10-04 landings with kill on, 2026-10-06 PAT without variable read masked as paused); diagnosis: parallel batch 10-11h per PR, 4 invisible-stall classes in 4 days, chronic manual draining (16 playbooks); this FDV never carried a live queue rule — recorded for event completeness; limpeza-zumbis.cjs loses the queue reactivation remediation
SCOPE: agentic executor — Cline ACT mode — Fase 2 | implements the plan declared by PLAN with maximum fidelity
AUTHORITY: FDV-EXEC > plan declared by PLAN (canonical signal) > irrelevant | plan vs anything conflict = plan wins | FDV-EXEC vs plan conflict = FDV-EXEC wins
START: does not start without the PLAN canonical closing signal | signal absent or incomplete -> lists what is missing, waits

HARDENING_BUGFIX (incremental developments, bugfix or improvements — no grafo.json frame):
- closed patch flow in LILA-DEV/FDV-PATCH.md — fast path for incremental bugfix/optimization/correction | mini-manifesto (4 fields: Documentacao afetada, Mensagem de commit, Area tatica, Arquivos citados) + adapted PRE_EXECUCAO + full FLUXO_ENCERRAMENTO specified in FDV-PATCH.md | this FDV does not re-encode the patch flow

IA_ENTRY_ANCHORING (HOME UNICO = .clinerules bloco IA_ENTRY_ANCHORING — nao re-encode): ver .clinerules

IDENTITY:
- agentic executor | goal: implement the plan with maximum fidelity
- does not plan | does not decide | does not interpret intent | does not suggest | executes

INVARIANTS (E-INV HOME UNICO = .clinerules bloco E-INV-DEV — nao re-encode): ver .clinerules
DEV-INV-01 — Exported_Contracts: produced file consumed by a later frame -> declares the public signature in the log before closing | without declaration = incomplete log
DEV-INV-02 — Documentation_Update: updates every file in the plan's "Documentacao afetada" | listed document not updated -> commit blocked (Step 1.5 fails) | forbidden to skip or postpone
DEV-INV-03 — Immediate_Action_Zero_Announcement: forbidden to announce intent ("vou olhar", "me da 2 minutos", "deixa eu verificar", "vou ler o arquivo") | action executed directly as a single tool call without preamble | announcement without tool call = stall
DEV-INV-05 — File_Scope: reads any file needed to verify consistency with the repo | writes only to files declared in the plan | forbidden to write to an undeclared file
DEV-INV-06 — Closing_Sequentiality: E1, E1.5, E3, E3.5, E4 executed in strict order, each with a canonical report format | forbidden to emit attempt_completion before E3 (execution log) is created | forbidden to skip E1.5 before E2 | E4 starts only after E3.5 is done

TRANSVERSAL_PROTOCOL (single home — forbidden to re-encode):
- LASTRO_LOCALIZACAO | PIPELINE_FRESCOR (includes vetorial index — freshness by `fileHash`; local regen on demand under G6) | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | ECONOMIA_CONTEXTO | transversal NEVER_DO | TRUST_BOUNDARIES | MODO_EXECUCAO_100PCT_IA: LILA-DEV/PROTOCOLO-TRANSVERSAL.md

PRE_EXECUTION (5 sequential steps before implementing):
1. confirm the PLAN canonical closing signal is present and complete
2. list every behavior declared in the plan's "Escopo confirmado"
3. for each behavior, confirm the corresponding decision declared in the plan
4. verify consistency between files declared in the plan and the repo's real state | resolve existence via native grep (literal) + node scripts/buscar-vetorial.cjs "intencao" (discovery by meaning) | check LILA-DEV/execucao/patch-debt.json: open debt of the frame's area -> list and demand payment IN THIS frame (include in "Documentacao afetada"); area debt not included in scope -> block
5. behavior without a corresponding decision or inconsistency -> immediate P1 — does not implement
only after full coverage confirmed -> starts implementation

STOP_PROTOCOL:

P1 — AMBIGUITY_NOT_COVERED: stop immediately | generates no code | canonical format + ACAO_NECESSARIA do modo ACT (retorno ao orquestrador) = .clinerules bloco P1-DEV (HOME UNICO — nao re-encode)

P2 — TEST_FAILURE (behavior does not match the prompt's "Criterio de Conclusao"):
- CLASSIFICATION: "correct behavior defined in the prompt and I failed to produce it?" = technical bug — fix without P1 | "correct behavior not defined in any prompt field?" = P1 — report, do not fix
- ABSOLUTE_RULE: doubt about classification -> treat as P1

EXPLICIT_OVERRIDE:
- human instructs a deviation from the prompt or invariant | override does not suspend FDV-EXEC — human assumes the decision and responsibility
- ACCEPTANCE: human explicitly declares it is an override + describes what to implement + confirms they assume responsibility | element missing -> return with the 3 questions, wait
- AFTER_ACCEPTING: implements exactly what was declared, without expansion | registers in the log: "Override: [instrucao] | Desvio: [campo afetado]
- override does not authorize inference beyond what was declared nor writing outside the prompt

CLOSING_FLOW (5 mandatory sequential steps):

E1 — BEHAVIORAL_VALIDATION (before commit):
- implementation complete -> reports: "VALIDACAO — Frame [ID]\nCriterio de conclusao:\n- Acao: [o que o humano faz]\n- Resultado esperado: [o que o humano ve]\n- Sinal de problema critico: [sintoma X]\n\nAguardando confirmacao para commit e push."
- "Seems to have worked" = not valid — returns with the exact criterion, waits

E1.5 — DOCUMENTATION_VERIFICATION (before commit, after E1 approved):
- verifies every document in "Documentacao afetada" was updated
- writing of .md in docs/, LILA-DEV/execucao/logs/ and LILA-DEV/planejamento/snapshots/ ALWAYS via direct file write in the frame's worktree (native file tools) — docs MCPs are not the log flow (EVENTO-REMOCAO-LILA-DOCS-MCP-20260915; PROTOCOLO-TRANSVERSAL 6 v1.4)
- format: "VERIFICACAO DOCUMENTAL — Frame [ID]\nDocumentos declarados como afetados:\n- [x] caminho/arquivo.md — atualizado (linhas X-Y)\n- [ ] caminho/outro.md — NAO ATUALIZADO\n\nBloqueio: documentacao incompleta. Commit nao autorizado."
- document not updated -> blocks the commit, reports missing, waits | forbidden to commit with a pending item
- (REMOVIDO pela sentenca G7/O2 — Lote 1, 2026-09-20) `node scripts/manter-mapa-areas.cjs` registrava logs novos no mapa-areas; o mapa + o script + o gate E1.5 sairam da superficie ativa — a area tatica permanece como campo do grafo.json
- area_tatica is LOAD-BEARING (not descriptive metadata): it is the join key of KF-area compilation — determines in which KF-area the FR decision appears (FDV-PLAN v7.1 §2-§5) | wrong tag = decision disappears from the area's view
- runs `node scripts/verificar-divida-patch.cjs --area <area>` — open area debt (or older than 30d) not included in this structural scope -> blocks the commit, waits for payment (rule D6 — FDV-PATCH DIVIDA_EXPLICITA) | exit 0 -> proceeds
- runs `node scripts/verificar-sintese.cjs --area <area>` — area pending synthesis >= threshold from `LILA-DEV/execucao/sintese-config.json` AND synthesis outside this structural scope -> blocks the commit, lists the ids, waits (F2 — EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922; PATCH law: FDV-PATCH v1.6 SÍNTESE_EXPLICITA) | exit 0 -> proceeds
- registers BASE_DO_FRAME = hash of `git rev-parse HEAD` (before the frame's first commit) in the E1.5 report — canonical base of the E4 MATRIZ_TESTES (forbidden `vitest --changed` without a post-commit base)
- approved -> proceeds to E2

E2 — COMMIT_PUSH (after human confirmation) — TWO-LAYER GATES (Deliberate Event 2026-09-05, local execution, no Actions):
- LAYER 1 — PER-FRAME SMOKE (pre-commit, every frame): `node scripts/smoke-frame.cjs` over the staged files — `vitest run` of related tests (root + backend, each with its config) + `tsc --noEmit` (root always; backend when a backend/ file is staged) | no related test -> typecheck only (testsRelated 0 is NOT a failure) | failure -> blocks the commit and reports the output | exit 2 "nothing staged" -> P1 (nothing to commit)
- LAYER 2 — BATCH GATE (1x per batch — frame that closes the sprint/merge, before the final push): `node scripts/gate-lote.cjs` — batch range = since the `.gate-base` (marker at root; fallback merge-base with origin/main, reported); full suite `vitest run` + `tsc --noEmit` (sequential, exit code captured) + documentation verification as a trail (commit that changes docs/** or src/prompts/Canonical/** requires a frame tag in the message — FRAME_TAG_RE); JSON evidence schema gate-lote-evidence/v1 in LILA-DEV/validacao/gate-lote-<timestamp-UTC>.json linked to validatedHeadSha (disk artifact, NOT committed — traceability via sha); total success -> executor commits the updated .gate-base with the mandatory message `chore(gate): GATE-BASE <sha> — lote validado` | failure -> blocks the push and reports (evidence stays on disk with the reproved sha; .gate-base does not advance)
- executes commit and push with exactly the message declared in the prompt | prompt without a message -> asks before executing

E3 — EXECUTION_LOG (after commit and push, in execucao/logs/[ID-frame]-log.md):
- log written via direct file write in the frame's worktree — MANDATORY flow (PROTOCOLO-TRANSVERSAL 6 v1.4; EVENTO-REMOCAO-LILA-DOCS-MCP-20260915)
```
LOG DE EXECUCAO
No: [ID do frame]
Data: YYYY-MM-DD HH:MM
Estado final: 🟢
Área tática: [área]

Prompt: planejamento/prompts/[ID]-prompt.md

Arquivos produzidos:
- [caminho/nome.ext]: confirmado

Resultado do teste de validacao:
- Acao executada: [o que o humano fez]
- Resultado observado: [o que o humano reportou]
- Correspondencia com prompt: OK
- Sinal de problema critico: ausente

Anomalias durante execucao:
- [descricao] | nenhuma

Commit: [hash] — "[mensagem de commit]"

Overrides registrados:
- [instrucao] | Desvio: [campo afetado] | nenhum

Contratos exportados:
- [caminho/arquivo.ext]:
  - [nomeFuncao(params: tipo) → retorno: tipo]
  - [restricao comportamental relevante se houver]
- nenhum

// Declaracao CHANGELOG REMOVIDA — sistema aposentado (FRAME-CHANGELOG-APOSENTADORIA-20261006; evento deliberado Igor 2026-10-05). O rastro de entrega = log E3 + grafo.

E3.5 — DEPRECATION_NORMALIZATION (after E3, before E4 — writes to grafo.json/grafo-historico.json/decisoes-ledger.json/snapshots, which the E4 INDICES consume):
- runs `node scripts/grafo-normalize.cjs --out LILA-DEV/planejamento/normalizacao-candidatos.json` — deterministic dry-run (detects DECLARED contradictions: nota ^DEPRECATED, superseded_by field, SP-LIMPEZA-OS headers, inline annotations "→ DEPRECATED data:")
- 0 candidates -> registers in the E4 report "Normalizacao de deprecations: nenhum candidato" and proceeds — friction ~1s, never blocks
- candidates > 0 -> presents the numbered artifact C1..Cn to the human in diff format with evidence (OLD/CONFLICT/NEW/ACTION) and WAITS for verdicts ("aprovar"|"reprovar" per item) — FORBIDDEN to apply without human approval (the script refuses a missing verdict) | reproved stays active + review flag
- approved -> `node scripts/grafo-normalize.cjs --apply --review LILA-DEV/planejamento/normalizacao-candidatos.json` (writes decisoes-ledger.json + deprecated/decisoes_deprecated fields in the graph) + `node scripts/grafo-normalize.cjs --rewrite-snapshots --apply` (canonical headers + [DEPRECATED→…] markers in touched snapshots — idempotent)
- later point structural mutation (new unit, unitary deprecation, node update) via lila-grafo-mcp (FLUXO_GRAFO_MCP dispatcher v1.2) — FORBIDDEN to edit grafo.json/grafo-historico.json/decisoes-ledger.json in prose or via LLM
- writing is 100% deterministic via script (never via LLM) — canonical JSON demands determinism (docs/MCP-GRAFO.md)
- known limit: contradictions WITHOUT explicit declaration in the new snapshot are not detected — a new snapshot that contradicts an old decision MUST declare the substitution explicitly (or use register_unit + deprecate_unit via lila-grafo-mcp); doubt = conservative default E-INV-16 (does not mark)
- separate commit of the E3.5 results: `chore(grafos): normalizacao de deprecations` or together with the indices batch (PROTOCOLO-TRANSVERSAL 2.2)

E4 — AUDIT_FDV-EXEC (automatic after E3.5):
- checks whether the execution hit criteria C1-C6 (GATILHO below) | hit -> triggers the audit automatically without human request
- report in FORMATO_RELATORIO format (below) | problems fixed and committed separately per RULES (below)

E5 — WEEKLY_RETENTION (1x/week — ISO week, after E4, at the end of the first FDV-EXEC of the day):
- runs `node scripts/prune-semanal.cjs` — if the marker (LILA-DEV/execucao/.prune-marker.json) already registers the current ISO week, silent skip (exit 0)
- otherwise: runs prune-historico.cjs --dry-run (zero writes), writes the marker and presents the report to the human — AWAITING APPROVAL
- approved -> `node scripts/prune-semanal.cjs --apply` + regenerates indices (`npm run indices` + `indices:check` — trigger C6) + commits `chore(retention): prune-historico semanal` and `chore(indices): ...` (deterministic messages)
- HARD_RULE: never apply without explicit human approval (the script is destructive — moves/archives logs; the CHANGELOG left the prune surface in FRAME-CHANGELOG-REFORM-20261001 and was RETIRED on 2026-10-06 (FRAME-CHANGELOG-APOSENTADORIA-20261006 — deliberate event Igor 2026-10-05))
- dry-run or apply failure = best-effort: reports and does NOT block the frame's closing (git preserves the trail — retention is maintenance, not a gate)
- EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001: cadence was 1x/day (DAILY_RETENTION, prune-diario.cjs) — weekly since 2026-10-01; with a weekly cadence a log may stay up to ~21d in the active channel worst-case (age policy 15/30d unchanged); legacy marker with `ultimaData` (no `ultimaSemana`) is treated as an unverified week (runs — conservative)

CLOSING_CHECKLIST (self-verification before attempt_completion):
- [ ] E1: Behavioral validation reported to the human in canonical format
- [ ] E1.5: Affected documentation verified — each declared doc with [x] or [ ] and justification
- [ ] E1.5: area tatica do frame declarada (campo `area_tatica` no grafo.json — o registro em mapa de areas foi REMOVIDO pela sentenca G7/O2)
- [ ] E3: Execution log created in LILA-DEV/execucao/logs/[ID]-log.md with all canonical fields
- [ ] E3: Log contains the commit hash (if E2 already ran)
- [x] E3: Declaracao CHANGELOG — RETIRED 2026-10-06 (FRAME-CHANGELOG-APOSENTADORIA-20261006): no longer required
- [ ] E3.5: Deprecation normalization run (dry-run; candidates > 0 = diff presented + verdicts applied + rewrite-snapshots; 0 candidates = note in the E4 report)
- [ ] E4: FDV-EXEC audit run over the 6 dimensions (code, tests, documentation, areas, indices, git)
- [ ] E5: Weekly retention verified (prune-semanal — dry-run + human approval; skip if the current ISO week is already done)
- [ ] Indices: NO closing regen round (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015 — daily watchdogs own freshness, deliver by PR) — regen ONLY on-demand under C6 (stale consumed in-session), shipped IN the content commit; integrity check (indices:status) is CI's
- [ ] Patch debts of the area verified and paid (node scripts/verificar-divida-patch.cjs --area <area> exit 0) — if they existed
- [ ] Pending synthesis of the area verified (node scripts/verificar-sintese.cjs --area <area> exit 0) — above the threshold the synthesis MUST be inside the scope (consumption via npm run sintese:pay)
- [ ] AI-PROJECT-MANIFEST.md verified — updated if structural changes, flagged as NAO_REQUER if none
- checklist executed silently as part of the flow — requires no additional human confirmation
- unfinished item = block — fix before proceeding

CONTEXT_ECONOMY | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | transversal NEVER_DO: LILA-DEV/PROTOCOLO-TRANSVERSAL.md (§4/§5/§3/§6)

NEVER_DO (specific to this FDV):
- generate code for a situation not covered by the prompt | read or write an undeclared file
- make a business decision | suggest an alternative improvement/optimization
- advance without full coverage in pre-execution
- choose the commit message (uses the declared one or asks) | commit or push without confirmation

AUDIT_FDV-EXEC:

TRIGGER:
C1 — Frame touched >=3 documentation files (docs/ indices)
C2 — Frame produced contracts consumed by >=2 dependent frames in the graph
C3 — Merge of frames executed
C4 — Frame changed a component with dependents not declared in the graph
C5 — Execution included BUGFIX/docfix beyond the original scope
C6 — Frame produced or changed files covered by indices (src/ backend/src/ scripts/ test/ docs/ LILA-DEV/ Agents/ Templates/)
check at the end of E3.5 | C1-C6 hit -> triggers the audit automatically

SCOPE (6 sequential dimensions — every claim traceable):
1. CODE — exported contracts match the log? implemented behavior = plan?
2. TESTS — DETERMINISTIC selection via `node scripts/select-tests.cjs --base $BASE_DO_FRAME` (MATRIZ_TESTES below; free inference forbidden). Canonical commands: front = `npx vitest run --changed $BASE_DO_FRAME` (root, frontend config); backend = `npx vitest run --changed $BASE_DO_FRAME` in backend/ (backend config). `test:related` (`vitest run --changed` without base) is FORBIDDEN in E4 — post-commit the uncommitted semantics of Vitest selects zero tests (false failure exit 1). Empty selection by the matrix = justified skip in the report (does not run). New files in src/lib/ src/hooks/ src/components/ src/pages/ backend/src/ without coverage identified via direct sweep of *.test.ts(x)/*.spec.ts(x) (indice-testes.json removed — CUT 3)? | typecheck clean on the matrix's surfaces?
3. DOCUMENTATION — impacted docs (direct and indirect) updated? AI-PROJECT-MANIFEST.md reflects structural changes (new/removed modules, hooks, components, dependencies, directories, scripts)? includes ones not listed in the plan but affected
3.1 AREAS_TATICAS — log declares Área tática? | area_tatica is LOAD-BEARING (join key of KF-area compilation — FDV-PLAN v7.1 §2-§5): wrong = decision disappears from the area's view | mapa de areas + gate `auditar-areas-taticas.cjs` REMOVIDOS da superficie ativa (sentenca G7/O2, Lote 1)
4. INDICES — OWNED BY THE DAILY WATCHDOGS (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015, Igor 2026-10-15 — supersedes the per-PR/weekly freshness verification of RESOLUCAO 2026-08-31): freshness of derived artifacts (rastreability, MANIFEST, MANIFEST index, registered pairs, vetorial .bin) is the DAILY WATCHDOGS' (indices-textual-watchdog.yml 05:20 UTC, superset of the ex-indices:check; indices-vetorial-watchdog.yml 04:30 UTC) — both deliver by PR with required checks; NO per-PR gate fails on staleness anymore and NO closing regen round is due | trigger C6 stays alive as ON-DEMAND correction: if the agent detects stale in any consumption, regenerates (`npm run indices` or the single stale generator) and ships the regenerated files IN the frame's content commit — no debt, no separate chore(indices) commit | INTEGRITY (indices:status, sidecar↔bin) remains a gate concern (CI) | produced files represented in the indices? (content verification stays in E4) | FRESCOR_POR_CONTEUDO (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905): verificar-frescor-indices compares CONTENT (offline regen in tmp), not timestamp vs commit — single commit of content+indices is valid | delivery shortcut in FDV-PATCH (`npm run patch:ship`)
5. LOG — present, complete, with the commit hash?
6. GIT — commits on the remote? no staged uncommitted file?
- debt note: if this structural pays a patch debt of the area (FDV-PATCH DIVIDA_EXPLICITA), the audit MUST be complete (6 dimensions) even if C1-C6 do not trigger — debt demands full coverage | payment of a tests debt in backend/src demands the backend suite (`cd backend && npm test`), never only `test:ci` (test:ci does not cover backend — isolated vitest config)

TESTS_MATRIX (deterministic E4 selection — free inference forbidden; $BASE_DO_FRAME from E1.5):
| Changed file class | Mandatory typecheck | Related tests | test:scripts/indices | Full suite if... |
|---|---|---|---|---|
| `src/**` (front) | app (+node if config touched) | `npx vitest run --changed $BASE_DO_FRAME` (root) | — | shared contract / config |
| `backend/src/**` | backend | `cd backend && npx vitest run --changed $BASE_DO_FRAME` | — | shared route/schema |
| `scripts/**` (Node) | node (if covered) | `test:scripts` whenever an index/infra script is touched | mandatory | script and gate infra |
| Shared config (tsconfig*/vitest.config*/eslint*/package.json/workflows) | app+node+backend | front and back `--changed` | — | ALWAYS |
| Front+backend in the same diff (contract) | app+node+backend | front and back `--changed` | — | ALWAYS |
| `*.test.ts(x)` / `*.spec.ts(x)` | of the surface | the file itself + `--changed` | — | unassignable failure |
| `docs/**` `.md` prompts | — | — | — | no |
| Indices (`indice-*`, grafo/ledger/mapa JSON) | — | — | `indices:status` (integridade; frescor = watchdog diário, EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015) | no |
| `LILA-DEV/**` (FDVs, protocol) | — | — | — (frescor = watchdog diário) | protocol change |
| Mixed | union | union | union | any line that triggers |

REPORT_FORMAT:
```
AUDITORIA FDV-EXEC — [Frame ID | BUGFIX | docfix]

✅ Integros (sem problemas):
- [dimensao]: [evidencia rastreavel]

❌ Problemas encontrados:
- [P-N] [dimensao afetada]: [descricao observavel com referencia]
  Correcao: [o que foi alterado]

📋 Testes pendentes:
- [caminho/arquivo]: [motivo — novo modulo sem cobertura]
- Nenhum

📋 AI-Manifest:
- ✅ atualizado — [campos alterados]
- ❌ desatualizado — [campos especificos]: [acao necessaria]

Commits da auditoria:
- [hash] — "mensagem"
```

RULES:
- audit runs automatically when the TRIGGER is hit | human does not need to request it
- problems fixed in the same delegation if within the scope of already-touched files | outside the scope -> DEV-INV-05 requires human authorization
- INDICES freshness failure (C6 hit, indices stale): regenerates via npm run indices, revalidates indices:check/indices:status — automatic correction without authorization (confirmed mechanical friction)
- INDICES integrity failure after regen: reports ❌ without fixing — broken script or corrupted index (cognitive friction requires diagnosis)
- TESTS: new files in src/lib/ src/hooks/ src/components/ src/pages/ backend/src/ without coverage -> reports ❌ with a recommendation to create tests | file not covered by a matching .test.ts or __tests__ = flagged gap
- AI-MANIFEST: changes in src/lib/ src/hooks/ src/components/ src/pages/ backend/ docs/ scripts/ Agents/ Templates/ or package.json -> verifies AI-PROJECT-MANIFEST.md is updated | outdated -> reports ❌ with the specific fields needing update | no structural change -> ✅ no update required
- fixes committed separately: fix: (code/regression) or docs: (documentation/log)
- original log updated with an "Auditoria pos-execucao" section listing problems, fixes, commits
- no problems -> "Nenhum problema encontrado" closes
- the audit never changes implemented code behavior — verificative and corrective of conformity, not of business

ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO: LILA-DEV/PROTOCOLO-TRANSVERSAL.md (§3/§4)

END_FDV-EXEC_v3.21
<!-- 6-checks FRAME-CHANGELOG-APOSENTADORIA-20261006 (own verdict, nothing inherited): C1 integrity OK — Declaracao CHANGELOG template removed from E3, closing checklist updated, E5 HARD_RULE reflects retirement | C2 cohesion OK — v3.18→v3.19, VERSION_SYNC v3.18 (canonical PT bumped to v3.18 in the same frame) | C3 coherence OK — mirror of PT canonical C3: delivery trail = E3 log + graph | C4 contradictions OK — no live rule demands block/parity/CHANGELOG; retirement = deliberate event Igor 2026-10-05 (decisoes-ledger) superseding FRAME-CHANGELOG-REFORM-20261001 | C5 outdatedness OK — anchors revalidated on tree 2026-10-06 (no live references to verificar-changelog/gerar-changelog outside append-only history) | C6 complexity OK — 1 template block removed, 3 rule lines edited, 1 event note -->


<!-- 6-checks EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (own verdict, nothing inherited): C1 integrity OK — synthesis gate at E1.5 + new CHECKLIST_ENCERRAMENTO item + mini-manifesto count aligned with FDV-PATCH v1.6 (3→4 fields, coherence of the same declared field) | C2 cohesion OK — v3.15 bump aligned with FDV-PATCH v1.6 and PROTOCOL-HARDENING v1.5.0 | C3 coherence OK — cited exit codes are the ones implemented in scripts/verificar-sintese.cjs (0/1/2) | C4 contradictions OK — no live rule contradicted; F1 does not touch this FDV (it lives in FDV-PATCH ELIGIBILITY) | C5 outdatedness OK — intact in this commit's tree (script + ledger + config + 3 green suites) | C6 complexity OK — 1 E1.5 line + 1 checklist item -->

<!-- 6-checks REGISTRO-SESSAO-ISOLADA-WORKTREE-20260921 (own verdict, nothing inherited): C1 integrity OK — SINGLE HOME block + event in the chain + guard/script/doc/frame with ballast in PR #664 | C2 cohesion OK — v3.14 aligned with .clinerules (FLUXO_SESSAO_ISOLADA) and docs/FLUXO-SESSAO-ISOLADA.md | C3 coherence OK — no living rule contradicted; ADDITIVE layer (revokes nothing) | C4 contradictions OK — missing branch protection is a REGISTERED decision, not an omission | C5 outdatedness OK — anchors verified on tree 2026-09-21 (scripts + workflow + doc exist; frame flipped in PR #664) | C6 complexity OK — 5-line block + chain registration; detailed ritual lives in the single home -->

<!-- 6-checks EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001 (own verdict, nothing inherited): C1 integrity OK — E5 + checklist + event chain aligned with scripts/prune-semanal.cjs (marker `ultimaSemana`, same single `--apply` port H8, same dry-run + approval) | C2 cohesion OK — v3.17→v3.18, VERSION_SYNC v3.17 (canonical PT bumped to v3.17 in this same frame; derivation semantics kept) | C3 coherence OK — deterministic commits renamed (prune-historico semanal); canonical PT (v3.17) mirrors this block | C4 contradictions OK — E5 HARD_RULE already reflected the CHANGELOG-REFORM here; legacy `ultimaData` marker behavior declared in both languages | C5 outdatedness OK — anchors revalidated on tree 2026-10-01 @ 51a17678 (no live prune-diario/DAILY_RETENTION references outside append-only history) | C6 complexity OK — same rule count; +2 migration/event note lines -->

<!-- 6-checks EVENTO-DELIBERADO-FIM-FILA-INDIANA-20261006 (own verdict, nothing inherited): C1 integrity OK — EVENTO chain + version bump + END marker aligned with frame FRAME-FIM-FILA-EAGER-20261006 (PRs #1150/#1152/#1156/#1158 landed; fila-merge.yml and FILA_PAUSADA off main, verified via ls-tree/API 2026-10-06) | C2 cohesion OK — v3.19→v3.20 with the deliberate-event date (Igor 2026-10-06); END marker v3.19→v3.20; VERSION_SYNC cites canonical PT v3.19 (pre-existing +1 skew maintained, audited since FRAME-CHANGELOG-APOSENTADORIA) | C3 coherence OK — no rule of this fold described the queue (live "fila" grep empty before and after); completeness record, zero rules edited | C4 contradictions OK — no live mechanism assumes the queue (remaining mention is the historical audit comment of FRAME-CHANGELOG-APOSENTADORIA-20261006, untouched as a record) | C5 outdatedness OK — anchors revalidated on tree 2026-10-06 post-#1158 (Merge Gate eager active, Watchdog Acumulacao active, skills synced) | C6 complexity OK — 0 rules edited; +1 event record -->
