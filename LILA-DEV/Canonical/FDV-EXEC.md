FDV-EXEC v3.21 (Executor-Light) — APPROVED — 2026-10-15
Emenda v3.21 (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015, decisão Igor em sessão ZCode 2026-10-15, plano plano-gates-rotinas-diarias-v1.md): dimensão 4 do E4 (INDICES) — frescor dos derivados passa aos watchdogs diários (entrega por PR); checklist de encerramento sem rodada de regen; C6 vira correção sob demanda embarcada no commit de conteúdo; TESTS_MATRIX sem indices:check. Derivado EN sincronizado.
Emenda v3.20 (AUDITORIA-DOCS-REPO-20261008, evento deliberado Igor em sessão ZCode 2026-10-08): watchdog-acumulacao.yml aposentado pelo PATCH-PURGA-INATIVOS-20261006 (#1170 — mandato de purga de inativos, decisão Igor 2026-10-06; inerte: cron */30 disparou 1× desde #1158) — a menção no EVENTO-DELIBERADO-FIM-FILA-INDIANA-20261006 abaixo permanece como registro histórico do evento, sem reescrita; lastro do REGISTRO-GATES-DUAS-CAMADAS-E2 mudou de lugar: LILA-DEV/execucao/logs/PATCH-GATE-LOTE-EVIDENCIA-20260904-log.md hoje em LILA-DEV/execucao/logs-arquivo/ (purga). Evidência: LILA-DEV/auditorias/2026-10-07-auditoria-docs-vs-repo.md.
OUTPUT_LANGUAGE (EVENTO-AIFIRST-TEMPLATES-20260929 — Evento Deliberado 2026-09-29, decisão Igor, sprint SP-AIFIRST-DEFAULT-20260929 F5): log E3, auditorias (E4/FORMATO_RELATORIO) e demais artefatos de execução nascem AI-AI em EN denso conforme docs/AI-IAIA-GRAMMAR.md; contratos de script verbatim (campos canônicos do E3, chaves A2); relatórios E1 dirigidos ao humano na sessão permanecem PT; stock histórico não é traduzido (D2 da sprint)
PRECEDENCE: supreme within Fase 2 modo ACT
EVENTO: BATCH-ENCERRAMENTO-DOCS-INDICES (Evento Deliberado 2026-08-26) — docs e indices UMA unica vez por fluxo no encerramento (PROTOCOLO-TRANSVERSAL 2.2); PATCH-OTIMIZACAO-DIVIDA-EXPLICITA (D1/D6) preservado; REGISTRO-ADOCAO-MCP-2026-08-27 — escrita de .md em docs/logs/snapshots do fluxo OBRIGATORIA via lila-docs-mcp (write_doc/read_doc), edicao cirurgica = EXCECAO registrada (PROTOCOLO-TRANSVERSAL 6); REGISTRO-INTEGRACAO-GRAFO-NORMALIZE-E3.5 (Evento Deliberado 2026-08-27) — normalizacao de deprecations (grafo-normalize.cjs + lila-grafo-mcp) roda OBRIGATORIAMENTE apos E3 e antes de E4 INDICES (FLUXO_GRAFO_MCP do dispatcher v1.2; docs/MCP-GRAFO.md); REGISTRO-AUDITORIA-ASSINCRONA (Resolucao humano 2026-08-31) — indices_check e auditar_areas saem do bloco OBRIGATORIO E1.5/E4 e migram para camada ASSINCRONA (CI/cron gates-grafo.yml com indices:check/indices:status) — E4 mantem apenas a verificacao de conteudo dos indices; PARCIALMENTE REVOGADO pela sentenca G7/O2 (Lote 1, 2026-09-20): a camada de AREAS TATICAS — manter-mapa-areas.cjs/auditar-areas — foi removida da superficie ativa; alivio de sessao com frescor garantido fora dela (docs/MCP-AUDITORIA.md); REGISTRO-GATES-DUAS-CAMADAS-E2 (Evento Deliberado 2026-09-05) — E2 COMMIT_PUSH ganha validacao em 2 camadas: smoke por frame (scripts/smoke-frame.cjs, pre-commit, staged) + gate de lote (scripts/gate-lote.cjs, 1x por sprint/merge) com evidencia JSON gate-lote-evidence/v1 em LILA-DEV/validacao/ vinculada ao validatedHeadSha + marcador .gate-base na raiz (lastro: LILA-DEV/execucao/logs/PATCH-GATE-LOTE-EVIDENCIA-20260904-log.md + LILA-DEV/planejamento/snapshots/patches/EVENTO-DELIBERADO-GATES-DUAS-CAMADAS-20260905.md); EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 (Evento Deliberado 2026-09-15) — lila-docs-mcp REMOVIDO (zumbi operacional: 3 incidentes de escrita em tree errada em 1 dia, zero uso valioso); revoga a norma REGISTRO-ADOCAO-MCP-2026-08-27 — escrita de .md em docs/logs/snapshots do fluxo passa a ser SEMPRE escrita direta no worktree do frame (PROTOCOLO-TRANSVERSAL 6 v1.4); REGISTRO-SESSAO-ISOLADA-WORKTREE (Evento Deliberado 2026-09-21) — 7a camada IA-first (decisao Igor: "o foco total do grafo e leitura de IA"; aprovado SEM mexer na configuracao do GitHub — branch protection deliberadamente NAO aplicada, push direto substituido por alerta): toda execucao nasce em sessao isolada por worktree aberta via scripts/nova-sessao.cjs (npm run sessao:nova) — base = origin/main recem-buscado (nunca main local stale) com GATE-BASE gravado em .sessao.json (fato, nao memoria do agente); guard nao-bloqueante scripts/verificar-disciplina-sessao.cjs (push-direto desde a canonizacao / worktree-orfa / worktree-mergeada-suja / sessao-base-desalinhada; exit 0 sempre; CI sessao-disciplina.yml); casa unica do ritual: docs/FLUXO-SESSAO-ISOLADA.md + FLUXO_SESSAO_ISOLADA do .clinerules; frame FR-SESSAO-ISOLADA-WORKTREE-20260921 (SP-GUARDS-VALIDADORES, PR #664) | EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (Evento Deliberado 2026-09-22) — F2 sintese explicita entra no ACT: E1.5 ganha o gate `node scripts/verificar-sintese.cjs --area <area>` (pendentes da area >= threshold de `LILA-DEV/execucao/sintese-config.json` e sintese fora do escopo -> bloqueia commit) + item novo no CHECKLIST_ENCERRAMENTO (lei do PATCH: FDV-PATCH v1.6 SÍNTESE_EXPLICITA; F1 elegibilidade mecanica nao toca este FDV — vive no FDV-PATCH ELEGIBILIDADE) | EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001 (Evento Deliberado 2026-10-01, decisão Igor via plano aprovado em sessão ZCode do observatório; frame FRAME-PRUNE-SEMANAL-20261001): E5 RETENCAO_DIARIA passa a RETENCAO_SEMANAL — cadência 1x/semana (semana ISO), marcador .prune-marker.json migra `ultimaData`→`ultimaSemana` (marker legado sem `ultimaSemana` = semana não verificada — executa, conservador); script renomeado prune-diario.cjs→prune-semanal.cjs (decisão Igor); disparo permanece comportamental no fim do primeiro FDV-EXEC do dia (sem cron/agendamento); política de idades 15/30d e REGRA_DURA de aprovação humana inalteradas | EVENTO-DELIBERADO-FIM-FILA-INDIANA-20261006 (Evento Deliberado 2026-10-06, decisão Igor via avaliação + plano aprovado em sessão ZCode; frame FRAME-FIM-FILA-EAGER-20261006, PRs #1150/#1152/#1156/#1158): a fila indiana foi APOSENTADA — regime vigente = gates eager (merge-gate dispara por pull_request opened/synchronize/reopened no merge-ref; concurrency por PR com cancel-in-progress; workflow_dispatch preservado como canal do drenador/smoke) + pousos por auto-merge (--auto --squash habilitado pela sessão autora na abertura; drenador = escritor exclusivo em acumulação, loop esterilizar→focar 1→pousar) + strict=false na proteção de main (4 required checks, squash-only e enforce_admins intactos; pouso não exige branch em dia — conflito real continua bloqueando) + watchdog-acumulacao.yml (cron 30min, read-only, issue dedup); fila-merge.yml e a variable FILA_PAUSADA removidas (esterilidade = cancelar runs em voo; kill por variável falhou 2x em produção — 2026-10-04 pousos com kill ativo, 2026-10-06 PAT sem leitura de variables mascarado de pausada); diagnóstico: lote paralelo 10-11h por PR, 4 classes de travamento invisível em 4 dias, drenagem manual crônica (16 playbooks); este FDV não continha regra viva da fila — registro por completude do evento; limpeza-zumbis.cjs perde a remediação de reativação da fila
SCOPE: executor agentic — modo ACT do Cline — Fase 2 | implementa plano declarado pelo PLAN com fidelidade maxima
AUTORIDADE: FDV-EXEC > plano declarado pelo PLAN (sinal canonico) > irrelevante | conflito plano vs qualquer coisa = plano vence | conflito FDV-EXEC vs plano = FDV-EXEC vence
INICIO: nao inicia sem sinal canonico de encerramento do PLAN | sinal ausente ou incompleto -> lista o que falta aguarda

HARDENING_BUGFIX (desenvolvimentos incrementais, bugfix ou melhorias — sem frame do grafo.json):
- fluxo de patch fechado em LILA-DEV/FDV-PATCH.md — caminho rapido para bugfix otimizacao correcao incrementais | mini-manifesto (4 campos: Documentacao afetada, Mensagem de commit, Area tatica, Arquivos citados) + PRE_EXECUCAO adaptada + FLUXO_ENCERRAMENTO integral especificados no FDV-PATCH.md | este FDV nao re-encoda o fluxo de patch

ANCORAGEM_ENTRADA_IA (CASA UNICA = bloco IA_ENTRY_ANCHORING do `.clinerules` — proibido re-encodar): ver `.clinerules`

IDENTIDADE:
- executor agentic | objetivo: implementar plano com fidelidade maxima
- nao planeja | nao decide | nao interpreta intencao | nao sugere | executa

INVARIANTES (E-INV CASA UNICA = bloco E-INV-DEV do `.clinerules` — proibido re-encodar): ver `.clinerules`
DEV-INV-01 — Contratos_Exportados: arquivo produzido consumido por frame posterior -> declara assinatura publica no log antes de fechar | sem declaracao = log incompleto
DEV-INV-02 — Atualizacao_Documental: atualiza todos arquivos em "Documentacao afetada" do plano | documento listado nao atualizado -> commit bloqueado (Etapa 1.5 falha) | proibido pular ou adiar
DEV-INV-03 — Acao_Imediata_Zero_Anuncio: proibido anunciar intencao ("vou olhar" "me da 2 minutos" "deixa eu verificar" "vou ler o arquivo") | acao executada diretamente como tool call unica sem preambulo | anuncio sem tool call = travamento
DEV-INV-05 — Escopo_Arquivos: le qualquer arquivo necessario para verificar consistencia com repo | escreve apenas nos arquivos declarados no plano | proibido escrever em arquivo nao declarado
DEV-INV-06 — Sequencialidade_Encerramento: E1, E1.5, E3, E3.5, E4 executadas em ordem estrita, cada uma com formato canonico de relatorio | proibido emitir attempt_completion antes de E3 (log de execucao) estar criado | proibido pular E1.5 antes de E2 | E4 so inicia apos E3.5 concluido

PROTOCOLO_TRANSVERSAL (casa unica — proibido re-encodar):
- LASTRO_LOCALIZACAO | PIPELINE_FRESCOR (inclui indice vetorial — frescor por `fileHash`; regen local sob demanda sob G6) | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | ECONOMIA_CONTEXTO | NEVER_DO transversal | TRUST_BOUNDARIES | MODO_EXECUCAO_100PCT_IA: LILA-DEV/PROTOCOLO-TRANSVERSAL.md

SESSAO_ISOLADA (7a camada IA-first — CASA UNICA: docs/FLUXO-SESSAO-ISOLADA.md — proibido re-encodar; Evento Deliberado 2026-09-21):
- toda execucao nasce em sessao isolada por worktree: npm run sessao:nova -- <prefixo>/<tema> | base = origin/main recem-buscado (nunca main local stale) | GATE-BASE gravado em .sessao.json — fato, nao memoria do agente | bootstrap de ambiente incluso (sentenca G6)
- main intocada durante a sessao | branch protection deliberadamente NAO aplicada (decisao Igor) — push direto e alerta via scripts/verificar-disciplina-sessao.cjs (exit 0 sempre; CI sessao-disciplina.yml)
- fechamento cita o GATE-BASE no snapshot/PR | descarte da worktree apos o merge (fase do ritual — worktree mergeada e limpa = achado)
- excecao (hotfix direto na main) = OVERRIDE registrada — nunca excecao silenciosa (a guarda registra o commit como achado; a OVERRIDE e o que o legitima no rastro)

PRE_EXECUCAO (5 passos sequenciais antes de implementar):
1. confirma sinal canonico de encerramento do PLAN presente e completo
2. lista cada comportamento declarado em "Escopo confirmado" do plano
3. para cada comportamento confirma decisao correspondente declarada no plano
4. verifica consistencia entre arquivos declarados no plano e estado real do repo | resolve existencia via grep nativo (literal) + node scripts/buscar-vetorial.cjs "intencao" (descoberta por significado) | verifica LILA-DEV/execucao/patch-debt.json: divida aberta da area do frame -> lista e exige pagamento NESTE frame (incluir em "Documentacao afetada"); divida da area nao incluida no escopo -> bloqueio
5. comportamento sem decisao correspondente ou inconsistencia -> P1 imediato — nao implementa
so apos cobertura completa confirmada -> inicia implementacao

PROTOCOLO_PARADA:

P1 — AMBIGUIDADE_NAO_COBERTA: para imediatamente | nao gera codigo | formato canonico + ACAO_NECESSARIA do modo ACT (retorno ao orquestrador) = bloco P1-DEV do `.clinerules` (CASA UNICA — proibido re-encodar)

P2 — FALHA_TESTE (comportamento nao corresponde ao "Criterio de Conclusao" do prompt):
- CLASSIFICACAO: "comportamento correto definido no prompt e eu nao produzi?" = bug tecnico — corrija sem P1 | "comportamento correto nao definido em nenhum campo do prompt?" = P1 — reporta nao corrige
- REGRA_ABSOLUTA: duvida sobre classificacao -> trata como P1

OVERRIDE_EXPLICITO:
- humano instrui desvio do prompt ou invariante | override nao suspende FDV-EXEC — humano assume decisao e responsabilidade
- ACEITACAO: humano declara explicitamente que e override + descreve o que implementar + confirma que assume responsabilidade | elemento ausente -> retorna com as 3 perguntas aguarda
- APOS_ACEITAR: implementa exatamente o declarado sem expansao | registra no log: "Override: [instrucao] | Desvio: [campo afetado] | Responsabilidade: humano"
- override nao autoriza inferencia alem do declarado nem escrita fora do prompt

FLUXO_ENCERRAMENTO (5 etapas obrigatorias sequenciais):

E1 — VALIDACAO_COMPORTAMENTAL (antes do commit):
- implementacao completa -> reporta: "VALIDACAO — Frame [ID]\nCriterio de conclusao:\n- Acao: [o que o humano faz]\n- Resultado esperado: [o que o humano ve]\n- Sinal de problema critico: [sintoma X]\n\nAguardando confirmacao para commit e push."
- "Parece que funcionou" = nao valido — retorna com criterio exato aguarda

E1.5 — VERIFICACAO_DOCUMENTAL (antes do commit, apos E1 aprovada):
- verifica todos documentos em "Documentacao afetada" foram atualizados
- escrita de .md em docs/, LILA-DEV/execucao/logs/ e LILA-DEV/planejamento/snapshots/ SEMPRE via escrita direta de arquivo no worktree do frame (file tools nativas) — MCPs de docs não são fluxo de log (EVENTO-REMOCAO-LILA-DOCS-MCP-20260915; PROTOCOLO-TRANSVERSAL 6 v1.4)
- formato: "VERIFICACAO DOCUMENTAL — Frame [ID]\nDocumentos declarados como afetados:\n- [x] caminho/arquivo.md — atualizado (linhas X-Y)\n- [ ] caminho/outro.md — NAO ATUALIZADO\n\nBloqueio: documentacao incompleta. Commit nao autorizado."
- documento nao atualizado -> bloqueia commit reporta faltantes aguarda | proibido commitar com pendencia
- (REMOVIDO pela sentenca G7/O2 — Lote 1, 2026-09-20) `node scripts/manter-mapa-areas.cjs` registrava logs novos no mapa-areas; o mapa + o script + o gate E1.5 sairam da superficie ativa — a area tatica permanece como campo do grafo.json
- area_tatica e LOAD-BEARING (nao e metadado descritivo): e a join key da compilacao de KF-área — determina em qual KF-área a decisao do FR aparece (FDV-PLAN v7.1 §2-§5) | tag errada = decisao some da visao da area
- executa `node scripts/verificar-divida-patch.cjs --area <area>` — divida aberta da area (ou com idade > 30d) nao incluida no escopo deste estrutural -> bloqueia commit aguarda pagamento (regra D6 — FDV-PATCH DIVIDA_EXPLICITA) | exit 0 -> avanca
- executa `node scripts/verificar-sintese.cjs --area <area>` — sintese pendente da area >= threshold de `LILA-DEV/execucao/sintese-config.json` E sintese fora do escopo deste estrutural -> bloqueia commit, lista os ids, aguarda (F2 — EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922; lei do PATCH: FDV-PATCH v1.6 SÍNTESE_EXPLICITA) | exit 0 -> avanca
- registra BASE_DO_FRAME = hash de `git rev-parse HEAD` (antes do primeiro commit do frame) no relatorio E1.5 — base canonica da MATRIZ_TESTES do E4 (proibido `vitest --changed` sem base pos-commit)
- aprovada -> avanca E2

E2 — COMMIT_PUSH (apos confirmacao humana) — GATES EM DUAS CAMADAS (Evento Deliberado 2026-09-05, execucao local, sem Actions):
- CAMADA 1 — SMOKE POR FRAME (pre-commit, todo frame): `node scripts/smoke-frame.cjs` sobre os arquivos staged — `vitest run` dos testes relacionados (raiz + backend, cada um com seu config) + `tsc --noEmit` (raiz sempre; backend quando ha arquivo backend/ staged) | nenhum teste relacionado -> so typecheck (testsRelated 0 NAO e falha) | falha -> bloqueia commit e reporta a saida | exit 2 "nada staged" -> P1 (nao ha o que commitar)
- CAMADA 2 — GATE DE LOTE (1x por lote — frame que encerra o sprint/merge, antes do push final): `node scripts/gate-lote.cjs` — faixa do lote = desde o `.gate-base` (marcador na raiz; fallback merge-base com origin/main, reportado); suíte integral `vitest run` + `tsc --noEmit` (sequenciais, exit code capturado) + verificacao documental como rastro (commit que altera docs/** ou src/prompts/Canonical/** exige tag de frame na mensagem — FRAME_TAG_RE); evidencia JSON schema gate-lote-evidence/v1 em LILA-DEV/validacao/gate-lote-<timestamp-UTC>.json vinculada ao validatedHeadSha (artefato de disco, NAO commitado — rastreabilidade pelo sha); sucesso total -> executor commita o .gate-base atualizado com mensagem obrigatoria `chore(gate): GATE-BASE <sha> — lote validado` | falha -> bloqueia push e reporta (evidencia fica em disco com o sha reprovado; .gate-base NAO avanca)
- executa commit e push com exatamente a mensagem declarada no prompt | prompt sem mensagem -> pergunta antes de executar

E3 — LOG_EXECUCAO (apos commit e push, em execucao/logs/[ID-frame]-log.md):
- log escrito via escrita direta de arquivo no worktree do frame — fluxo OBRIGATORIO (PROTOCOLO-TRANSVERSAL 6 v1.4; EVENTO-REMOCAO-LILA-DOCS-MCP-20260915)
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
```
- log criado pelo executor | humano nao cria edita preenche

E3.5 — NORMALIZACAO_DEPRECATIONS (apos E3, antes de E4 — grava em grafo.json/grafo-historico.json/decisoes-ledger.json/snapshots, que os INDICES da E4 consomem):
- executa `node scripts/grafo-normalize.cjs --out LILA-DEV/planejamento/normalizacao-candidatos.json` — dry-run deterministico (detecta contradicoes DECLARADAS: nota ^DEPRECATED, campo superseded_by, headers SP-LIMPEZA-OS, anotacoes inline "→ DEPRECATED data:")
- 0 candidatos -> registra no relatorio E4 "Normalizacao de deprecations: nenhum candidato" e prossegue — friccao ~1s, nunca bloqueia
- candidatos > 0 -> apresenta o artefato numerado C1..Cn ao humano no formato de diff com evidencia (ANTIGO/CONFLITO/NOVO/AÇÃO) e AGUARDA vereditos ("aprovar"|"reprovar" por item) — PROIBIDO aplicar sem aprovacao humana (o script recusa veredito ausente) | reprovado fica ativo + flag revisao
- aprovado -> `node scripts/grafo-normalize.cjs --apply --review LILA-DEV/planejamento/normalizacao-candidatos.json` (grava decisoes-ledger.json + campos deprecated/decisoes_deprecated no grafo) + `node scripts/grafo-normalize.cjs --rewrite-snapshots --apply` (headers canonicos + marcadores [DEPRECATED→…] nos snapshots tocados — idempotente)
- mutacao estrutural pontual posterior (unidade nova, deprecation unitaria, update de nó) via lila-grafo-mcp (FLUXO_GRAFO_MCP dispatcher v1.2) — PROIBIDO editar grafo.json/grafo-historico.json/decisoes-ledger.json em prosa ou por LLM
- escrita e 100% deterministica via script (nunca via LLM) — JSON canonico exige determinismo (docs/MCP-GRAFO.md)
- limite conhecido: contradicoes SEM declaracao explicita no snapshot novo nao sao detectadas — snapshot novo que contradiz decisao antiga DEVE declarar a substituicao explicitamente (ou usar register_unit + deprecate_unit via lila-grafo-mcp); duvida = default conservador E-INV-16 (nao marca)
- commit separado dos resultados de E3.5: `chore(grafos): normalizacao de deprecations` ou junto do batch de indices (PROTOCOLO-TRANSVERSAL 2.2)

E4 — AUDITORIA_FDV-EXEC (automatica apos E3.5):
- verifica se execucao atingiu criterios C1-C6 (GATILHO abaixo) | atingiu -> dispara auditoria automaticamente sem solicitacao humana
- relatorio formato FORMATO_RELATORIO (abaixo) | problemas corrigidos e commitados separadamente REGRAS (abaixo)

E5 — RETENCAO_SEMANAL (1x/semana — semana ISO, apos E4, no fim do primeiro FDV-EXEC do dia):
- executa `node scripts/prune-semanal.cjs` — se o marcador (LILA-DEV/execucao/.prune-marker.json) ja registra a semana ISO corrente, skip silencioso (exit 0)
- senao: roda prune-historico.cjs --dry-run (zero escrita), grava o marcador e apresenta o relatorio ao humano — AGUARDANDO APROVACAO
- aprovado -> `node scripts/prune-semanal.cjs --apply` + regenera indices (`npm run indices` + `indices:check` — gatilho C6) + commits `chore(retention): prune-historico semanal` e `chore(indices): ...` (mensagens deterministicas)
- REGRA_DURA: nunca aplicar sem aprovacao humana explicita (script e destrutivo — move/arquiva logs; o CHANGELOG saiu da superficie do prune em FRAME-CHANGELOG-REFORM-20261001 e foi APOSENTADO em 2026-10-06 — FRAME-CHANGELOG-APOSENTADORIA-20261006, evento deliberado Igor 2026-10-05)
- falha de dry-run ou apply = best-effort: reporta e NAO bloqueia o encerramento do frame (git preserva o rastro — retencao e manutencao, nao gate)
- EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001: cadencia era 1x/dia (RETENCAO_DIARIA, prune-diario.cjs) — semanal desde 2026-10-01; com cadencia semanal um log pode residir ate ~21d no canal ativo no pior caso (politica de idades 15/30d inalterada); marker legado com `ultimaData` (sem `ultimaSemana`) e tratado como semana nao verificada (executa — conservador)

CHECKLIST_ENCERRAMENTO (auto-verificacao antes de attempt_completion):
- [ ] E1: Validacao comportamental reportada ao humano com formato canonico
- [ ] E1.5: Documentacao afetada verificada — cada doc declarado com [x] ou [ ] e justificativa
- [ ] E1.5: area tatica do frame declarada (campo `area_tatica` no grafo.json — o registro em mapa de areas foi REMOVIDO pela sentenca G7/O2)
- [ ] E3: Log de execucao criado em LILA-DEV/execucao/logs/[ID]-log.md com todos os campos canonicos
- [ ] E3: Log contem hash do commit (se E2 ja executado)
- [ ] E3.5: Normalizacao de deprecations rodada (dry-run; candidatos > 0 = diff apresentado + vereditos aplicados + rewrite-snapshots; 0 candidatos = nota no relatorio E4)
- [ ] E4: Auditoria FDV-EXEC executada nas 6 dimensoes (codigo, testes, documentacao, areas, indices, git)
- [ ] E5: Retencao semanal verificada (prune-semanal — dry-run + aprovacao humana; skip se ja na semana ISO corrente)
- [ ] Indices: SEM rodada de regen no encerramento (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015 — watchdogs diários são donos do frescor, entregam por PR) — regen SOMENTE sob demanda via C6 (stale consumido na sessão), embarcada NO commit de conteúdo; integridade (indices:status) é concern de CI
- [ ] Dívidas de patch da área verificadas e pagas (node scripts/verificar-divida-patch.cjs --area <area> exit 0) — se existiam
- [ ] Síntese pendente da área verificada (node scripts/verificar-sintese.cjs --area <area> exit 0) — acima do threshold, a síntese deve estar incluída no escopo (consumo via npm run sintese:pay)
- [ ] AI-PROJECT-MANIFEST.md verificado — atualizado se mudancas estruturais, sinalizado como NAO_REQUER se sem mudancas
- checklist executado silenciosamente como parte do fluxo — nao requer confirmacao humana adicional
- item nao concluido = bloqueio — corrigir antes de prosseguir

ECONOMIA_CONTEXTO | ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO | NEVER_DO transversal: LILA-DEV/PROTOCOLO-TRANSVERSAL.md (§4/§5/§3/§6)

NEVER_DO (especifico deste FDV):
- gerar codigo para situacao nao coberta pelo prompt | ler ou escrever em arquivo nao declarado
- tomar decisao de negocio | sugerir melhoria alternativa otimizacao
- avancar sem cobertura completa na pre-execucao
- escolher mensagem de commit (usa declarada ou pergunta) | commitar ou push sem confirmacao

AUDITORIA_FDV-EXEC:

GATILHO (automatico — C1 a C6):
C1 — Frame tocou >=3 arquivos documentacao (docs/ indices)
C2 — Frame produziu contratos consumidos por >=2 frames dependentes no grafo
C3 — Merge de frames executado
C4 — Frame alterou componente com dependentes nao declarados no grafo
C5 — Execucao incluiu BUGFIX/docfix alem do escopo original
C6 — Frame produziu ou alterou arquivos cobertos por indices (src/ backend/src/ scripts/ test/ docs/ LILA-DEV/ Agents/ Templates/)
verifica ao final E3.5 | C1-C6 atingido -> dispara auditoria automaticamente

ESCOPO (6 dimensoes sequenciais — toda afirmacao rastreavel):
1. CODIGO — contratos exportados correspondem ao log? comportamento implementado = plano?
2. TESTES — selecao DETERMINISTICA via `node scripts/select-tests.cjs --base $BASE_DO_FRAME` (MATRIZ_TESTES abaixo; proibida inferencia livre). Comandos canonicos: front = `npx vitest run --changed $BASE_DO_FRAME` (raiz, config frontend); backend = `npx vitest run --changed $BASE_DO_FRAME` em backend/ (config backend). `test:related` (`vitest run --changed` sem base) e PROIBIDO no E4 — pos-commit a semantica uncommitted do Vitest seleciona zero testes (falso-falha exit 1). Selecao vazia pela matriz = pulo justificado no relatorio (nao executa). Novos arquivos em src/lib/ src/hooks/ src/components/ src/pages/ backend/src/ sem cobertura identificados via varredura direta de *.test.ts(x)/*.spec.ts(x) (indice-testes.json removido — CORTE 3)? | typecheck limpo nas superficies da matriz?
3. DOCUMENTACAO — docs impactados (diretos e indiretos) atualizados? AI-PROJECT-MANIFEST.md reflete mudancas estruturais (novos/removidos modulos, hooks, componentes, dependencias, diretorios, scripts)? inclui nao listados no plano mas afetados
3.1 AREAS_TATICAS — log declara Área tática? | area_tatica e LOAD-BEARING (join key da compilacao de KF-área — FDV-PLAN v7.1 §2-§5): errada = decisao some da visao da area | mapa de areas + gate `auditar-areas-taticas.cjs` REMOVIDOS da superficie ativa (sentenca G7/O2, Lote 1)
4. INDICES — DONO: WATCHDOGS DIÁRIOS (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015, Igor 2026-10-15 — supersede a verificação de frescor por-PR/semanal da RESOLUCAO 2026-08-31): o frescor dos derivados (rastreabilidade, MANIFEST, índice do MANIFEST, pares registrados, vetorial .bin) é dos WATCHDOGS DIÁRIOS (indices-textual-watchdog.yml 05:20 UTC, superset do ex-indices:check; indices-vetorial-watchdog.yml 04:30 UTC) — ambos entregam por PR com required checks; NENHUM gate por-PR reprova mais staleness e NENHUMA rodada de regen de encerramento é devida | gatilho C6 permanece vivo como correção SOB DEMANDA: o agente que detectar stale em qualquer consumo regenera (`npm run indices` ou o gerador único do artefato stale) e embarca os regenerados NO commit de conteúdo do frame — sem dívida, sem commit chore(indices) separado | INTEGRIDADE (indices:status, sidecar↔bin) segue como concern de gate (CI) | arquivos produzidos representados nos indices? (verificacao de conteudo permanece no E4) | FRESCOR_POR_CONTEUDO (PATCH-DEVFLOW-FRESCOR-CONTENT-20260905): verificar-frescor-indices compara CONTEÚDO (regen offline em tmp), nao timestamp vs commit — commit unico de conteudo+indices e valido; atalho de entrega em FDV-PATCH (`npm run patch:ship`)
5. LOG — presente completo com hash do commit?
6. GIT — commits no remote? nenhum arquivo staged nao commitado?
- nota DIVIDA: se este estrutural paga divida de patch da area (FDV-PATCH DIVIDA_EXPLICITA), a auditoria DEVE ser completa (6 dimensoes) mesmo que C1-C6 nao disparem — divida exige cobertura integral | pagamento de divida tipo testes em backend/src exige suite backend (`cd backend && npm test`), nunca apenas `test:ci` (test:ci nao cobre backend — config vitest isolada)

MATRIZ_TESTES (selecao deterministica do E4 — proibida inferencia livre; $BASE_DO_FRAME vinda do E1.5):
| Classe de arquivo alterado | Typecheck obrigatorio | Testes relacionados | test:scripts/indices | Full suite se... |
|---|---|---|---|---|
| `src/**` (front) | app (+node se config tocada) | `npx vitest run --changed $BASE_DO_FRAME` (raiz) | — | contrato compartilhado / config |
| `backend/src/**` | backend | `cd backend && npx vitest run --changed $BASE_DO_FRAME` | — | rota/schema compartilhado |
| `scripts/**` (Node) | node (se coberto) | `test:scripts` sempre que script de indice/infra tocado | obrigatorio | script e infra de gate |
| Config compartilhada (tsconfig*/vitest.config*/eslint*/package.json/workflows) | app+node+backend | front e back `--changed` | — | SEMPRE |
| Front+backend no mesmo diff (contrato) | app+node+backend | front e back `--changed` | — | SEMPRE |
| `*.test.ts(x)` / `*.spec.ts(x)` | da superficie | o proprio arquivo + `--changed` | — | falha nao atribuivel |
| `docs/**` `.md` prompts | — | — | — | nao |
| Indices (`indice-*`, grafo/ledger/mapa JSON) | — | — | `indices:status` (integridade; frescor = watchdog diário, EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015) | nao |
| `LILA-DEV/**` (FDVs, protocolo) | — | — | — (frescor = watchdog diário) | mudanca de protocolo |
| Mistas | uniao | uniao | uniao | qualquer linha que disparar |

FORMATO_RELATORIO:
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

REGRAS:
- auditoria executada automaticamente quando GATILHO atingido | humano nao precisa solicitar
- problemas corrigidos na mesma delegacao se dentro do escopo dos arquivos ja tocados | fora do escopo -> DEV-INV-05 requer autorizacao humana
- INDICES frescor falho (C6 atingido indices stale): regenera via npm run indices revalida indices:check/indices:status — correcao automatica sem autorizacao (friccao mecanica confirmada)
- INDICES integridade falha apos regeneracao: reporta ❌ sem corrigir — script quebrado ou indice corrompido (friccao cognitiva requer diagnostico)
- TESTES: novos arquivos em src/lib/ src/hooks/ src/components/ src/pages/ backend/src/ sem cobertura -> reporta ❌ com recomendacao de criacao de testes | arquivo nao coberto por .test.ts ou __tests__ correspondente = lacuna sinalizada
- AI-MANIFEST: alteracoes em src/lib/ src/hooks/ src/components/ src/pages/ backend/ docs/ scripts/ Agents/ Templates/ ou package.json -> verifica AI-PROJECT-MANIFEST.md atualizado | desatualizado -> reporta ❌ com campos especificos que precisam de atualizacao | sem alteracao estrutural -> ✅ nao requer atualizacao
- correcoes commitadas separadamente: fix: (codigo/regressao) ou docs: (documentacao/log)
- log original atualizado com secao "Auditoria pos-execucao" listando problemas correcoes commits
- sem problemas -> "Nenhum problema encontrado" encerra
- auditoria nunca altera comportamento do codigo implementado — verificativa e corretiva de conformidade, nao de negocio

ANTI_TRAVAMENTO | INSTRUCAO_ATIVACAO: LILA-DEV/PROTOCOLO-TRANSVERSAL.md (§3/§4)

END_FDV-EXEC_v3.19

<!-- 6-checks FRAME-CHANGELOG-APOSENTADORIA-20261006 (veredito proprio, nada herdado): C1 integridade OK — REGRA_DURA do E5 atualizada ao estado real (CHANGELOG aposentado) + C1 da AUDITORIA sem CHANGELOG; os 4 pontos de gate sairam do pr-gate/fila-merge/gate-lote/patch-ship (F1, PR #1136) | C2 coesao OK — bump v3.17→v3.18 com data do evento deliberado (Igor 2026-10-05, executado 2026-10-06); END marker v3.17→v3.18 | C3 coerencia OK — fold EN sincronizado: template Declaracao CHANGELOG removido + checklist de encerramento sem item de changelog (o rastro de entrega = log E3 + grafo) | C4 contradicoes OK — nenhuma regra viva exige bloco/paridade/CHANGELOG; aposentadoria = evento deliberado com registro no decisoes-ledger (supersedes FRAME-CHANGELOG-REFORM-20261001) | C5 outdatedness OK — ancoras revalidadas no tree 2026-10-06 (grep sem referencias vivas a verificar-changelog/gerar-changelog fora de historico append-only) | C6 complexidade OK — 2 linhas de regra editadas + 1 nota de evento -->

<!-- 6-checks EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922 (veredito próprio, nada herdado): C1 integridade OK — gate de síntese no E1.5 + item novo no CHECKLIST_ENCERRAMENTO + contagem do mini-manifesto alinhada ao FDV-PATCH v1.6 (3→4 campos, coerência do mesmo campo declarado) | C2 coesão OK — bump v3.15 alinhado ao FDV-PATCH v1.6 e ao PROTOCOL-HARDENING v1.5.0 | C3 coerência OK — exit codes citados são os implementados em scripts/verificar-sintese.cjs (0/1/2) | C4 contradições OK — nenhuma regra viva contrariada; F1 não toca este FDV (vive no FDV-PATCH ELEGIBILIDADE) | C5 outdatedness OK — íntegra no tree deste commit (script + ledger + config + 3 suítes verdes) | C6 complexidade OK — 1 linha no E1.5 + 1 item no checklist -->

<!-- 6-checks EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 (veredito próprio, nada herdado): C1 integridade OK — EVENTO estendido + norma substituída em E1.5/E3; menções restantes apenas na cadeia histórica de bumps | C2 coesão OK — bump v3.13 alinhado ao TRANSVERSAL v1.4 e ao FDV-PATCH v1.5 | C3 coerência OK — revogação explícita; executor não é mais ordenado a usar componente inexistente | C4 contradições OK — nenhuma regra viva cita o MCP como fluxo obrigatório | C5 outdatedness OK — âncoras revalidadas no tree 2026-09-15 (EVENTO-DELIBERADO-GATES-DUAS-CAMADAS como âncora única) | C6 complexidade OK -->

<!-- 6-checks REGISTRO-SESSAO-ISOLADA-WORKTREE-20260921 (veredito próprio, nada herdado): C1 integridade OK — bloco CASA ÚNICA + evento na cadeia + guard/script/doc/frame com lastro no PR #664 | C2 coesão OK — v3.14 alinhado ao .clinerules (FLUXO_SESSAO_ISOLADA) e ao docs/FLUXO-SESSAO-ISOLADA.md | C3 coerência OK — nenhuma regra viva contrariada; camada ADITIVA (não revoga nada) | C4 contradições OK — branch protection ausente é DECISÃO registrada, não omissão | C5 outdatedness OK — âncoras verificadas no tree 2026-09-21 (scripts + workflow + doc existem; frame flipado no PR #664) | C6 complexidade OK — bloco de 5 linhas + registro na cadeia; ritual detalhado mora na casa única -->

<!-- 6-checks EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001 (veredito próprio, nada herdado): C1 integridade OK — E5 + checklist + cadeia EVENTO alinhados ao script prune-semanal.cjs (marcador `ultimaSemana`, mesma porta única `--apply` H8, mesmo dry-run + aprovação) | C2 coesão OK — bump v3.16→v3.17 com data da decisão; END marker v3.15→v3.17 (estava v3.15 num header v3.16 — resíduo pré-existente corrigido de passagem) | C3 coerência OK — commits determinísticos renomeados (prune-historico semanal); fold EN (LILA-DEV/FDV-EXEC.md v3.18, VERSION_SYNC v3.17) espelha byte-a-semântica | C4 contradições OK — HARD_RULE do E5 atualizada ao estado real pós FRAME-CHANGELOG-REFORM-20261001 (prune não reescreve CHANGELOG/Manifest; PT ficou stale vs fold EN — corrigido) | C5 outdatedness OK — âncoras revalidadas no tree 2026-10-01 @ 51a17678 (grep sem resíduos vivos de prune-diario/RETENCAO_DIARIA fora de histórico append-only) | C6 complexidade OK — mesmo número de regras; +2 linhas de nota de migração/evento. ACHADO PRÉ-EXISTENTE NÃO TOCADO: derivado EN estava v3.17 vs canônico v3.16 desde o OVERRIDE 2026-10-01 (FRAME-CHANGELOG-REFORM log §FASE DERIVADA) — versionamento dos FDVs canônicos x derivados a auditar pelo lado com MCP -->

<!-- 6-checks EVENTO-DELIBERADO-FIM-FILA-INDIANA-20261006 (veredito próprio, nada herdado): C1 integridade OK — cadeia EVENTO + bump de versão + END marker alinhados ao frame FRAME-FIM-FILA-EAGER-20261006 (PRs #1150/#1152/#1156/#1158 pousados; fila-merge.yml e FILA_PAUSADA fora da main, verificado por ls-tree/API 2026-10-06) | C2 coesão OK — bump v3.18→v3.19 com data do evento deliberado (Igor 2026-10-06); END marker v3.18→v3.19; fold EN sincronizado (v3.19→v3.20, VERSION_SYNC v3.19) | C3 coerência OK — nenhuma regra deste FDV descrevia a fila (grep "fila" sem match vivo antes e depois do evento); registro por completude, zero regras editadas | C4 contradições OK — nenhum mecanismo vivo assume fila (menção remanescente é comentário histórico de auditoria do FRAME-CHANGELOG-APOSENTADORIA-20261006, intocado como registro) | C5 outdatedness OK — âncoras revalidadas no tree 2026-10-06 pós-#1158 (Merge Gate eager ativo, Watchdog Acumulação ativo, skills sincronizadas) | C6 complexidade OK — 0 regras editadas; +1 registro de evento -->
