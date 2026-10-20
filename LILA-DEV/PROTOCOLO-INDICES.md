# LILA-DEV — Indices Consumption Protocol
DERIVED_FROM: LILA-DEV/Canonical/PROTOCOLO-INDICES.md (dense EN translation — Governor-Dense; canonical prevails on conflict)
VERSION_SYNC: canonical without version number (last content update T7C 2026-09-02)

> Mandatory protocol document for any agent consuming indices. Defines how each index must be read and which scripts to use. Protocol violation generates stall by context truncation — the behavior to eliminate.

---

## 1. RULE 1 — Literal lookup by native grep (reverse index DEAD)

The fragmented reverse index (`indice-reverso/`), its generator (`gerar-indice-reverso.cjs`), the lookup (`buscar-simbolo.cjs`) and the criterion module (`lib/fragmentacao.cjs`) **left the active surface** — sentence **I1** executed in `FRAME-REANC-L4-OPS-20260920` (2026-09-20, REANC-L4). The agent locates symbol/path with **native grep** over the real repo tree.

**Forbidden to reintroduce an equivalent** (symbol index, path catalog, own lookup) **without an explicit value thesis** and a comparison with native tools. The artifact's history is preserved in git (TCC constraint).

## 2. RULE 2 — Freshness pipeline before consuming

**Regime vigente (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015, Igor 2026-10-15):** o frescor dos índices é dos WATCHDOGS DIÁRIOS — `indices-textual-watchdog.yml` (05:20 UTC; textuais + MANIFEST + pares) e `indices-vetorial-watchdog.yml` (04:30 UTC; `.bin`/`.json` vetorial). Ambos entregam por PR com required checks; nenhum gate por-PR reprova staleness. Nenhuma rodada de regen é devida no encerramento de patch/frame.

Consumo em sessão:

- Consumir direto — staleness de até ~24h é aceito por desenho (D1 do frame; docs de localização são coarse).
- **Detecção sob demanda (trigger C6):** se o índice consumido estiver stale e atrapalhar (`npm run indices:check`, exit 1), regenere (`npm run indices` ou o gerador único do artefato) e embarque NO commit de conteúdo — verificação barata, sem gate, sem dívida.
- Pipeline/vetorial CASA ÚNICA: este capítulo (RULE 2) — `PROTOCOLO-TRANSVERSAL`, `INDICES.md`, `FDV-PATCH` e `FDV-EXEC` apontam para cá e nunca re-encodam.

The pipeline covers **all** indices in the `LILA-DEV/INDICES.md` inventory, including the **vetorial index** (`indice-vetorial.json` + `.bin`) — **freshness by `fileHash`**, verified per chunk. **This chapter (RULE 2) is the SINGLE HOME of the freshness pipeline (sentenca G3)** — the other documents point here and never re-encode.

**G6 — local regeneration is NOT a recurring obligation of the agent (REANC-L4, 2026-09-20):** the vetorial's freshness outside the PR window is the **CI watchdog**'s responsibility (`.github/workflows/indices-vetorial-watchdog.yml` — the only vetorial workflow; it absorbed the daily cron and `cron-vetorial-fixup.cjs` under sentence O3). The blocking local-regen obligation at structural closing and the "vetorial not regenerated" debt class (`patch-debt.json`) **died**: embedding failure due to environment (missing key/API) no longer creates debt. The agent regenerates **on demand** — when it needs to consume an index whose content changed — and the closing **verifies** freshness (by content/`fileHash`).

**Selective regen — `npm run indices:smart` (PATCH flow):** exit 1 does not demand the full `npm run indices` — `node scripts/gerar-indice-smart.cjs` runs only the generators of stale indices (rastreabilidade; incremental vetorial). `npm run indices:related` (verificar-frescor-indices.cjs `--related`) verifies only indices whose covered directories intersect the patch's changed files. The full `npm run indices` remains for CI and the structural flow.

**Vetorial freshness (fileHash, not mtime):** `npm run indices:check` runs `verificar-frescor-indice-vetorial.cjs` after the generic checker — compares each chunk's `fileHash` in the sidecar with the current hash of the source file. Exit 1 = content changed -> `npm run indices:vetorial` (incremental re-embeds only the changed ones).

