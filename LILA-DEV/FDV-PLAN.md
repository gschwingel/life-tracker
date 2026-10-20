FDV-PLAN v7.3 — APPROVED — 2026-10-02
DERIVED_FROM: LILA-DEV/Canonical/FDV-PLAN.md (dense EN translation — Governor-Dense; canonical prevails on conflict)
VERSION_SYNC: v7.3
Amendment v7.3: RELATION TO ACTIVE DECISIONS — mandatory field in new snapshots +
mandatory consultation before crystallizing + incremental-draft pointer
(Deliberate Event FRAME-LACO-ESTADO-20261002 — Igor decision, ZCode session 2026-10-02)
Amendment v7.2: OUTPUT_LANGUAGE (Deliberate Event EVENTO-AIFIRST-TEMPLATES-20260929 — Igor decision, sprint SP-AIFIRST-DEFAULT-20260929 F5)
Amendment v7.1: ORIGEM field in the decision record (framework-carried model requirement,
Deliberate Event "KF as Positioning and State" — state phase)
Deliberate Event: "KF as Positioning and State" (session 2026-09-13)
OUTPUT_LANGUAGE: every artifact produced by the flow is born AI-AI in dense EN per docs/AI-IAIA-GRAMMAR.md — sprint/frame snapshots and the cycle's other artifacts. Script contracts stay VERBATIM: decision card keys (DECISAO/TIPO/AREA_TATICA/TOMADA_POR/ORIGEM/SUPERSEDE/VALIDACAO), snapshot header keys (**Área tática:** **Tipo:** **Versão:** **Data:** **Status:** — index generator regex). Lila→human communication stays PT. Existing historical stock is NOT translated (SP-AIFIRST-DEFAULT-20260929 D2).
PRECEDENCE: subordinate_to FDV-Principal FDV-E
SCOPE: system work entry, decomposition, allocation, decision registration, KF-area
compilation, gates, discovery. Absorbed FDV-ZERO (removed from the active surface — 2026-09-19, sentenca G5).
DOCUMENT STANDARD: this document follows PROTOCOLO-CANONICAL (source at LILA-DEV/Canonical/).

## 1. WORK UNITS
- 3-level tree: KF-area (state projection, generated) -> SP (execution unit) -> FR (addressable canonical unit)
- Campaign level: DOES NOT EXIST. Cross-area grouping = `campanha:` tag on SPs (query metadata only)
- frame vs patch classifier: a document IS frame/sprint IF AND ONLY IF it holds at least one record
  under DECISIONS or EXPECTED BEHAVIORS. Without that = patch prompt (FDV-PATCH), outside the tree
- every SP declares PROTOCOLO_GOVERNANTE = the KF-area whose protocol governs the activity
- SP governed by two protocols = mandatory split (no exception)

## 2. DECISION REGISTRATION (in the FR — the only decision-writing surface)

```
DECISAO: [statement]
TIPO: negocio | tecnica | comportamento
AREA_TATICA: [SINGLE area]
TOMADA_POR: humano | Lila
ORIGEM: framework | projeto
SUPERSEDE: [D-id] | NENHUMA
VALIDACAO: [teste | gate | observavel]
```

Rules:
- AREA_TATICA mandatory in EVERY FR, with or without decisions (system join key)
- mandatory granularity: every decision/behavior traceable to exactly ONE area; no secondary area;
  a record spanning two areas = split at write time
- one FR may hold decision records of multiple areas — each record points to its own area
  (therefore to its own KF-area) individually
- TIPO negocio -> TOMADA_POR: humano (FDV-Principal frontier, non-delegable)
- TIPO tecnica/comportamento -> delegable per FDV-E §7 (describe risk -> classify -> confirm)
- IDs minted at origin (FR), stable across regenerations
- supersession declared at write time; propagation (tombstone, recompile) is mechanical
- expected behaviors (B-ids): same lifecycle as D-ids
- feature death: the FR that removes the feature declares the death (supersession) of its decisions
- ORIGEM framework = framework-carried decision: inherited with the process install into new
  projects; changing it requires declared supersession preserving the historical origin
- ORIGEM projeto = decision authored by the project (boot or life)
- ORIGEM persists through compilation: the KF-area displays the origin of every decision in the
  VIGENTES and DEPRECATEDS sections

### RELATION TO ACTIVE DECISIONS (mandatory at crystallization — Amendment v7.3)

Every new crystallization declares its relation to the standing state — this is what
prevents a new snapshot from silently invalidating an old active decision (the known
E3.5 limit: an undeclared contradiction is undetectable). Mandatory field in EVERY
new snapshot (frame, sprint and `[ID]-patch.md`), written on the line that opens the
decisions section — keys verbatim (line anchor; prose mention does not count):

```
Relacao decisoes ativas: sem-contradicao — verificacao: <declared source>
Relacao decisoes ativas: substitui <ID>[, <ID>...] — deprecacao: <state>
```

Rules:
- determining the relation REQUIRES consulting the area's active decisions BEFORE
  crystallizing: active units of the area in the grafo + direct read of the touched
  canonicals; vetorial (`buscar-vetorial`) when available
