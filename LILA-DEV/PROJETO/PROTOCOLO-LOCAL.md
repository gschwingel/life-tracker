# PROTOCOLO-LOCAL v1.0 — ADAPTAÇÃO DO MÉTODO LILA-DEV AO REPO life-tracker

atualizado_em: 2026-10-20
status: vigente
autorização: dono do projeto, 2026-10-20 — "adapte a estrutura e as regras para a realidade do projeto"
lastro: leitura direta de `package.json`, `tsconfig.json`, `vite.config.mjs`, `index.html`, `src/**` e `git ls-files` em 2026-10-20 (nada aqui é inferido; toda linha tem evidência no §1)
precedência: **sobre** os FDVs e protocolos herdados. O que este documento não suspende continua valendo verbatim.

> **Por que este documento existe.** O método LILA-DEV herdado foi escrito para um monorepo
> (frontend + backend + Postgres/Railway + MCP de grafo + índices vetoriais + CI com PR
> obrigatório + sessões em worktree). Este repositório é um PWA local-first com uma única
> tela de domínio. Rodar as regras herdadas sem filtro produz gate vermelho permanente,
> blocos inexecutáveis e a IA tentando usar infraestrutura que não existe. Este protocolo
> corta o herdado na fronteira do que existe, preserva os invariantes e dá um substituto
> local para cada mecanismo perdido.

---

## 1. REALIDADE MEDIDA (evidência, não opinião)

| # | Fato | Evidência no repo |
|---|------|-------------------|
| 1 | App web local-first, sem backend | `package.json` (deps: react, react-dom, sql.js) — sem express/fastify/prisma |
| 2 | Build: Vite 6 + PWA `autoUpdate` | `vite.config.mjs` (`VitePWA`, manifest, ícones 192/512) |
| 3 | TypeScript strict, sem emit | `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noEmit`) |
| 4 | Persistência: sql.js (WASM) → bytes → IndexedDB | `src/db/database.ts` (`db.export()`), `src/db/idb.ts` (store `sqlite`, chave `main`) |
| 5 | 4 tabelas | `SCHEMA` em `src/db/database.ts`: `daily_logs`, `cardio_logs`, `invest_transactions`, `portfolio_positions` |
| 6 | Superfície de UI: **1 tela** ("Hoje") | `src/App.tsx` — peso, treino, cardio, estudo, aporte |
| 7 | Sem testes, sem lint, sem CI | nenhum `vitest/jest/eslint` em `package.json`; `.github/` ausente |
| 8 | Sem grafo, sem snapshots, sem KF, sem índices | `LILA-DEV/planejamento/` ausente; `indice-vetorial.*` ausente |
| 9 | Sem MCP de processo | `scripts/` referencia `lila-grafo-mcp`/`lila-auditoria-mcp`; nenhum server configurado aqui |
| 10 | Deploy: Vercel | `.vercel/project.json`; `.gitignore` cobre `.vercel` e `dist/` |
| 11 | Domínio em pt-BR no código e no banco | colunas `dia`, `domain`, `tipo`, `aporte`, `valor` |
| 12 | `node_modules` **rastreado** no git (10.637 arquivos) | `git ls-files` — defeito de higiene do primeiro commit |

## 2. SUSPENSO (não executar neste repo)

| Bloco herdado | Onde estava | Por que não se aplica | Substituto local |
|---|---|---|---|
| `LANES` (DOCS / LILA-WRITE / TRIVIAL) + `merge-gate`/`pr-gate`/`gates-grafo` | `.clinerules` v1.14 | não há CI, PR obrigatório nem `docs/FLUXO-LANES.md` | `GATE_LOCAL` (§3.1) |
| `FLUXO_SESSAO_ISOLADA` (worktree, `sessao:nova`, `.sessao.json`, fila de merge) | `.clinerules` v1.14 | repo de um desenvolvedor, `main` local, sem fila | trabalho em `main` + `LOG.md` |
| `SKILL_FILA_DRENAGEM`, `LIMPEZA_SESSAO` | `.clinerules` v1.14 | dependem de fila de PRs e `scripts/fila-diagnostico.cjs` | — (sem fila, sem gatilho) |
| `FLUXO_GRAFO_MCP`, `FLUXO_AUDITORIA_MCP`, `MULTIPROJETO` (poseidon/`C:/LilaV2`) | `.clinerules` v1.14 | sem `grafo.json`, sem servidores `lila-*`, sem segundo projeto | `ESTADO-ATUAL.md` + `DECISOES.md` |
| `INDICES` / `PROTOCOLO-INDICES` (vetorial, rastreabilidade, watchdogs) | `LILA-DEV/INDICES.md` | nenhum índice existe; não há corpus a indexar | leitura direta dos 6 arquivos de `src/` |
| Regen do bloco `E-INV-DEV` (`injetar-einv-dev.cjs` ← `src/prompts/Canonical/FDV-E.md`) | `.clinerules` v1.14 | arquivo-fonte ausente neste repo | bloco passa a ser **home única** aqui (DEC-005) |
| Snapshots KF/SP/FR, logs E1–E5, `CHANGELOG`, `validacao/`, `patch-debt.json` | FDV-DEV/EXEC/PATCH | cerimônia de monorepo; sem nós de grafo não há o que registrar | `LOG.md` + `DECISOES.md` |
| `backend/`, Railway, Postgres, backup diário, prompts de servidor | FDV-EXEC, PROTOCOLO-TRANSVERSAL §8 | não há backend | — (n/a) |
| Gates `verificar-frescor-docs`, `validar-integridade`, `check-schema-drift`, `detectar-lane` | `scripts/*.cjs` | dependem de fontes/estado inexistentes (falham na primeira linha) | `scripts/validar-projeto.cjs` (inventário completo em `scripts/APLICATIVIDADE.md`) |