**sidecar-to-bin integrity:** `npm run indices:status` (validar-integridade.cjs) validates `chunks.length × 1536 × 4 == .bin.size` and monotonic offsets — truncated/corrupted `.bin` = 🔴 error (cognitive friction, not self-repairing).

**Vetorial tests:** `npm run test:scripts` (node:test) runs 26 tests (cosine, threshold calibrated 0.40 with gate recall@5>=83%, chunking, embedding client, incremental generator, fileHash checker) — part of `test:all`/`test:ci`.

**CONVENTION — content-based freshness (I5, REANC-L4 2026-09-20; replaces the 2026-09-04 timestamp convention):** rastreabilidade and manifest are verified by **offline regeneration in tmp + content comparison** (ignoring only `geradoEm`/`generatedAt`); the vetorial by **`fileHash` per chunk**. Operational consequences:

1. **Flow closing**: regenerate the live indices (`npm run indices` + `indices:check` + `indices:status`) when covered content changed; CI (`gates-grafo`) regenerates and compares **content** against the committed state. Since G6 (REANC-L4), vetorial regeneration outside the PR window belongs to the watchdog — the closing **verifies**, it does not regenerate by obligation.
2. **FORBIDDEN to open a "freshness-only" PR**: committing a regen with identical content to "clear the stale" creates a new merge commit that makes the index stale again (infinite PR loop). An indices PR is only legitimate with a **content change** (covered files truly changed, e.g. new code/docs/prompts).

## 3. RULE 3 — Safe consumption per index

<!-- GENERATED: protocolo-indices-rule3 DO NOT EDIT — source: measured wc -l -c on LILA-DEV/indice-rastreabilidade.json, indice-vetorial.json, indice-vetorial.bin (gerador: scripts/gerar-docs-derivados.cjs) -->
| Index | How to consume | Typical size |
|--------|--------------|----------------|
| `LILA-DEV/indice-rastreabilidade.json` | **never single read** — `grep`/`outline`/pagination (`start_line`/`end_line`) mandatory | 282.9 KB / 7,932 lines |
| `indice-vetorial.json` | direct `read_file` for metadata only ({version, model, dimensions, generatedAt, chunksLength}); never the full content (18.1MB+ — paginate/avoid) | 18.1 MB / 97,139 lines |
| `indice-vetorial.bin` | **never** `read_file` — LFS binary; query only via `node scripts/buscar-vetorial.cjs` | binary (63.2 MB) |

**REANC-L4 / I1+I3+I4 (2026-09-20):** `indice-reverso/*.json` (with `buscar-simbolo.cjs`), LILA-DEV/matriz-cobertura-decisoes.json and LILA-DEV/indice-testes.json **no longer exist** (removidos 2026-09-26 — higiene de morte) — they left the active surface with their generators and gates. Literal lookup = native grep; coverage = rastreabilidade; test discovery = the runner.

**COLLISION LINE (P4):** **literal** lookup (native grep over the tree — former reverse/`buscar-simbolo.cjs`) ≠ `indice-vetorial.json`/`indice-vetorial.bin` + `buscar-vetorial.cjs` (**semantic** by embedding). Distinct concepts — do not confuse; only the semantic use remains indexed.

Criterion: direct read (`read_file` in full) ONLY if the file has <= 1,000 lines **AND** <= 100 KB. Above either limit: `grep`/`outline`/pagination (`start_line`/`end_line`) or a lookup script — never a single read. The sizes in the table above are **GENERATED** from measurement at regen time — never hand-edited (marker above).

**Explicit graph consumption note (INDICES-TESTES 2026-09-02; revisao 2026-10-11):** `LILA-DEV/planejamento/grafo.json` (source, not generated — tamanho NAO medido aqui: e arquivo quente, reescrito a cada merge, e medir-lo tornava este par instavel entre o branch e o merge-ref do CI) is consumed ONLY via outline/pagination (`start_line`/`end_line`) or script (`grep` by KF/FR, `lila-grafo-mcp` `read_node`) — **full read forbidden** (§3 limit: <= 1,000 lines AND <= 100 KB).
<!-- /GENERATED: protocolo-indices-rule3 -->

