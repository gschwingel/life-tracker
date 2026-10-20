# MAPA-PROJETO — life-tracker

atualizado_em: 2026-10-20
camada: PROJETO (substitui `docs/AI-PROJECT-MANIFEST.md` — ver PROTOCOLO-LOCAL §3.5)
uso: lastro de localização. Antes de criar arquivo novo, leia o §4 — o lugar da mudança já existe.

## 1. ÁRVORE VIVA (o que conta como código do produto)

```
life-tracker/
├─ index.html                 # shell: <div id="root"> + /src/main.tsx, lang="pt-BR"
├─ vite.config.mjs            # Vite + plugin-react + VitePWA (manifest, autoUpdate, ícones)
├─ tsconfig.json              # strict, noUncheckedIndexedAccess, noEmit; include: ["src"]
├─ package.json               # scripts: dev | build | preview | typecheck | governanca:validar | validate
├─ public/                    # icon-192.png, icon-512.png (servidos na raiz)
├─ src/
│  ├─ main.tsx                # bootstrap React (StrictMode) — único createRoot
│  ├─ App.tsx                 # tela "Hoje": form, carga do dia, handleSave
│  ├─ index.css               # estilo global (sem framework, sem CSS modules)
│  ├─ vite-env.d.ts
│  └─ db/
│     ├─ database.ts          # SCHEMA (4 tabelas) + getDb() + persist()
│     └─ idb.ts               # IndexedDB puro: loadDbBytes / saveDbBytes
├─ LILA-DEV/PROJETO/          # camada de regras viva (PROTOCOLO-LOCAL, ESTADO, DECISOES, LOG, MAPA, REGRAS)
├─ LILA-DEV/                  # FDVs/protocolos herdados (referência; filtrados pelo PROTOCOLO-LOCAL §2)
└─ .clinerules                # dispatcher local v2.0
```

Fora do produto (não são lastro de nada): `dist/` (build), `node_modules/`, `.vercel/`,
`LILA-DEV/herdado/` (arquivo morto), `scripts/` herdados (ver `scripts/APLICATIVIDADE.md`).

## 2. FLUXO DE DADOS (único caminho existente)

```
navegador abre
  └─ main.tsx → App
       ├─ App.useEffect → getDb()
       │     ├─ idb.loadDbBytes()            (IndexedDB: life-tracker/sqlite/main)
       │     ├─ new SQL.Database(bytes)      (ou base vazia)
       │     └─ db.run(SCHEMA)               (CREATE TABLE IF NOT EXISTS)
       └─ SELECT do dia → setForm(...)
Botão Salvar
  └─ handleSave() → db.run(upsert ...) → persist()
        └─ setTimeout 300ms → idb.saveDbBytes(db.export())
```

Não existe: rede, API, servidor, fila, worker, estado global, rota.

## 3. ONDE CADA MUDANÇA ATERRISSA

| Pedido | Arquivo | Classe |
|---|---|---|
| novo campo na tela de hoje | `src/App.tsx` (+ `SCHEMA` se precisar de coluna) | PATCH se só UI; ESTRUTURAL se mexe no schema |
| novo tipo de registro/dia | `SCHEMA` em `src/db/database.ts` + `App.tsx` | ESTRUTURAL (dado do usuário) |
| estilo/aparência | `src/index.css` | PATCH |
| instalação/PWA/ícone/manifest | `vite.config.mjs`, `public/` | ESTRUTURAL se muda manifest/identidade |
| nova tela/rota | não existe roteador — **exige decisão** (P1) | ESTRUTURAL |
| backup/export | não existe — **exige decisão** (P1) | ESTRUTURAL |
| regra de processo | `.clinerules`, `LILA-DEV/PROJETO/*` | PATCH documental |

## 4. FRONTEIRAS

- **Dado do usuário é irreversível** (IndexedDB local): schema, migração ou delete nunca é PATCH.
- `src/db/idb.ts` é a **única** porta para IndexedDB; ninguém mais chama `indexedDB` diretamente.
- `src/db/database.ts` é a **única** fonte de DDL e o **único** dono do singleton `db`.
- `App.tsx` hoje concentra UI + query + regra de gravação. Ao passar de ~400 linhas, extrair
  camada de dados para `src/db/repo.ts` — **antes** de adicionar a 2ª tela (decisão ESTRUTURAL).