## 3. SUBSTITUTOS (o que vale de verdade neste repo)

### 3.1 GATE_LOCAL — obrigatório em todo modo, antes de declarar entrega
```
npm run typecheck          # tsc --noEmit (strict) — exit 0 obrigatório
npm run governanca:validar # node scripts/validar-projeto.cjs — integridade da camada de regras
npm run build              # vite build — exit 0 obrigatório para entrega que toca src/
```
Falha em qualquer um = entrega **não concluída** (não se declara pronto; não se commita como final).

### 3.2 ESTADO — `LILA-DEV/PROJETO/ESTADO-ATUAL.md`
Substitui `grafo.json` + snapshots + KF. Único lugar onde o estado vigente é lido.
Toda sessão que altera comportamento reescreve o arquivo (campo `atualizado_em`).

### 3.3 DECISOES — `LILA-DEV/PROJETO/DECISOES.md`
Substitui `decisoes-ledger.json` + frames. Append-only: decisão registrada não é editada,
é suplantada por uma decisão nova que a cita. ID: `DEC-NNN`.

### 3.4 LOG — `LILA-DEV/PROJETO/LOG.md`
Substitui log E3 / CHANGELOG. Uma linha por entrega: data, id, modo, arquivos, resultado do gate.

### 3.5 MAPA + REGRAS — `MAPA-PROJETO.md`, `REGRAS-CODIGO.md`
Substituem `docs/AI-PROJECT-MANIFEST.md`. O mapa dá lastro de localização; as regras codificam
as convenções **que já existem no código** (nada de estilo inventado).

## 4. O QUE CONTINUA VALENDO INTEGRALMENTE (sem adaptação)

- **E-INV-01..18** — bloco `E-INV-DEV` do `.clinerules` (home única neste repo, DEC-005).
- **P1-DEV** — formato único de parada por ambiguidade (decisão de negócio nunca vem da IA).
- **MODOS** — `PATCH` / `ESTRUTURAL-PLAN` / `ESTRUTURAL-ACT` (FDVs herdados, filtrados pelo §2).
- **ECONOMIA_CONTEXTO**, **ANTI_TRAVAMENTO**, **FASEAMENTO_DOCS**, **EXECUCAO_CLI**, **REASONING_LANGUAGE**, **MODO_EXECUCAO_100PCT_IA**.
- **Regra mestra** — nunca manter FDV/estado em memória implícita: toda sessão lê do repo.
- **Padrão Canonical** (pt-BR em `Canonical/`, derivado denso na raiz) — mantido como referência
  histórica; **não** é a camada viva deste repo (a camada viva é `PROJETO/`).

## 5. CRITÉRIO DE REATIVAÇÃO

Cada bloco suspenso volta a valer **somente** se o fato que o bloqueia passar a existir:

| Bloco | Volta quando |
|---|---|
| Gate de CI / LANES | existir `.github/workflows/` rodando gate em PR |
| `FLUXO_SESSAO_ISOLADA` | houver mais de um executor simultâneo (humano + bot, ou 2 agentes) |
| MCP de grafo / KF / snapshots | o domínio crescer a ponto de a prosa de `ESTADO-ATUAL.md` deixar de dar conta (~20+ fluxos) |
| Índices (vetorial/rastreabilidade) | `src/` passar de ~100 arquivos (busca manual deixa de ser confiável) |
| Regen do `E-INV-DEV` | `src/prompts/Canonical/FDV-E.md` for reintegrado (`node scripts/injetar-einv-dev.cjs` volta a mandar) |

Reativação é decisão do dono (`DEC-NNN`), nunca da IA (E-INV-02).

## 6. REVERSÃO

O dispatcher herdado está preservado intacto em `LILA-DEV/herdado/.clinerules-v1.14-original`
(cópia byte a byte). Para reverter: copiar de volta sobre `.clinerules`. Nada do herdado foi
apagado — `FDV-*.md`, `PROTOCOLO-*.md`, `README-DEV-AI.md`, `INDICES.md`, `Canonical/` e os
scripts de `scripts/` continuam no lugar, inertes onde dependem de infra ausente.

<!-- 6-checks (PROTOCOLO-LOCAL v1.0, 2026-10-20): C1 integridade OK (todo fato do §1 tem evidência de arquivo/comando) | C2 coesão OK (uma régua: suspenso = sem infra = substituto declarado) | C3 coerência OK (substitutos não contradizem E-INV-01..18) | C4 contradições OK (regra herdada não fica ambígua: ou vale, ou está no §2 com substituto) | C5 desatualização OK (medido por tool em 2026-10-20) | C6 complexidade OK (adaptação mínima para 6 arquivos em src/) -->
