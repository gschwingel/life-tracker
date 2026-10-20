meta: format=AI-AI | audience=AI | human_readable=false | density=max | prose=0 | version=3.0 | last_update=2026-10-20 | status=APPROVED | path=docs/AI-PROJECT-MANIFEST.md | generated=true | fonte=docs/manifest-fonte.yaml
# AI-PROJECT-MANIFEST — Lila C137
authority:
  A1 | precedence | AI-PROJECT-MANIFEST.md > docs/ on conflict
  A2 | header_req | docs/ files MUST include Version, Last update, Status, Authority referencing A1
  A3 | traceability | info without source code/snapshot/authority doc = no-lastro, remove or mark verify
  A4 | generated | este arquivo e ARTEFATO GERADO por scripts/gerar-manifest-esqueleto.cjs | editar docs/manifest-fonte.yaml ou a arvore, nunca o .md a mao

#1 IDENTITY

  project: life-tracker
  kind: local-first PWA — single screen "Hoje", no backend, no auth, no network calls
  domain_language: pt-BR in code and database (peso, treino, cardio, estudo, aporte, dia)
  authority: LILA-DEV/PROJETO/ESTADO-ATUAL.md > this manifest (DEC-010)
  deploy: Vercel — vite build -> dist/ (static)

#2 STACK AND COMMANDS

  runtime: react 19 + react-dom 19 | persistence: sql.js 1.12 (WASM) -> IndexedDB
  build: vite 6 + @vitejs/plugin-react + vite-plugin-pwa (autoUpdate)
  types: typescript 5.7 strict (noEmit, noUncheckedIndexedAccess, noUnusedLocals)
  commands: npm run dev | npm run build | npm run preview | npm run typecheck | npm run governanca:validar | npm run validate
  absent: test runner, lint, CI, backend, API, auth, schema migration

#3 DIRECTORY ARCHITECTURE

  index.html | shell: <div id="root"> + /src/main.tsx, lang="pt-BR"
  src/main.tsx | React bootstrap (StrictMode, single createRoot)
  src/App.tsx | screen "Hoje": form state, load of current day, handleSave
  src/index.css | global styles (no framework, no CSS modules)
  src/db/database.ts | SCHEMA (4 tables) + getDb() + persist() — only DDL owner
  src/db/idb.ts | IndexedDB port: loadDbBytes / saveDbBytes (life-tracker/sqlite/main)
  vite.config.mjs | Vite + PWA manifest, icons 192/512
  public/icon-192.png | PWA icon
  public/icon-512.png | PWA icon

#4 PERSISTENCE AND DATA MODEL

  path: getDb() -> loadDbBytes() -> new SQL.Database(bytes) -> db.run(SCHEMA); write -> persist() (300 ms debounce) -> saveDbBytes(db.export())
  tables: daily_logs (UNIQUE dia,domain — EAV) | cardio_logs (UNIQUE dia) | invest_transactions (aporte per data) | portfolio_positions (declared, UNUSED)
  migration: none — CREATE TABLE IF NOT EXISTS only; schema/data change is STRUCTURAL (DEC-006)
  risks: no backup/export (IndexedDB only); 300 ms debounce without flush on unload

#5 GATES AND PROCESS

  gate: npm run typecheck && npm run governanca:validar (+ npm run build when src/ changes) — LILA-DEV/PROJETO/PROTOCOLO-LOCAL.md 3.1
  modes: PATCH | ESTRUTURAL-PLAN | ESTRUTURAL-ACT — dispatcher .clinerules v2.0-LOCAL
  live_state: LILA-DEV/PROJETO/ESTADO-ATUAL.md | decisions: LILA-DEV/PROJETO/DECISOES.md
  planning_mirror: LILA-DEV/planejamento/grafo.json + snapshots SP-01/FR-01..FR-03 (DEC-009, non-authoritative)

<!-- gerado: 2026-10-20T17:01:40-03:00 | arvore_hash: 5ca64ba73097990d | arquivos: 203 | fonte: docs/manifest-fonte.yaml -->
<!-- bootstrap retroativo DEC-009/DEC-010 — skeleton as-built; autoridade de estado em LILA-DEV/PROJETO/ -->
