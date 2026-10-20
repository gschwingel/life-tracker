# FR-02-log — retroactive formalization (bootstrap 2026-10-20)

ID: FR-02
TIPO: retroactive (no code change)
DATA: 2026-10-20
LASTRO: commit e0b1ee7 (2026-10-20) — src/db/database.ts, src/db/idb.ts, src/App.tsx (handleSave)
ATORES: humano (decisao) + IA (formalizacao mecanica, DEC-009)
ATOS:
- A1 READ as-built: upserts in daily_logs/cardio_logs, delete+insert of aporte, persist() 300 ms.
- A2 WRITE snapshot LILA-DEV/planejamento/snapshots/frames/FR-02.md (observable behavior only).
- A3 VALIDATE: GATE_LOCAL (typecheck + governanca:validar + build) and validar-integridade.
RESULTADO: green; runtime behavior unchanged (zero write to src/).
NOTA: log nasce retroativo — nao houve execucao de frame em sessao (DEC-009).
