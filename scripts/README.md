# scripts/ — Ferramental Lila C137


Inventário canônico e padrão mínimo dos scripts em `scripts/` (`.cjs` no topo + `forcar-renovacao-tokens-google.sql`; suítes `.test.cjs` + libs + fixtures em `scripts/__tests__/` e `scripts/lib/`). Contagens e inventário de vivos são MEDIDOS no bloco gerado abaixo — nunca mantidos à mão.

> Fonte de verdade do inventário: este README. Divergências com `docs/AI-PROJECT-MANIFEST.md` devem ser corrigidas nos docs.

<!-- GENERATED: scripts-readme-table DO NOT EDIT — source: fs scripts/*.cjs + package.json#scripts + header de cada script MINUS dead-scripts list LILA-DEV/INDICES.md (ancora Mortos em REANC-L4) (gerador: scripts/gerar-docs-derivados.cjs) -->
### Inventário medido (gerado) — scripts vivos

Topo (filesystem): **82** `*.cjs`; dead-list declarada: **6**; interseção morto × filesystem: **0** → `alive = filesystem_present - dead_listed` = **82 vivos**. Suítes: 74 `*.test.cjs` (em `__tests__/`); libs: 9 (em `lib/`).

| Script (vivo) | Propósito (header do script) | npm |
|---|---|---|
| `ai-readability-docs.cjs` | Sonda de retenção em docs AI-facing: censo de âncoras determinístico, sumarização por cosseno multilingual (Jaccard diagnóstico), Q+A resposta-vs-resposta, edição sintética. | — |
| `backup-postgres.cjs` | D3/8.2: backup lógico do Postgres programável a partir do repo (Railway sem plano com backup gerenciado). | `npm run backup:db` |
| `bootstrap-worktree.cjs` | bootstrap idempotente de uma worktree git nova com os arquivos UNTRACKED essenciais ao fluxo de índices (`.env` em primeiro lugar). | `npm run worktree:bootstrap` |
| `buscar-vetorial.cjs` | busca vetorial em memória — cosine similarity contra o índice vetorial. | — |
| `checar-paridade-docs.cjs` | checagem INSTRUCT-FIRST de paridade meta↔header para docs do escopo governado da gramática AI-IAIA (§7), alterados num PR. | — |
| `check-schema-drift.cjs` | OP-6 — DRIFT de schema: compara o conjunto tabela->colunas DECLARADO pelo drizzle (backend/src/db/schema.ts, parse ESTATICO do fonte) com o que o banco realmente expoe em inform... | — |
| `detectar-escopo-ci.cjs` | fachada fina sobre scripts/select-tests.cjs (MATRIZ_TESTES do FDV-EXEC) para os jobs de PR do CI: converte o plano deterministico de classes em flags de skip (RUN_TCI, RUN_BACK,... | — |
| `detectar-lane.cjs` | roteamento de lanes + dente da fronteira estrutural/patch (FRAME-LANES-20261003; | — |
| `dev-up.cjs` | ferramenta MANUAL de boot da stack visual local: Postgres (docker compose) + backend (tsx watch) + frontend (vite), em ordem determinística e com falhas loud. | `npm run dev:up` |
| `fila-diagnostico.cjs` | Raio-X da fila de merge do LilaV2: PRs abertos + classe de bloqueio de cada um, estado dos workflows de orquestração, runs travadas e saúde dos runners. | — |
| `fila-drain.cjs` | Fila drain — loop de drenagem mecânico (v2; | — |
| `gate-lote.cjs` | Gate de lote com evidência JSON (validação em 2 camadas). | — |
| `gera-fixtures-calibracao.cjs` | corpus NEGATIVO da calibração cross-language da sonda (PATCH-SONDA-CALIBRACAO-CROSSLANG-20260930). | — |
| `gerar-docs-derivados.cjs` | transporte generalizado fonte->derivado (P1a). | — |
| `gerar-indice-manifest.cjs` | gera docs/AI-PROJECT-MANIFEST-INDEX.md (indice de 2KB) a partir do AI-PROJECT-MANIFEST.md, com --check anti-drift e --sync-db (espelho manifest_docs). | `npm run indices:check`, `npm run indices:manifest` |
| `gerar-indice-rastreabilidade.cjs` | gera LILA-DEV/indice-rastreabilidade.json (nó -> snapshot/log/integridade) a partir do grafo.json e dos logs de execucao. | `npm run indices` |
| `gerar-indice-smart.cjs` | orquestrador de regeneracao inteligente de indices (D3 do Evento Deliberado PATCH-OTIMIZACAO 2026-08-25) — roda apenas os geradores cujo indice esta stale. | `npm run indices:smart` |
| `gerar-indice-vetorial.cjs` | build script — orquestra chunking → embedding → storage. | `npm run indices`, `npm run indices:vetorial` |
| `gerar-manifest-esqueleto.cjs` | Gerador do AI-PROJECT-MANIFEST v3.0 (ESTADO-PURO POR CONSTRUCAO — evento deliberado MANIFEST-V3-ESTADO-PURO-N3 2026-09-08). | `npm run manifest:gerar` |
| `gerar-module-map.cjs` | WO-2026-09-30-TOOLCONFUSION — ITEM B3: MAPA DE MÓDULOS gerado (nunca mantido à mão). | — |
| `grafo-normalize.cjs` | Extrair UNIDADES (decisões de negócio / comportamentos) dos snapshots, coletar as DECLARAÇÕES EXPLÍCITAS de deprecation (nota do nó começando com "DEPRECATED", campo superseded_... | — |
| `injetar-einv-dev.cjs` | injetor fonte->derivados (P0.1). | — |
| `install-hooks.cjs` | instala o hook de pre-push (git hooks não são versionados). | `npm run hooks:install` |
| `kf-compiler.cjs` | compilador determinístico de KFs-área (Fase A2, fase de estado). | — |
| `kf-gate-semantico-estrito.cjs` | guard estrito do gate semantico (FDV-PLAN v7.1 §5). | — |
| `kf-gate-semantico-hook.cjs` | hook do gate semântico do kf-compiler (FDV-PLAN v7.1 §5 / §3.6). | — |
| `kf-gate-semantico-rodar.cjs` | runner do gate semântico (FDV-PLAN v7.1 §5). | — |
| `kf-nos-area-estado.cjs` | muda o ESTADO dos nós KF-área no grafo ATIVO (B5/B6). | — |
| `lila-auditoria-mcp.cjs` | fachada dos gates MECANICOS do E1.5/E4 (MATRIZ_TESTES v3.10). | — |
| `lila-estado-mcp.cjs` | expor consultas de estado como tools tipadas (debt_check, indices_status) sem nenhuma operacao de escrita. | — |
| `lila-grafo-mcp.cjs` | substituir a edição manual/100% IA do grafo.json por operações atômicas validadas (voto do Evento "MCP grafo + ledger", 2026-08-27). | — |
| `lila-models.cjs` | CLI consolidado do ferramental de modelos OpenRouter. | — |
| `limpeza-zumbis.cjs` | Remediação dos zumbis detectados pelo fila-diagnostico.cjs: conserta o que é SEGURO por construção e REPORTA o que exige julgamento. | — |
| `notificar-falha-cron.cjs` | canal de alerta para falhas de workflows agendados (P1b do painel vital, DIR-HOMEOSTASE — decisão Igor 2026-10-01). | — |
| `nova-sessao.cjs` | Decisão Igor 2026-09-21: "o foco total do grafo é leitura de IA" + 7ª camada da arquitetura IA-first — re-leitura de estado fresco vira DEFAULT ESTRUTURAL, não disciplina. | `npm run sessao:nova` |
| `patch-ship.cjs` | entrega de patch em UM comando (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905). | `npm run patch:ship` |
| `pre-push.cjs` | gate local antes do push (custo zero). | `npm run prepush` |
| `probe-f9-exposicao.cjs` | C25-27 / F9 (Ciclo 2 de hardening, sessao `structural/hardening-ciclo2-sessao-b`, 2026-09-29) — PROVAS MECANICAS de exposicao de rede que antes so respondiam no painel (F9 nivel... | — |
| `prune-historico.cjs` | degradação programada por tempo (retenção histórica). | — |
| `prune-semanal.cjs` | retenção histórica SEMANAL (1x/semana — semana ISO) orquestrando prune-historico.cjs. | — |
| `reconciliar-ledger-grafo.cjs` | reconciliador mecanico read-only entre o grafo (grafo.json + grafo_historico) e o ledger de decisões (decisoes-ledger.json) — KF-HOMEOSTASE, FR-HOMEOSTASE-N02, decisão D5 do spr... | — |
| `restore-test.cjs` | Restore-test do backup Postgres — D3/8.2 (sweep hardening 2026-08-28, achado 8.2). | — |
| `rotate-encryption-key.cjs` | ONDA-D-F22-2026-08-28 (F2.2) — rotação transacional da ENCRYPTION_KEY. | — |
| `run-audits-parallel.cjs` | executar os audits de dependencia da RAIZ e do BACKEND CONCORRENTEMENTE, preservando retry, logs identificados por origem e exit code agregado BLOQUEANTE (C2 do PATCH-OTIMIZACAO... | — |
| `run-checks-parallel.cjs` | bateria de validação (typecheck ×3, lint, test:scripts, indices:status + vitest front&back) com paralelismo LIMITADO. | `npm run test:ci:parallel`, `npm run test:ci:parallel:coverage` |
| `run-gate.cjs` | GATE ÚNICO de validação com paridade byte-a-byte com o CI (jobs pr-gate/merge-gate do pr-gate.yml) — mata a classe de falhas "verde local que é vermelho no CI" (drift de node_mo... | `npm run gate`, `npm run gate:e2e` |
| `run-test-scripts.cjs` | rodar as suítes node:test de scripts/__tests__ com CAMINHOS EXPLÍCITOS. | `npm run test:scripts` |
| `select-tests.cjs` | seletor DETERMINISTICO de testes do E4 (MATRIZ_TESTES do LILA-DEV/FDV-EXEC.md). | `npm run test:frame` |
| `sintese-ledger.cjs` | mutador UNICO do ledger de sintese pendente do fluxo PATCH (F2 do EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922). | `npm run sintese:pay`, `npm run sintese:reg` |
| `smoke-frame.cjs` | Smoke escopado por frame (camada LEVE da validação em 2 camadas — decisão humana Igor, execução LOCAL, PATCH-GATE-LOTE-EVIDENCIA). | `npm run smoke` |
| `sonda-gate-rodar.cjs` | driver do GATE SINCRONO-REQUIRED da sonda semântica de docs — required check desde o veredito Igor 2026-10-20; heartbeat-ping de juízes (ping morto = exit 1) + veredito ESTRITO r1/r2. | — |
| `sondar-health-prod.cjs` | P2 — painel vital (decisão Igor 2026-10-01). | — |
| `validar-integridade.cjs` | Script de validação de integridade do sistema FDV Validações: 1. | `npm run indices:status` |
| `validar-ledgers.cjs` | gate de integridade dos ledgers append-only. | — |
| `validar-paths-case.cjs` | bloquear COLISÃO DE CASE em caminhos rastreados pelo git — no Windows o FS é case-insensitive (o índice aceita duas variantes do mesmo diretório), mas em checkout Linux/CI os ca... | — |
| `validar-referencias-grafo.cjs` | FR-GRAFO-T2 (achados A2, A3, A6) Valida as referências do universo consolidado (grafo ativo + grafo-historico, ordem dual-universe do acharNo). | — |
| `validar-workflows.cjs` | gate determinístico de HIGIENE dos workflows GitHub Actions — mata a classe "CI frágil por ambiente" antes do push. | `npm run ci:workflows` |
| `verificar-acumulacao-prs.cjs` | o alvo principal e o runner local, que nao enxerga a propria ausencia). | — |
| `verificar-alinhamento-vetorial.cjs` | verificador de integridade VETOR↔CHUNK do índice vetorial: a superfície que verificar-frescor-indice-vetorial.cjs NÃO cobre (fileHash valida fonte↔chunk; | `npm run indices:alinhamento` |
| `verificar-ausencia-prompt-dist.cjs` | C25-18 (Ciclo 2 de hardening, sessao `structural/hardening-ciclo2-sessao-b`) — GATE MECANICO de ausencia: nenhuma sentinela de prompt de governanca (canonico em src/prompts/Cano... | — |
| `verificar-codigo-grafo.cjs` | FR-GRAFO-T5 (achado A8) Checker código→grafo: valida a declaração opcional `codigo: string[]` dos frames do grafo ATIVO contra o source real. | — |
| `verificar-contrato-rotas.cjs` | C25-03 item 3 / HB-020 (2026-09-28) — GATE DE CONTRATO DE ROTAS front×back. | `npm run contrato-rotas:check` |
| `verificar-contratos.cjs` | verificador MECANICO de elegibilidade do fluxo PATCH (F1 do EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922). | `npm run contratos:check` |
| `verificar-disciplina-sessao.cjs` | Guarda da 7ª camada (decisão Igor 2026-09-21): re-leitura de estado fresco é default estrutural. | `npm run sessao:check` |
| `verificar-divida-patch.cjs` | verificador do ledger de dividas de patch (LILA-DEV/execucao/patch-debt.json — append-only, Evento Deliberado PATCH-OTIMIZACAO 2026-08-25, D1/D6). | `npm run debt:check` |
| `verificar-drift-env.cjs` | verificador de drift do contrato de configuracao (KF-HOMEOSTASE, decisao D6 do sprint: report-only, SEM gate de PR; | — |
| `verificar-drift-node.cjs` | gate de DRIFT do ambiente Node (HB-011, M2 do sweep 2026-09-25, 2026-09-27). | `npm run drift:node` |
| `verificar-fechamento-frames.cjs` | gate anti-recorrência do furo de fechamento canônico detectado em 2026-10-06: FRAME-CI-LANE-LIGHT-RESILIENCIA- 20261006 foi fechado nos PRs #1148/#1153 com snapshot + log + unid... | — |
| `verificar-flips-pendentes.cjs` | família guards (SP-GUARDS-VALIDADORES / KF-FERRAMENTAS). | `npm run flips:pendentes` |
| `verificar-frescor-docs.cjs` | FRAME-DOCS-MECANIZACAO-P0-20261002 (P1-F) + FRAME-DOCS-MECANIZACAO-P1a-20261002 (P1a): gate de frescor dos docs derivados -- itera TODOS os pares de scripts/docs-pairs.registry.... | `npm run indices:check` |
| `verificar-frescor-indice-vetorial.cjs` | Verificador de frescor específico do índice vetorial, baseado em fileHash por chunk (não mtime). | `npm run indices:vetorial:check` |
| `verificar-frescor-indices.cjs` | verificação por CONTEÚDO (v2, PATCH-DEVFLOW-FRESCOR-CONTENT-20260905). | `npm run indices:check`, `npm run indices:related` |
| `verificar-frescor-manifest.cjs` | Validador de frescor do AI-PROJECT-MANIFEST v3.0 (N1 do MANIFEST-V3-ESTADO-PURO-N3). | `npm run manifest:check` |
| `verificar-frescor-module-map.cjs` | WO-2026-09-30-TOOLCONFUSION — ITEM B3: gate de frescor do mapa de módulos. | — |
| `verificar-indices-commitados.cjs` | gate de conteúdo dos índices (CI). | — |
| `verificar-localstorage-keys.cjs` | gate de HIGIENE do inventario de storage do front — compara as chaves lila* usadas em string literals do codigo (src/ + test/) contra o inventario canonico docs/LOCALSTORAGE-KEY... | `npm run storage:check` |
| `verificar-pontos-cegos.cjs` | VARREDURA DIARIA dos pontos cegos que o padrao de PR nao pega. | — |
| `verificar-provisionamento-migrate.cjs` | gate de PROVISIONAMENTO do unico caminho de DDL do repo (`backend/src/scripts/migrate.ts` — `backend/drizzle/` nao e versionado). | — |
| `verificar-relacao-decisoes.cjs` | gate da declaração de relação com decisões ativas (FRAME-LACO-ESTADO-20261002, decisão Igor 2026-10-02). | — |
| `verificar-saude-corpus-jev.cjs` | SAÚDE do corpus do decisor JEV, acoplada à passada SEMANAL (scripts/prune-semanal.cjs). | — |
| `verificar-sintese.cjs` | verificador do ledger de sintese pendente (F2 do EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922). | `npm run sintese:check` |
| `verificar-vivacidade-jobs.cjs` | (fonte: LILA-DEV/planejamento/hardening/backlog.md §1 HB-001.. | — |

**Subtraídos — declarados mortos, nunca listados como vivos:** `buscar-simbolo.cjs`, `changelog-scaffold.cjs`, `gerar-changelog.cjs`, `gerar-indice-reverso.cjs`, `gerar-matriz-cobertura.cjs`, `verificar-changelog.cjs`.

Fonte do dead-list resolvida por grep: `LILA-DEV/INDICES.md` (âncora `Mortos em REANC-L4`). Procedência dos nomes: literais no documento = `buscar-simbolo.cjs`, `changelog-scaffold.cjs`, `gerar-changelog.cjs`, `verificar-changelog.cjs`; aliases declarados no registry = `gerar-indice-reverso.cjs`, `gerar-matriz-cobertura.cjs`. Regen: `node scripts/gerar-docs-derivados.cjs --pair scripts-readme-table`.
<!-- /GENERATED: scripts-readme-table -->

---

## Padrão mínimo obrigatório (todo script `.cjs`)

1. **Header de comentário**: propósito + ref (FR/KF/AUD se houver) + entradas/saídas.
2. **Saída estruturada e exit não-zero em falha** (`process.exit(1)` com mensagem acionável — nunca stack crua como única saída).
3. **`--help`/`-h` mínimo** ou mensagem de uso quando args inválidos (scripts sem args válidos não precisam de `--help`).
4. **Nenhum `console.log` de progresso sem `--verbose`** — saída limpa por padrão; o log de progresso só aparece com a flag.
5. **Erro tratado com mensagem acionável** (ex.: `OpenRouter models falhou (HTTP 429) [OPENROUTER_RATE_LIMITED]`).

**Já conformes (sem alteração)**: `verificar-frescor-indice-vetorial.cjs`, `verificar-frescor-docs.cjs` (relatório é a saída; exit codes já corretos; sem args opcionais). `verificar-frescor-indices.cjs` ganhou `--related` no Evento PATCH-OTIMIZACAO (2026-08-25) e virou **comparação por conteúdo** no PATCH-DEVFLOW-FRESCOR-CONTENT-20260905 (gerador offline em tmp via `INDICES_OUT_DIR`/`MANIFEST_INDEX_PATH`).

### Entrega de patch (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905)
| Script | Propósito | Uso |
|---|---|---|
| `patch-ship.cjs` | entrega em 1 comando: smoke local (app via `smoke-frame.cjs`; testes de scripts via `node --test`) → commit de conteúdo → regen `npm run indices`+manifest+vetorial+check → commit `chore(indices)` → push → PR com auto-merge best-effort (mapeia logs novos no mapa via `--area`) | `npm run patch:ship "mensagem" [--area <area>] [--no-pr]` |

**Padrão aplicado neste hardening**: `gerar-indice-rastreabilidade.cjs`, `gerar-matriz-cobertura.cjs`, `gerar-indice-vetorial.cjs` (`--help`/`--verbose` + exit não-zero na escrita), `validar-integridade.cjs` (`--help` + header entradas/saídas), `prune-historico.cjs` (`--help` + try/catch exit 1), `buscar-modelo.cjs`, `inspect-model.cjs` (`resp.ok` + código `OPENROUTER_*`).

---

## Famílias

### Índices e navegação
| Script | Propósito | Saída |
|---|---|---|
| `gerar-indice-rastreabilidade.cjs` | nó → snapshot/log/integridade | `LILA-DEV/indice-rastreabilidade.json` |
| `gerar-indice-vetorial.cjs` | chunking AST + embeddings incremental | `indice-vetorial.json` + `.bin` |
| `buscar-vetorial.cjs` | busca semântica (cosine) | stdout |
| `validar-integridade.cjs` | integridade FDV + índices (`--indices-only`/`--full`) | relatório + exit |
| `verificar-frescor-indices.cjs` | staleness por CONTEÚDO (regen offline em tmp; PATCH-DEVFLOW-FRESCOR-CONTENT-20260905) | relatório + exit |
| `verificar-frescor-indice-vetorial.cjs` | staleness fileHash por chunk | relatório + exit |
| `gerar-indice-smart.cjs` | regenera apenas índices stale (D3 — independentes em paralelo; vetorial best-effort no PATCH) | relatório + exit |
| `gerar-indice-manifest.cjs` | índice 2KB do AI-PROJECT-MANIFEST (`--check` anti-drift byte-a-byte; `--sync-db` grava espelho manifest_docs) | `docs/AI-PROJECT-MANIFEST-INDEX.md` + exit |
| `verificar-divida-patch.cjs` | verifica ledger `patch-debt.json` (pagamento pendente por área/idade) | relatório + exit |
| `verificar-contratos.cjs` | **elegibilidade mecânica do PATCH** (F1 — EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922): cruza `--files <p1,p2,...>` (globs simples) contra o registry `LILA-DEV/execucao/contratos-afetados.json` — match = exit 1 (INELEGÍVEL → ESTRUTURAL), registry ausente/ilegível = exit 2 (falha FECHADA), `--area` sem `--files` = consulta (exit 0) | relatório + exit |
| `sintese-ledger.cjs` | **mutador do ledger de síntese pendente** (F2 — mesmo evento): `registrar --patch-id <ID> --area <area> --log <caminho>` (idempotente por patch-id; ledger ausente = cria e registra) \| `consumir --ids <id1,id2> --por <FRAME-ID> --snapshot <caminho>` (append-only: marca status/consumidaEm/consumidaPor/consumidaSnapshot) | entrada criada/marcada + exit |
| `verificar-sintese.cjs` | verifica `sintese-pendente.json` por área contra o threshold de `sintese-config.json` (F2 — mesmo evento): pendentes >= threshold = exit 1 (síntese exigida no escopo do estrutural; nunca pulável com dívida) \| ledger ausente = exit 0 \| ledger/config ilegível = exit 2 | relatório + exit |
| `verificar-frescor-docs.cjs` | gate de frescor dos docs DERIVADOS — itera os pares de `scripts/docs-pairs.registry.json` e acusa por CONTEÚDO (E-INV-DEV mirror + blocos `GENERATED`) | relatório + exit |

### Governança
| Script | Propósito |
|---|---|
| `prune-historico.cjs` | retenção por tempo dos logs E3 (0-15d no canal ativo; >15d arquivado em `logs-arquivo/`) |
| `prune-semanal.cjs` | retenção semanal 1x/semana (semana ISO — FDV-EXEC E5, EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001) — dry-run + aprovação humana |
| `grafo-normalize.cjs` | normalização determinística de deprecations: extrai unidades (decisões/comportamentos) dos snapshots, coleta declarações explícitas, emite artefato de review C1..Cn (veto por item); `--apply` grava `decisoes-ledger.json` (schema v1) + campos `deprecated`/`decisoes_deprecated` no grafo |
| `lila-grafo-mcp.cjs` | **MCP server (stdio)** de leitura/mutação estruturada do grafo: `read_units` \| `deprecate_unit` \| `register_unit` \| `read_node` \| `update_node` — determinístico (sem LLM), whitelist de campos, IDs estáveis alinhados ao snapshot, write-only-if-changed |

### Modelos e qualidade
| Script | Propósito |
|---|---|
| `lila-models.cjs` | **CLI consolidado**: `search` \| `inspect` \| `check` \| `qi` (hardening 2026-08-23) |
| `buscar-modelo.cjs` | wrapper fino → `lila-models search` |
| `inspect-model.cjs` | wrapper fino → `lila-models inspect` |
| `verificar-modelos-openrouter.cjs` | auditoria `MODEL_OPTIONS` vs API (parse próprio — ver dívidas) |
| `buscar-qi.cjs` | QI benchmarks de IDs fixos |
| `inspect-qi.cjs` | inspeção benchmark de um modelo |
| `ai-readability-docs.cjs` | sonda de RETENÇÃO de informação em docs AI-facing (PATCH-20260926-003): **4 provas** — censo de âncoras determinístico (números/IDs/ALL-CAPS/backtick do baseline devem existir verbatim no fold), sumarização por cosseno multilingual com Jaccard apenas como diagnóstico (não pontua), Q+A resposta-vs-resposta (cosseno, mediana por questão) e edição sintética (`SYNTH_EDIT_n`); **dois regimes de threshold** — same-language e cross-language (detecção automática pelo baseline); juízes `openai/gpt-6-luna` (llm1) + `deepseek/deepseek-v4.1-flash-1017` (llm2 — PATCH-SONDA-JUIZ-DEEPSEEK-20261020; antes `google/gemini-3.7-flash`, removido do dropdown em 2026-08-27); invocada por `.github/workflows/sonda-gate-fold.yml` em PR que toca `docs/**` (driver estrito: REPROVA = `::error`/exit 1/check vermelho) e manualmente por `sonda-semantica-docs.yml` e pelo `workflow_dispatch` do mesmo gate; **o check NÃO está na lista de required checks** — vermelho não bloqueia merge hoje |
| `auditar-reasoning-efforts.cjs` | `supported_efforts` vs REASONING_OPTIONS |

### Infra
| Script | Propósito |
|---|---|
| `lila-estado-mcp.cjs` | MCP server stdio READ-ONLY: `debt_check` (verificar-divida-patch), `indices_status` (verificar-frescor-indice-vetorial + integridade bin) — fachadas finas, WET > DRY, zero side effects |
| `lila-auditoria-mcp.cjs` | MCP server stdio READ-ONLY da auditoria FDV-EXEC: `audit_state` (agrega os 4 gates mecânicos E1.5/E4 — select-tests, indices:check/status, verificar-divida) + `report_draft` (FORMATO_RELATORIO com campos de julgamento VAZIOS); fachada WET > DRY, zero side effects, NUNCA classifica P1/P2 nem decide escalada; `AUDITORIA_MCP_STUB`/`AUDITORIA_MCP_TIMEOUT_MS` |
| `backup-postgres.cjs` | backup lógico do Postgres (PATCH-REMOVE-ADMIN, D3/8.2): `pg_dump` custom + rotação keep 7 + `--check` (pré-requisitos); usado por `.github/workflows/postgres-backup.yml` (diário) |
| `restore-test.cjs` | teste SEGURO de restore (D3/8.2): dump do estado atual (ponto de reversão) → `pg_restore --clean` no banco de DESTINO (nunca no de origem) → valida integridade (tabelas + linhas source×target) → exit 0/1; `--create-scratch`/`--drop-scratch`/`--keep-dump` |
| `rotate-encryption-key.cjs` | rotação da ENCRYPTION_KEY (ONDA-D-F22-2026-08-28, F2.2): re-cifra `users.openrouter_key_*` + `user_tokens.*` (decrypt antiga → encrypt nova hex-64) em transação única com rollback + guard ida-e-volta + post-verify; `--check`/`--dry-run` (default)/`--apply`; exit 0/1/2; idempotente |
| `forcar-renovacao-tokens-google.sql` | SQL de renovação forçada de tokens Google |

### Libs e testes
| Caminho | Propósito |
|---|---|
| `lib/chunking.cjs` | chunking TS (Compiler API) + markdown |
| `lib/embedding-client.cjs` | cliente OpenRouter embeddings (erros `OPENROUTER_*`) |
| `lib/readability-helpers.cjs` | helpers PUROS da sonda de AI-readability (`tokenize`, `jaccardSets`, `extractSymbols`, `applySyntheticEdits`, `SYMBOL_STOPWORDS`) — extraídos do extinto CLI `ai-readability.cjs` (PATCH-SONDA-JUIZ-DEEPSEEK-20261020); sem I/O, rede ou custo |
| `run-test-scripts.cjs` | descobre `*.test.cjs` em `__tests__/` e roda `node --test` com caminhos explícitos — fix CI 2026-08-24 (Node 20 não expande glob; Node 22+ não recursa diretório) |
| `run-checks-parallel.cjs` | bateria de validação (typecheck ×3, lint, test:scripts, indices:status + vitest front/back) com paralelismo limitado — leves paralelos + vitest SERIAL (flake por contenda em ≤8 cores, experimento 2026-08-29); `--coverage`, `--serial`, `--maxWorkers`, `--steps`, `--list`; agrega exit codes e mede timing por passo; passo que falha imprime as falhas NOMEADAS (TAP `not ok N - nome` ou spec `✖ nome`) + tail 40 (`--verbose` = log inteiro) — falha anônima exige ciclo extra de CI (2026-09-17); npm `test:ci:parallel` |
| `select-tests.cjs` | seletor DETERMINÍSTICO de testes do E4 (MATRIZ_TESTES do FDV-EXEC): classifica `git diff --base..HEAD` + working tree em classes e emite plano (typechecks obrigatórios, testes relacionados front/back, test:scripts/indices, condição de full suite, justificativa de seleção vazia); `--base <ref>` obrigatório pós-commit (sem ele assume PATCH pré-commit/D4), `--json`, `--verbose`; detecta arquivos novos untracked (`git ls-files --others`); npm `test:frame`; suíte própria `__tests__/select-tests.test.cjs` (9 casos, fixture git temporária) |
| `detectar-escopo-ci.cjs` | fachada do `select-tests.cjs` para o CI (job `merge-gate` do pr-gate.yml): converte o plano da MATRIZ_TESTES em flags de skip (`RUN_TCI`/`RUN_BACK`/`RUN_E2E`) publicadas no `GITHUB_ENV` e consumidas por `if:` nos steps pesados; conservador (E-INV-16) — qualquer falha/`--base` ausente/`config_shared`/`other`/`fullSuite` → tudo roda; `exit 0` sempre (nunca falha o job); no CI usar `--base HEAD^1` (merge ref: pai 1 = tip do base, exige `fetch-depth: 2` no checkout); suíte própria `__tests__/detectar-escopo-ci.test.cjs` (11 casos) |
| `__tests__/` | 10+ suítes `node:test` + 2 fixtures golden (217KB / 1.3MB) |

Rodar suite: `npm run test:scripts`

---

## Mutation testing (ITEM #8 — REMOVIDO em 2026-09-06)

Removido na Onda 3 de otimização de CI (decisão humana 2026-09-06): report-only sem valor de proteção (nunca gateou) e sem execução desde 2026-08-31. Removidos: workflow noturno, as configs da ferramenta (raiz e backend), os scripts npm dedicados e as dependências correspondentes dos dois lockfiles. Histórico FASE A/B arquivado em `LILA-DEV/planejamento/snapshots/ITEM-08-mutation-testing.md`.



---
## Dívidas registradas (hardening 2026-08-23)

- **`verificar-modelos-openrouter.cjs`**: parse por regex/contagem de chaves **mantido** (avaliado troca por TS Compiler API — rejeitado porque o aninhamento atual `reasoning:{}` é tratado corretamente e a auditoria opera bem; troca exigiria nova travessia customizada + teste, fora do escopo do patch). Registrar como dívida para revisão futura.
- **`gerar-changelog.cjs`/`verificar-changelog.cjs`/`changelog-scaffold.cjs`/`lib/changelog-*`**: ~~modelo CURADO reescrito no FRAME-CHANGELOG-REFORM-20261001~~ — **morte 2026-10-06**: o sistema do índice de CHANGELOG (escritor único + 3 gates + scaffolder) foi APOSENTADO por evento deliberado Igor 2026-10-05 (custo: o step de CHANGELOG respondeu por 55% das falhas de pr-gate pós-reforma). Fonte: `decisoes-ledger.json` (registro de aposentadoria).
- **`prune-historico.cjs`**: ~~sem suíte `node:test`~~ — **✅ resolvida 2026-08-24** (`PATCH-DIVIDAS-NODE-TEST`): `scripts/__tests__/prune-historico.test.cjs` (4 testes, sandbox `PRUNE_BASE_DIR` + `--dry-run`; fix de robustez: `ensureDir(HIST/logs)` no arquivamento).
- **`validar-integridade.cjs`**: ~~sem suíte `node:test` (613 linhas de gate crítico)~~ — **✅ resolvida 2026-08-24** (`PATCH-DIVIDAS-NODE-TEST`): `scripts/__tests__/validar-integridade.test.cjs` (3 testes do modo `--indices-only` — íntegro exit 0, corrupção vetorial exit 1).

---

## Backlog C — lint (fases futuras, CONGELADO)

Registrado pelo KF-HARDENING-LINT (FR-LINT-N10, SP-LINT-04). **Não executado em nenhuma circunstância** enquanto o congelamento estiver vigente (PROTOCOLO-SESSAO-KF-HARDENING-LINT §5). Gate atual: `npm run lint -- --max-warnings=0` → exit 0 (alvos A+B concluídos em 2026-08-24 — baseline A `484e/807w` + baseline B `4.302` strictTypeChecked liquidados a zero).

| Regra / ferramenta | Status |
|---|---|
| `import/order` | 📋 registrada — não executada |
| `complexity` | 📋 registrada — não executada |
| `max-lines` | 📋 registrada — não executada |
| `no-cycle` | 📋 registrada — não executada |
| `unicorn` | 📋 registrada — não executada |
| `sonarjs` | 📋 registrada — não executada |
| `prettier` (integração) | 📋 registrada — não executada |

Estado do gate (2026-08-24, pós-auditoria PATCH): `npm run lint -- --max-warnings=0` exit 0 · `npm run typecheck` exit 0 · `cd backend && npm test` 625/625 · `npm run test:ci` exit 0 · frontend full 1027/1027 (0 falhas — as 4 pré-existentes foram corrigidas na auditoria).

---

## Como rodar

```bash
# Validação completa (fechamento)
npm run gate             # GATE ÚNICO com paridade CI (2026-09-04): npm ci limpo (raiz+backend),
                         # lint, 3 typechecks, npm audit high, test:ci, backend vitest.
                         # `npm run gate:e2e` acrescenta playwright install chromium + E2E gold.
npm run ci:workflows     # higiene dos workflows: ASCII em run blocks PS/cmd, timeout/concurrency (roda no pr-gate)
npm run typecheck
npm run test:scripts
node scripts/validar-integridade.cjs --indices-only
npm run indices:status

# Pipeline de índices
npm run indices          # regenera todos (inclui vetorial — requer OPENROUTER_API_KEY)
npm run indices:check    # frescor
npm run indices:status   # integridade (validar-integridade --indices-only)
npm run indices:vetorial # re-embed incremental
npm run indices:smart    # regenera apenas índices stale (fluxo PATCH — D3)
npm run indices:related  # frescor apenas dos índices tocados pelo patch (--related)
npm run test:related     # vitest run --changed — testes de arquivos alterados + dependentes (válido PRE-commit/PATCH/D4)
npm run test:frame -- --base <hash>  # plano determinístico de testes do E4 (MATRIZ_TESTES) — obrigatório pós-commit
npm run debt:check       # verifica dívidas de patch pendentes (node scripts/verificar-divida-patch.cjs --area <area>)
npm run debt:pay         # paga dívidas: indices completo + test:ci + indices:check + indices:status
npm run contratos:check  # elegibilidade mecânica do PATCH (node scripts/verificar-contratos.cjs --files <p1,p2,...>) — exit 1 = INELEGÍVEL (ESTRUTURAL)
npm run sintese:check    # síntese pendente por área vs threshold (node scripts/verificar-sintese.cjs [--area <area>]) — exit 1 = consumir no escopo
npm run sintese:reg      # registra log E3 no ledger (node scripts/sintese-ledger.cjs registrar --patch-id <ID> --area <area> --log <caminho>)
npm run sintese:pay      # marca consumo da síntese (node scripts/sintese-ledger.cjs consumir --ids <id1,id2> --por <FRAME-ID> --snapshot <caminho>)
<!-- 6-checks: C1-C6 ok, 2026-09-16, FR-LIMPEZA-OWNERSHIP (remocao do bloco de tag R0 e ajuste de contagem de scripts; inventario e padrao minimo preservados) -->
<!-- 6-checks: C1-C6 ok, 2026-09-22, EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (3 novos scripts + 3 suites: verificar-contratos/sintese-ledger/verificar-sintese; contagem do cabecalho ajustada para o medido — o valor anterior 65/39 ja estava divergente do tree no GATE-BASE, divergencia pre-existente registrada e nao silenciada) -->
