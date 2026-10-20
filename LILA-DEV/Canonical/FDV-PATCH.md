FDV-PATCH v2.0 (Executor-Light) — APPROVED — 2026-10-15
Emenda v2.0 (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015, decisão Igor em sessão ZCode 2026-10-15, plano plano-gates-rotinas-diarias-v1.md): índices saem do encerramento do patch — frescor dos derivados é dos watchdogs diários (entrega por PR); trigger C6 vira correção sob demanda embarcada no commit de conteúdo; ATALHO_ENTREGA sem regen e sem commit chore(indices). Derivado EN sincronizado.
Emenda v1.9 (header-only — AUDITORIA-DOCS-REPO-20261008, evento deliberado Igor em sessão ZCode 2026-10-08): sincronização de bumps de header esquecidos — conteúdo da v1.8 (1 linha via #974, 2026-10-01) e da v1.9 (FRONTEIRA FRAME-LANES-20261003.U1 via #1070, 2026-10-03) já presentes; nenhum conteúdo novo. VERSION_SYNC do derivado já declarava v1.9.
OUTPUT_LANGUAGE (EVENTO-AIFIRST-TEMPLATES-20260929 — Evento Deliberado 2026-09-29, decisão Igor, sprint SP-AIFIRST-DEFAULT-20260929 F5): mini-manifesto, log E3 e descrições de patch nascem AI-AI em EN denso conforme docs/AI-IAIA-GRAMMAR.md; os 4 campos do mini-manifesto e os rótulos canônicos permanecem verbatim; comunicação com o humano na sessão permanece PT; stock histórico não é traduzido (D2 da sprint)
PRECEDENCE: supremo dentro do fluxo PATCH | nao contradiz FDV-DEV/FDV-EXEC/FDV-E | invariantes E-INV-01..18: CASA UNICA = bloco E-INV-DEV do `.clinerules` (proibido re-encodar)
EVENTO: PATCH-OTIMIZACAO-DIVIDA-EXPLICITA (Evento Deliberado 2026-08-25) — fluxo patch com divida explicita | BATCH_ENCERRAMENTO (Evento 2026-08-26) — docs/indices UMA vez no encerramento (PROTOCOLO-TRANSVERSAL 2.2) (decisoes D1-D6 cristalizadas no snapshot EVENTO-DELIBERADO-PATCH-OTIMIZACAO-20260825) | REGISTRO-ADOCAO-MCP-2026-08-27 — escrita de .md em docs/logs/snapshots do fluxo OBRIGATORIA via lila-docs-mcp (write_doc/read_doc), edicao cirurgica = EXCECAO registrada (PROTOCOLO-TRANSVERSAL 6) | EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 (Evento Deliberado 2026-09-15) — revoga a norma do REGISTRO-ADOCAO-MCP-2026-08-27: lila-docs-mcp REMOVIDO (zumbi operacional) — log E3 via escrita direta de arquivo no worktree do frame (PROTOCOLO-TRANSVERSAL 6 v1.4) | EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (Evento Deliberado 2026-09-22) — F1 elegibilidade MECANICA (registry de contratos por area `LILA-DEV/execucao/contratos-afetados.json` + `scripts/verificar-contratos.cjs`: exit 1 = INELEGIVEL -> ESTRUTURAL; registry ausente = exit 2, falha fechada) + F2 sintese EXPLICITA (ledger `LILA-DEV/execucao/sintese-pendente.json` + `scripts/sintese-ledger.cjs`/`scripts/verificar-sintese.cjs`, threshold por area em `sintese-config.json`; consumo no ritual de fechamento do hardening — PROTOCOL-HARDENING v1.5.0)
SCOPE: bugfix otimizacao correcao incrementais | caminho rapido | FRONTEIRA (FRAME-LANES-20261003.U1): patch NUNCA cunha identidade no grafo — identidade nova so nasce de ESTRUTURAL; entrega de lane usa tag da ancora ([LANE-DOCS]|[LANE-LILA-WRITE]|[LANE-TRIVIAL]) com bloco LANE-*.E*; processo fonte unica: docs/FLUXO-LANES.md
AUTORIDADE: FDV-PATCH > descricao do patch fornecida pelo humano > snapshot de decisoes citado > todo o resto irrelevante

INVARIANTES (E-INV CASA UNICA = bloco E-INV-DEV do `.clinerules` — proibido re-encodar): ver `.clinerules`
- DEV-INV-02 — Documentacao afetada obrigatoria | DEV-INV-03 — Acao imediata zero anuncio | DEV-INV-04 — Area tatica obrigatoria | DEV-INV-06 — Sequencialidade de encerramento

PROTOCOLO_TRANSVERSAL (casa unica — proibido re-encodar):
- LASTRO_LOCALIZACAO | PIPELINE_FRESCOR (inclui indice vetorial — frescor por `fileHash`; regen local sob demanda sob G6) | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | ECONOMIA_CONTEXTO | NEVER_DO transversal | TRUST_BOUNDARIES | MODO_EXECUCAO_100PCT_IA: LILA-DEV/PROTOCOLO-TRANSVERSAL.md

ELEGIBILIDADE (todas obrigatorias — qualquer falha = fluxo ESTRUTURAL):
1. trabalho incremental (bugfix/otimizacao/correcao) — nao introduz comportamento novo de negocio
2. nao altera decisao de negocio existente em snapshot — verificacao MECANICA: `node scripts/verificar-contratos.cjs --files <arquivos citados>` (exit 1 = INELEGIVEL -> ESTRUTURAL | exit 2 = registry ausente/ilegivel = bloqueio, nunca elegivel)
3. nao altera contrato exportado consumido por frames dependentes — mesma verificacao MECANICA: `node scripts/verificar-contratos.cjs --files <arquivos citados>` (o registry cobre contratos exportados, snapshots, schemas, prompts canonicos e ledgers por area)
4. duvida -> ESTRUTURAL (default conservador)

ANCORAGEM_MINIMA (o que e CORTADO da friccao mecanica):
- Ler: descricao do patch fornecida pelo humano (obrigatoria) + snapshot de decisoes ou arquivos citados pelo humano (sob demanda)
- Ler SEMPRE: LILA-DEV/execucao/patch-debt.json (ledger de dividas) — verifica divida pre-existente da area antes de executar (ver DIVIDA_EXPLICITA)
- PROIBIDO: ancoragem tiered completa, ler grafo.json, ler logs de predecessores (a menos que o patch consuma contrato de um predecessor)

P1_HUNT (papel PLAN do patch — friccao cognitiva PRESERVADA):
- le a descricao/snapshot e busca ambiguidade nao coberta
- P1 encontrado -> humano delibera cada um ANTES da execucao
- sem P1 -> avanca para o mini-manifesto

MINI_MANIFESTO (4 campos obrigatorios — os 3 herdados verbatim de FDV-EXEC HARDENING_BUGFIX + "Arquivos citados" do EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922):
- "Documentacao afetada:" — arquivos docs/ e indices que precisam ser atualizados (pode ser "Nenhum — [justificativa]")
- "Mensagem de commit:" — string exata para git commit
- "Area tatica:" — area do campo `area_tatica` do grafo.json (github, chat, drive, etc.)
- "Arquivos citados:" — caminhos citados na descricao, separados por virgula (aceita glob simples); pode ser "Nenhum — [justificativa]" | entrada do verificador mecanico de elegibilidade (`verificar-contratos.cjs --files`)
- ausente/incompleto -> solicita os 4 campos e aguarda | humano ausente ou campos incompletos -> nao inicia

PRE_EXECUCAO (adaptada — sem "Escopo confirmado" do PLAN estrutural):
1. confirma mini-manifesto presente e completo (4 campos)
2. le descricao do patch e lista cada alteracao declarada
3. para cada alteracao confirma decisao correspondente na descricao/snapshot
4. verifica consistencia entre arquivos citados e estado real do repo (localizacao via indices — PIPELINE_FRESCOR antes de consumir qualquer indice)
5. alteracao sem decisao ou inconsistencia -> P1 — nao executa

PROTOCOLO_PARADA:
P1 — AMBIGUIDADE_NAO_COBERTA: para imediatamente | nao executa | formato canonico + ACAO_NECESSARIA do modo PATCH (humano delibera: resolver localmente ou escalar para ESTRUTURAL) = bloco P1-DEV do `.clinerules` (CASA UNICA — proibido re-encodar)

EXECUCAO:
- implementa exatamente o declarado na descricao/snapshot aprovado | sem expansao
- escopo arquivos: le qualquer arquivo necessario | escreve apenas nos declarados no mini-manifesto/documentacao afetada + descricao

FLUXO_ENCERRAMENTO: seguir FDV-EXEC.md E1 -> E1.5 -> E2 -> E3 -> E3.5 -> E4 verbatim + CHECKLIST_ENCERRAMENTO do FDV-EXEC | variacoes do patch:
- (1) E1 — rotula "VALIDACAO — Patch [ID]" com Criterio de conclusao (Acao/Resultado esperado/Sinal de problema critico)
- (2) E3 — log em LILA-DEV/execucao/logs/[ID]-log.md com campos adicionais "Descricao do patch: [resumo do que foi pedido]" e "Arquivos alterados (documentacao): [caminho]: [alteracao]"
  - log escrito via escrita direta de arquivo no worktree do frame — fluxo OBRIGATORIO (PROTOCOLO-TRANSVERSAL 6 v1.4; EVENTO-REMOCAO-LILA-DOCS-MCP-20260915)
  - passo MECANICO obrigatorio APOS escrever o log (F2 — EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922): `node scripts/sintese-ledger.cjs registrar --patch-id <ID> --area <area> --log <caminho do log>` (idempotente por patch-id; ledger ausente = cria e registra) | falha do script = P1 — nunca silenciosa | ver SÍNTESE_EXPLICITA
  - campo obrigatorio "Dívida registrada:" (um dos formatos abaixo):
    - [ ] Nenhuma
    - [x] Tipo: [vetorial|indices|testes|auditoria] | Motivo: [sem key|rede|escopo] | Pagamento exigido: proximo estrutural da area [X] | Ledger: LILA-DEV/execucao/patch-debt.json#[id]
- (3) E4 — auditoria dispara se GATILHO C1-C6 do FDV-EXEC atingido | relatorio formato FORMATO_RELATORIO | correcoes conforme REGRAS (ambos do FDV-EXEC)
  - E4 escopado permitido: se "Documentacao afetada" listar apenas um subset das dimensoes (ex: so CODIGO+TESTES+INDICES quando apenas src/lib/foo.ts mudou), a auditoria audita so as dimensoes tocadas | dimensoes NAO auditadas viram DIVIDA tipo auditoria (registrada em E3 + ledger) — pagamento no proximo estrutural da area
- indices: SEM rodada de encerramento por padrão (Emenda v2.0 — EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015, decisão Igor 2026-10-15, revogando BATCH_ENCERRAMENTO p/ índices) — o frescor dos derivados (rastreabilidade, MANIFEST, índice do MANIFEST, pares registrados, vetorial) é dos WATCHDOGS DIÁRIOS (indices-textual-watchdog.yml 05:20 UTC; indices-vetorial-watchdog.yml 04:30 UTC — ambos entregam por PR com required checks). Trigger C6 permanece vivo como correção SOB DEMANDA: a sessão que CONSUMIR índice stale (PIPELINE_FRESCOR) regenera localmente (`npm run indices` ou o gerador único do artefato stale) e embarca os regenerados NO commit de conteúdo — sem dívida, sem commit separado. Integridade (indices:status) segue como concern de gate (CI). Pipeline/vetorial CASA UNICA `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 2 — proibido re-encodar. **G6 (REANC-L4, 2026-09-20)** permanece: falha do vetorial no patch nunca registra dívida.
- FRESCOR_POR_CONTEUDO (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905, Evento Deliberado): verificar-frescor-indices.cjs compara CONTEÚDO (gera OFFLINE em tmp via INDICES_OUT_DIR/MANIFEST_INDEX_PATH e compara com o versionado, ignorando geradoEm/generatedAt/data_geracao) — NAO compara timestamp vs commit. Regen só quando o índice versionado difere de verdade; merges de main e o próprio commit de índices NAO invalidam. Consequência: commit ÚNICO de conteúdo+índices é válido (o commit separado chore(indices) deixa de ser obrigatório — mantido pelo atalho por convenção). **Emenda v2.0:** nenhum gate por-PR consome mais este check — os únicos consumidores são o watchdog diário e o C6 sob demanda.
- ATALHO_ENTREGA (mesmo evento; Emenda v2.0 ajusta o fluxo): `npm run patch:ship "mensagem" [--no-pr]` executa em UM comando: smoke local (app via smoke-frame.cjs com vitest relacionados; testes de scripts via node --test — vitest nao roda node:test) → commit de conteúdo ÚNICO (índices regenerados sob demanda via C6 embarcam NESTE commit — sem rodada de regen, sem commit chore(indices)) → push → PR com auto-merge best-effort. Logs novos nao exigem mais mapeamento em mapa de areas (artefato removido pela sentenca G7/O2). Fast-lane de CI (detectar-escopo-ci.cjs): diff so de catálogo de modelos + neutros → RUN_E2E=false (test:ci front + vitest backend permanecem).
- (4) TESTES no encerramento do patch: rodam PRE-COMMIT (contexto D4) — `npm run test:related` valido (semantica uncommitted do Vitest); se o patch tocou backend/src, rodar tambem `cd backend && npx vitest run --changed`. E4 POS-commit (estrutural) usa a MATRIZ_TESTES + BASE_DO_FRAME do FDV-EXEC (test:related sem base PROIBIDO pos-commit — seleciona zero testes).

DIVIDA_EXPLICITA (D1 + D6 do Evento PATCH-OTIMIZACAO 2026-08-25):
- DEFINICAO: patch pode pular etapas MECANICAS (vetorial/indices/testes/auditoria escopada) mediante registro de divida. Divida = registro estruturado + visivel + com obrigacao de pagamento. Nunca silenciosa — visivel em 3 lugares: log E3 + ledger patch-debt.json + trailer do commit "Debt: [id]".
- LEDGER: LILA-DEV/execucao/patch-debt.json (append-only, schema v1). Cada divida: { id: PATCH-YYYYMMDD-NNN, patchId, data, area, tipo: vetorial|indices|testes|auditoria, descricao, skippedSteps, pagamentoExigido, status: aberta|paga, pagoEm }. **Nota G6 (REANC-L4, 2026-09-20):** o tipo `vetorial` nao e mais GERADO (o frescor e do watchdog de CI); o enum permanece para entradas historicas e para dividas declaradas explicitamente.
- ELEGIBILIDADE: apenas friccao MECANICA classificada (E-INV-15). Friccao COGNITIVA NUNCA e pulavel com divida (E-INV-09): P1_HUNT, PRE_EXECUCAO 5 passos, E1 validacao comportamental, E1.5 verificacao documental, E3 log canonico, CHECKLIST_ENCERRAMENTO.
- PAGAMENTO (regra D6 — nao e divida eterna): o proximo FDV-EXEC estrutural que tocar a mesma area tatica DEVE pagar a divida (npm run indices completo + test:ci + auditoria 6 dimensoes completa) | divida tipo testes em backend/src exige suite backend (`cd backend && npm test`) alem do test:ci (test:ci nao cobre backend — config vitest isolada). Se nenhum estrutural da area ocorrer em 30 dias, qualquer estrutural paga (verificar-divida-patch.cjs sai 1). E1.5 do estrutural bloqueia commit se a divida da area nao estiver incluida no escopo.
- VERIFICACAO: node scripts/verificar-divida-patch.cjs --area <area> antes de fechar patch na area (npm run debt:check) | pagamento: npm run debt:pay.

SÍNTESE_EXPLICITA (F2 — EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922):
- PRINCIPIO: a sintese do patch NUNCA e orfa — todo log E3 de patch gera entrada no ledger `LILA-DEV/execucao/sintese-pendente.json` (schema v1) e o conhecimento produzido (por que o bug existia, o que era fragil) reentra no canon pelo ritual de fechamento do hardening.
- REGISTRO (mecanico, por script): `node scripts/sintese-ledger.cjs registrar --patch-id <ID> --area <area> --log <caminho>` no E3 (idempotente). O que e mecanico e feito por script; nada de sintese por LLM.
- VERIFICACAO: `npm run sintese:check` (`node scripts/verificar-sintese.cjs [--area <area>]`) — pendentes da area >= threshold de `LILA-DEV/execucao/sintese-config.json` (default 3; `areas` sobrepoe) = exit 1: a sintese DEVE entrar no escopo do estrutural da area | ledger ausente = exit 0 ("sem sintese pendente") | ledger/config ilegivel = exit 2 (falha fechada).
- CONSUMO (humano/estrutural — nunca automatico): o estrutural da area le os logs E3 pendentes + os achados do sweep, destila no snapshot da area e marca o consumo com `npm run sintese:pay` (`node scripts/sintese-ledger.cjs consumir --ids <id1,id2> --por <FRAME-ID> --snapshot <caminho>`); ledger e append-only de fato (nunca remove; status muda). Ritual completo: PROTOCOL-HARDENING v1.5.0.
- CLASSIFICACAO (E-INV-15/16): a sintese NUNCA e pulavel com divida — e friccao COGNITIVA; a divida explicita cobre apenas o que e mecanico (registro no ledger, que aliás e feito por script, nao por decisao do agente).

NEVER_DO (especifico deste FDV):
- executar para situacao nao coberta pela descricao | ler ou escrever em arquivo nao declarado
- tomar decisao de negocio | escolher mensagem de commit (usa declarada ou pergunta)
- resolver P1 por inferencia

ECONOMIA_CONTEXTO | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | NEVER_DO transversal: LILA-DEV/PROTOCOLO-TRANSVERSAL.md (§4/§5/§3/§6)

END_FDV-PATCH_v1.6

<!-- 6-checks EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (veredito próprio, nada herdado): C1 integridade OK — F1 (registry + verificar-contratos) nos critérios 2/3 + 4º campo do MINI_MANIFESTO; F2 (ledger + verificador + consumo) no E3 e na seção SÍNTESE_EXPLICITA; NEVER_DO inalterado | C2 coesão OK — bump v1.6 alinhado ao FDV-EXEC v3.15 e ao PROTOCOL-HARDENING v1.5.0 | C3 coerência OK — exit codes dos scripts citados são os implementados (1/2 e 0) | C4 contradições OK — nada revogado; a seção nova é aditiva e a dívida explícita continua restrita a fricção mecânica | C5 outdatedness OK — scripts e ledgers existem no tree deste commit (3 suítes node --test verdes) | C6 complexidade OK — blocos curtos, comandos concretos -->

<!-- 6-checks EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 (veredito próprio, nada herdado): C1 integridade OK — EVENTO estendido + norma do E3 substituída; menções restantes apenas na cadeia histórica de bumps | C2 coesão OK — bump v1.5 alinhado ao TRANSVERSAL v1.4 e ao FDV-EXEC v3.13 | C3 coerência OK — revogação explícita do REGISTRO-ADOCAO-MCP-2026-08-27 | C4 contradições OK — nenhuma regra viva cita o MCP como fluxo obrigatório | C5 outdatedness OK — âncoras revalidadas no tree 2026-09-15 | C6 complexidade OK -->