# PROTOCOLO-CANONICAL v1.4 — APPROVED — 2026-10-16 (deliberate event Igor 2026-10-16, PATCH-REMEDIACAO-HOMEOSTASE-20261016 item 4.2)
DERIVED_FROM: LILA-DEV/Canonical/PROTOCOLO-CANONICAL.md (dense EN translation — Governor-Dense; canonical prevails on conflict)
VERSION_SYNC: v1.4
Amendment v1.4: reclassification of §7 — derived regen moves off SAME-PR into the standing regime (async watchdog + non-blocking docs-einv-frescor; de-facto regime since FRAME-GATES-ROTINAS-DIARIAS-20261015). MECHANICAL-REGEN ≠ STATE-REMAPPING distinction stands; only WHEN/WHERE the regen lands changes.
Amendment v1.2: registration of the P0 pair E-INV-DEV (source FDV-E §4 -> generated mirrors) + §5 exception adjustment
Amendment v1.3: registration of the 6 P1 pairs (P1.6 + P1.5 + P1.1 + P1.3 + P1.4 + P1.2) in §7 — generalized transport (registry + generator + multi-pair freshness), single async gate, merge=binary + eol=lf
PRECEDENCE: subordinate to the LILA-DEV process FDVs
SCOPE: source/derived pattern of the LILA-DEV governance documentation layer

## 1. PATTERN
Every FDV and protocol of LILA-DEV exists in two layers:
- LILA-DEV/Canonical/: pt-BR, human reading, SOURCE of the decision, verbatim content
- LILA-DEV/ root: derived in high-density semantic technical English (Governor-Dense
  style), with a DERIVED_FROM header pointing to the canonical

## 2. PRECEDENCE
- Conflict between canonical and derived -> canonical prevails, always
- Version bump happens ONLY in the canonical; the derived regenerates with the same number
- The derived is never a second source of truth

## 3. TRANSPORT GATE
- Every normative element of the canonical must be traceable in the derived
- The conversion PR is born with a section-by-section mapping checklist
- Human review checks transport, not style

## 4. PER-LAYER GATES
- FDV-E 6-checks in the canonical (where human judgment lives)
- The derived gets no 6-checks of its own — only the transport gate

## 5. SCOPE OF APPLICATION (v1.3 adjustment — replaces the v1.2 line)
- Applies to: FDV-PLAN, FDV-DEV, FDV-EXEC, FDV-PATCH, PROTOCOLO-INDICES,
  PROTOCOLO-TRANSVERSAL, and this protocol — plus the P0-P1 pairs (§7, registrations v1.2-v1.3)
- Exceptions (single layer, no dual): README-DEV-AI.md (AI entry by nature) EXCEPT
  §5 (E-INV-DEV mirror, registration v1.2) and §4.X (generated tactical-area list,
  registration v1.3); INDICES.md (operational artifact). The E-INV-DEV block of
  `.clinerules` is derived (the rest of `.clinerules` = dispatcher, single layer).
  FDV-ZERO.md was removed from the active surface (sentenca G5, 2026-09-19).

## 6. KF-AREA
Compiled KF-areas come out in dense technical English (AI-consumption artifact, not
human reading) — language spec in kf-fonte.yaml (FDV-PLAN v7.1 §3-§4)

## 7. DERIVED ARTIFACT REGEN (v1.4 reclassification — deliberate event Igor 2026-10-16; pre-2026-10-15 SAME-PR rule reclassified, not erased — git keeps the trail)
- Standing regime: a PR touching a derived artifact's source does NOT need to regen in the SAME PR — freshness is held by the async watchdog regime (daily watchdogs delivering by PR + non-blocking docs-einv-frescor gate in gates-grafo.yml; pr-gate.yml frescor-free since FRAME-GATES-ROTINAS-DIARIAS-20261015). Exception: live prompt (module-map backend/src/**) stays per-PR — prompt does not tolerate 24h (frame D1).
- Distinction (unchanged): MECHANICAL REGEN (regenerating a derived from its source — allowed and mandatory, wherever it lands)
  != STATE REMAPPING (deciding where structures hang — a structural decision of its own)
- Deterministic output artifact: same tree -> same bytes, byte for byte (verify with a second
  run and empty diff when applicable)

- Registered pair P0 E-INV-DEV (v1.2, FRAME-DOCS-MECANIZACAO-P0-20261002 D3-EMENDA):
  source `src/prompts/Canonical/FDV-E.md` §4 [normative schema] -> derived
  `.clinerules` E-INV-DEV block + `LILA-DEV/README-DEV-AI.md` §5, via
  `scripts/injetar-einv-dev.cjs` (verbatim EN, 18 E-INV, idempotent); freshness by
  CONTENT via `scripts/verificar-frescor-docs.cjs` (regen in memory, byte-for-byte
  diff); own ASYNC gate `docs-einv-frescor` in `gates-grafo.yml`
  (non-blocking; promotion = future human decision); `merge=binary` + `text eol=lf`
  on both consumers; `pr-gate.yml` UNTOUCHED; conflict resolves by REGEN, never
  by line-merge