**Rastreabilidade integrity semantics (AUDITORIA-DOCS-REPO-20261009, N-01 — Igor decision 2026-10-09, criterion: AI state-reading proprioception):** per node, `integridade` = trail verifiability: 🟢 = snapshot + E3 log exists (hot under `logs/` OR pruned to `logs-arquivo/`); 🟡 = snapshot with NO log anywhere (real gap); 🔴 = no snapshot (and ⚫ via `estadoEfetivo` for deprecated nodes). `logCaminho` carries the evidence path itself (prefix `logs-arquivo/` = cold storage) — replaced the boolean `logExiste`, which misreported archived trails as 🟡 (150 nodes on the finding date) and degraded monotonically with each weekly prune.

## 4. RULE 4 — Semantic search script failure

If `buscar-vetorial.cjs` (the only remaining index lookup) fails:

1. Report the error.
2. **Do not** try to read the `.bin` or the sidecar as a fallback.
3. Operate without the data (native grep covers literal lookup) or run `npm run indices:vetorial` to regenerate.
4. If the failure persists, open P1/P2 per the FDV protocol in force — and the CI watchdog covers freshness outside the PR window (G6).

## 5. RULE 5 — Precedence (the former RULE 5 — reverse-index expansion — died with the surface in REANC-L4 / I1)

This protocol is subordinate to `LILA-DEV/INDICES.md` (canonical management document of the indices). On divergence, INDICES.md prevails.

**Carve-out (sentenca G3):** RULE 2 (freshness/vetorial pipeline) is the SINGLE HOME of the pipeline — `PROTOCOLO-TRANSVERSAL`, `INDICES.md` and `FDV-PATCH` point to it and never re-encode. The precedence above applies to the index inventory/management, not to this pipeline chapter.

## 6. RULE 6 — Anti-corruption of the vector pair (sidecar+bin are ATOMIC)

The sidecar (`indice-vetorial.json`, chunk metadata + offsets) and the bin (`indice-vetorial.bin`, Float32 vectors) only make sense TOGETHER. A line-merge of one plus a silent resolution of the other (the old `merge=lfs` + plain-text merge) swaps vectors between chunks — **SILENT corruption**: RULE 2 still passes (`fileHash` validates source↔chunk; only vetor↔chunk is broken). Incident: 2026-09-23 (E3 §5.8 of `PATCH-STREAM-RESILIENCIA-20260923`; measured: 21/24 samples out of sync, 8 golden ground-truths knocked out by noise).

1. **`.gitattributes` (enforced):** every GENERATED artifact (`indice-vetorial.*`, `indice-rastreabilidade.json`, `AI-PROJECT-MANIFEST*`) carries `merge=binary` — divergence becomes an EXPLICIT conflict (measured: exit 1 + `UU` state). Generated artifacts are **never merged by content**; the generator is the single source of truth.
2. **Merge resolution procedure (the only sanctioned one):**
   - `git checkout --ours -- indice-vetorial.json indice-vetorial.bin LILA-DEV/indice-rastreabilidade.json docs/AI-PROJECT-MANIFEST.md docs/AI-PROJECT-MANIFEST-INDEX.md`
   - `npm run manifest:gerar && npm run indices && npm run indices:manifest` — order matters: manifest BEFORE the vectorial build (the manifest is part of the corpus);
   - freshness checks (RULE 2) green before committing the merge. A forgotten regen is DETECTABLE staleness (RULE 2); it never becomes silent corruption, because `merge=binary` keeps the pair atomic (ours-consistent).
3. **Alignment verifier — `npm run indices:alinhamento`:** validates vetor↔chunk in two layers: structural (sidecar `offset`/`length` are in FLOATS — measured convention: `offset/dim === i`, `length === dim`, byte offset = `offset*4` — plus exact bin size — free) and semantic sample (re-embed of ~24 chunks via the same `embedding-client` — cents per run). MUST run after any merge that touched the generated artifacts (step 4 of the procedure above) and before trusting rankings after an anomaly. Exit 2 without `OPENROUTER_API_KEY` = fail-closed: the semantic claim is never made without measurement (`--so-estrutural` runs layer 1 alone, explicitly logged).
4. **Verifier red (semantic misalignment) → TOTAL rebuild:** `rm indice-vetorial.json indice-vetorial.bin && npm run indices` (full re-embed). The incremental `fileHash` cache cannot heal a scrambled pair — it would PRESERVE the wrong vectors.

**END OF PROTOCOLO-INDICES.md**