- `sem-contradicao` carries the verification source (direct read, grafo, vetorial)
- `substitui` cites IDs in the `decisoes-ledger.json` format (`unidades[].id`,
  `<NODE>.U<n>`); the matching deprecation is registered at closing
  (`register_unit` + `deprecate_unit` via lila-grafo-mcp) — the pr-gate mechanical
  check (`verificar-relacao-decisoes.cjs`) validates existence and `deprecated` status
- indeterminable relation = P1 (existing flow) — never fill by inference
- mechanical gate scope: snapshots ADDED in the PR (no retroactivity —
  Modified/Renamed/Copied exempt; historical stock untouched)

### INCREMENTAL SNAPSHOT DRAFT (pointer — single home in TRANSVERSAL §2.2)

The frame/sprint snapshot DRAFT may be written and committed incrementally during
PLAN (commit per deliberate decision, on the session branch) — it protects the
decision from session death before crystallization. Full norm (narrow exception and
its limits): `PROTOCOLO-TRANSVERSAL.md` §2.2 BATCH_ENCERRAMENTO — forbidden to
re-encode here.

## 3. KF-AREA (materialized projection — never hand-edited)
- named by slug (KF-BACKEND, KF-RITUAIS...), no numbering
- sections: meta {gerado_em, commit_fonte, compilador, hash_fonte} | ESCOPO | DECISOES VIGENTES |
  COMPORTAMENTOS ESPERADOS | DECISOES DEPRECADAS (tombstone: executor + motivo + origem) |
  MAPA DE ARQUIVOS
- NO farol: execution state is a property of SP/FR; KF-area carries only generation meta
- compiled in high-density technical English (language spec in kf-fonte.yaml)
- canonical truth of STATE (every "what is valid" read passes through here)
- FR/SP immutable = canonical truth of PROVENANCE (why, when, who, context)

## 4. CURATION SOURCE (kf-fonte.yaml)
- single file: partitioning, scopes and boundaries of all KF-areas
- re-cutting the partitioning = light Deliberate Event (single-focus, freeze, 6-checks on the source)
- per-layer gates (pattern of the R-ESCRITA-GATE-6CHECKS exception): 6-checks on the curated source;
  mechanical gates on the generated artifact

## 5. COMPILATION AND GATES
- compiler: scripts/ at repo root, trunk file, deterministic, non-interactive
- build order: compiler validated first against a KF-Padrao (predictable) before product KFs
- mechanical gates (merge blocking in CI, exhaustive):
  G1 coverage — every FR with valid and unique AREA_TATICA
  G2 supersession — targets exist, no orphans, no cycles
  G3 determinism — same tree -> same KF byte for byte
  G4 freshness — hash_fonte of the committed KF == hash of the current tree
- semantic gate (blocking): FDV-E 6-checks over the INTERNAL integrity of the compiled document;
  quality model, temperature zero, READ-ONLY (emits verdict, never edits content)
- boundary: semantic gate = internal to the doc; reality vs documentation = discovery (§6)
- semantic gate trigger: every compile with decision changes + mandatory weekly cron;
  verdict of a no-change cycle marked as no-op
- verdict versioned next to the KF: model, prompt-hash, individual checks, pass/fail
- freshness states (COMPUTED at read/CI time, never stored as an editable field):
  fresco | stale | bloqueado — bloqueado requires action; the only correction path is upstream
  (FR/SP source + recompile); KF has no manual-edit path, no exception

## 6. DISCOVERY (radar, not gate)
- on-demand (human or Lila proposes), ceiling of one cycle per month
- modes:
  M1 reality ⊃ log — behavior executed without a decision -> retroactive FR with mandatory marker of
     TWO dates: "retroactively formalized on [date] over behavior in production since [commit/date]"
  M2 log ⊃ reality — zombie decision -> flags the conflicting pair; correction direction
     (stale doc vs drifted code) is a human decision
  M3 undeclared contradiction — LLM-assisted sweep; digest feeds triage, never decision
     (R-DIGEST-NAO-CANONICO)
- per-cycle report at LILA-DEV/planejamento/discovery/
- every finding is born with a mandatory destination: retroactive FR | retroactive supersede | code fix
- honest guarantee: the implicit space shrinks monotonically, never reaches zero;
  a clean sweep != absence of contradiction

## 7. MIGRATION (one-time, mechanical — R-DADO-GRANULAR-DIFF)
- KF-01..22: frozen as history (banner, read-only, do not affect evolution)
- existing SP/FR: remapped to working KF-areas via protocol-governante + tactical area;
  PAI field in grafo.json; coverage matrix and indices regenerated
- live decisions without an FR source: retroactive migration FR per old KF — assisted extraction,
  validation against the repo, human validation ONE KF AT A TIME
- validation material in the cheap-to-check format: extracted decision + source-line citation in the
  old KF, one per line
- FDV-ZERO: removed from the active surface (absorbed here; historical record preserved in git — sentenca G5, 2026-09-19)

- KF-Padrao = default entries in kf-fonte.yaml + documented in README-DEV-AI;
  new projects are born with them; content defined in its own phase
- partitioning declared as human curation, not derivation