- Generalized transport P1 (v1.3, SP-DOCS-MECANIZACAO-P1a/P1b/P1.2):
  `scripts/docs-pairs.registry.json` (7 pairs, 8 derived) +
  `scripts/gerar-docs-derivados.cjs` (deterministic, idempotent, no timestamp/locale,
  flags `--check`/`--dry-run`/`--pair <id>`/`--list`/`--json`/`--live`, splice ONLY
  between `<!-- GENERATED: <id> -->` markers, missing marker = fail-closed exit 2) +
  `scripts/verificar-frescor-docs.cjs` (multi-pair, block-scoped, regen in memory,
  normalizes CRLF/LF + trailing whitespace, exit 0/1/2, accuses with pair + derived +
  sources + regen). Single ASYNC gate `docs-einv-frescor` in `gates-grafo.yml`
  (non-blocking; `pr-gate.yml` UNTOUCHED). Consumers carry `merge=binary` +
  `text eol=lf` in `.gitattributes`. Vector corpus (`README-DEV-AI.md` + `docs/*.md`):
  non-blocking gate. Conflict resolves by REGEN, never by line-merge.
- Pair P1.6 `protocolo-indices-rule3` (D5): source = `wc -l -c` measured at each regen
  (no stamp) -> derived `LILA-DEV/PROTOCOLO-INDICES.md` RULE 3 (+ graph note). The
  manual instruction "re-measured at each update" DIES in the same PR — the derived
  never tells anyone to measure by hand.
- Pair P1.5 `scripts-readme-table` (D3): sources = `scripts/*.cjs` filesystem +
  `package.json#scripts` + per-script header MINUS the dead-list of `LILA-DEV/INDICES.md`
  (anchor `Mortos em REANC-L4`). Explicit formula: alive = present − dead; a dead script
  is never listed as alive; dead x filesystem collision reported with `path:line` ->
  derived `scripts/README.md`.
- Pair P1.1 `readme-tactical-areas` (D4): sources = `LILA-DEV/kf-fonte.yaml`
  (`congelamento.areas_historicas` + KF-area slugs) + distinct(`area_tatica`) of
  `LILA-DEV/planejamento/grafo.json` -> derived `LILA-DEV/README-DEV-AI.md` §4.X.
  Hand-maintained list/count DIES inside the marker; prose outside stays byte-identical.

- Pair P1.3 `deploy-tables` (partial DEPLOY, 3 blocks `deploy-env`/`deploy-workflows`/
  `deploy-railway` via `derived_block_markers[{key,begin,end}]`): sources = `.env.example`
  + `backend/.env.example` (KEYS only, never values) + `.github/workflows/*.ya?ml`
  (names + triggers + jobs) + `.railway/railway.ts` (resource/config names) -> derived
  `docs/DEPLOY.md`. Normative prose, smoke checklists, operational history and lessons
  stay MANUAL outside the markers.
- Pair P1.4 `localstorage-keys` (D1, INVERSION): DATA source = code (grep localStorage in
  `src/lib/**`, scope printed in the block) + `DEAD_STORAGE_KEYS`
  (`src/lib/storage-hygiene.ts`) and comment-declared deaths (`src/lib/softcontext.ts`).
  Formula: alive = code_found − dead_declared; a ghost is never listed as alive.
  Two-layer authority (MANUAL prose outside the marker, one-time):
  "Normative authority: AI-PROJECT-MANIFEST §A1; data source: code scan at regen time."
  `scripts/verificar-localstorage-keys.cjs` becomes a CONSUMER of the generated block
  (it does not duplicate the scan). -> derived `docs/LOCALSTORAGE-KEYS.md`.
- Pair P1.2 `tests-structure` (D6, 2 blocks `tests-path-gate`/`tests-e2e-gold`, HARD
  CHURN RULE): LIVING sources `vitest.config.ts` + `backend/vitest.config.ts`
  (`test.coverage.thresholds`, 10 gates) + `test/e2e/*.spec.ts` filesystem (gold =
  `g<N>-*` members) + `LILA-DEV/kfs/kf-testes.md`. KF-TEST-REGRESSION (frozen C2) is
  NEVER a source (fail-closed if cited). The block materializes ONLY structure
  (PATH-GATE rows + gold list + source links + the line "Live numbers: run — never
  hand-copied here"); counts/coverage/dates NEVER enter the committed block (only a
  changed threshold or an add/remove of a gold member makes it stale). Live numbers =
  `--live` on stdout, never writes; `--check` ignores `--live`. -> derived `docs/TESTING.md`.

**END OF PROTOCOLO-CANONICAL.md v1.3**
