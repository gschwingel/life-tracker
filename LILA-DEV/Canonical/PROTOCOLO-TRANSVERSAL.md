# LILA-DEV — Protocolo Transversal de Execução

**Versão:** v1.7 — 2026-10-02 — APPROVED
**Bump:** v1.0 (implícito, criado 2026-08-18 — meta_updated_fdv_exec_otimizacao) → v1.1 (Evento Deliberado PATCH-OTIMIZACAO-DIVIDA-EXPLICITA) -> v1.2 (Evento Deliberado BATCH-ENCERRAMENTO-DOCS-INDICES) -> v1.3 (Evento Deliberado REGISTRO-ADOCAO-MCP-2026-08-27 — escrita de .md em docs/logs/snapshots OBRIGATORIA via lila-docs-mcp) -> v1.4 (Evento Deliberado EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 — revoga a norma do v1.3: lila-docs-mcp REMOVIDO (zumbi operacional — 3 incidentes de root em 1 dia, zero uso valioso); escrita de .md em docs/logs/snapshots passa a ser SEMPRE escrita direta no worktree do frame; MCPs de docs não são fluxo de log) -> v1.5 (PATCH-PROCESSO-SESSAO-MCP-20260922 — NEVER_DO ganha a nota de leitura de `core.hooksPath`) -> v1.6 (FRAME-CONTRATOS-DE-FRONTEIRA-20260922 — F4: §8 TRUST_BOUNDARIES, política única de fronteiras de confiança; sync canônico aplicado por Igor 2026-10-01 após veredito O1/a1 — o derivado carregava a v1.6 desde o F4 sem o canônico) -> v1.7 (FRAME-LACO-ESTADO-20261002 — §2.2 ganha a EXCEÇÃO ESTREITA do rascunho incremental de snapshot no PLAN; + FDV-PLAN v7.3 §2 RELAÇÃO COM DECISÕES ATIVAS, decisão Igor 2026-10-02)
> Documento canônico que centraliza os blocos operacionais replicados nos FDVs (FDV-DEV, FDV-EXEC, FDV-PATCH).
> Cada FDV aponta para este protocolo em 1 linha — proibido re-encodar o conteúdo aqui definido.
> Precedência: FDV-PLAN v7.1 → FDV-DEV → FDV-EXEC → FDV-PATCH. Este protocolo é subordinado aos FDVs que o referenciam.

---

## 1. LASTRO_LOCALIZACAO (regra de cerca — transversal)

- indices (semantico, reverso, docs, testes, rastreabilidade, cobertura, **vetorial**) + AI-PROJECT-MANIFEST.md = lastro de LOCALIZACAO. O **indice vetorial** (indice-vetorial.json + .bin) e consumido exclusivamente via `node scripts/buscar-vetorial.cjs` (nunca ler o .bin — 7-30MB estoura contexto; mesmo padrao do indice reverso).
- permitido: resolver caminho, confirmar existencia de arquivo/contrato/simbolo, localizar modulo, compor catalogo ("Documentacao afetada").
- proibido: fonte de decisao de negocio, argumento de inferencia, autoridade sobre comportamento de frame. Decisao de negocio = snapshot/prompt/plano declarado, exclusivamente.
- abrir indice nao carrega contexto de sessao anterior (estado atual do repo) — memoria explicita preservada (E-INV-13).

## 2. PIPELINE_FRESCOR — CASA ÚNICA: `LILA-DEV/PROTOCOLO-INDICES.md` (REGRA 2)

- O pipeline integral (frescor por `fileHash` | integridade sidecar↔bin | testes do vetorial | regeneração seletiva | regen local SOB DEMANDA sob G6) vive em `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 2 — casa única (sentença G3). **Proibido re-encodar aqui.**
- Mínimo operacional (não substitui a casa): nunca consumir índice stale; `npm run indices:check` antes de consumir qualquer índice (exit 1 → regenerar). O frescor do vetorial fora da janela de PR é do watchdog de CI (G6) — a regen local é sob demanda, nunca obrigação recorrente.

## 2.1 REGRA PATCH — CASA ÚNICA: `LILA-DEV/PROTOCOLO-INDICES.md` (REGRA 2, regen sob demanda)

- Falha do vetorial num patch sob G6 (REANC-L4, 2026-09-20) **não registra mais dívida**: o frescor fora da janela de PR é do watchdog de CI. Registro/pagamento de dívida (D6) permanece para as dívidas que o FDV-PATCH declarar explicitamente (§DIVIDA_EXPLICITA). Casa única — proibido re-encodar.

## 2.2 BATCH_ENCERRAMENTO (anti-fragmentacao — docs e indices UMA unica vez por fluxo)

Regra dura: a escrita documental de execucao (logs E3, snapshots, auditoria E4) e a regeneracao de indices ocorrem UMA UNICA vez por fluxo, agrupadas no encerramento (sequencia E1.5 -> E3 -> E4 e CHECKLIST), na mesma janela do termino — nunca em etapas intermediarias.

PROIBIDO:
- commit/regeneracao de indices a cada etapa do fluxo (nao gerar chore(indices) por E2/E3/E4 parcial);
- log de execucao criado/comitado em partes por estagio — o log E3 e escrito COMPLETO, de UMA vez, no encerramento;
- atualizacao do AI-PROJECT-MANIFEST no meio do ciclo em vez do encerramento.

CONSENTIDO (nao conta como fragmentacao): regeneracao emergente de um indice stale no MEIO do fluxo se ele estiver travando localizacao/consumo (ver `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 2 — casa unica) — porem o commit desse indice acompanha o batch de encerramento, e a regra de uma rodada no fim permanece como sinal para a auditoria E4.

- Encerramento (uma rodada de `indices:smart` + `indices:check` + `indices:status` no encerramento estrutural/patch): ver `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 2 — casa unica, proibido re-encodar.
- Efeito: elimina series de chore(indices) e log-por-etapa (ruido e custo redundante), mantendo gate de qualidade (docs:check + auditoria nao reduzidas).

EXCEÇÃO ESTREITA — RASCUNHO INCREMENTAL DE SNAPSHOT NO PLAN (FRAME-LACO-ESTADO-20261002, decisão Igor 2026-10-02):
- o RASCUNHO do snapshot de frame/sprint (LILA-DEV/planejamento/snapshots/) É ISENTO desta regra DURANTE o PLAN: pode ser escrito e commitado incrementalmente (commit por DECISÃO DELIBERADA, na branch da sessão) — a morte de sessão antes da cristalização perde decisão que só o humano (não-técnico) pode re-derivar; a decisão tem de nascer dura no repo no momento da deliberação
- limites da isenção: (1) só o rascunho de snapshot — log E3, auditoria E4, índices e manifest continuam UMA VEZ no encerramento; (2) commit por decisão deliberada, nunca por edição de linha; (3) zero regeneração de índices no meio do PLAN; (4) os commits intermediários do rascunho desaparecem no squash do merge — o cânone na main continua vendo um commit limpo por frame
- a regra-mãe (uma rodada no encerramento) permanece integral para a fase de execução e permanece o sinal para a auditoria E4

## 3. ANTI_TRAVAMENTO

- DETECCAO: mensagem sem tool call prometendo acao | silencio apos anuncio | texto extenso sem progresso
- ACAO_HUMANO: interrompe sessao | envia "Continue executando a proxima tool call. Sem anuncio." | repetir padrao -> encerra abre nova com ancoragem fresca (E-INV-13)
- CLASSIFICACAO: falha operacional — nao e P1 | nao altera estado frame
- PREVENCAO: nunca texto antes de tool call | nunca intro ou confirmacao | multiplas tool calls uma por vez | resposta longa -> particionar em tool calls menores

## 4. INSTRUCAO_ATIVACAO (system prompt)

"Voce e o FDV-[X]. NUNCA anuncie o que vai fazer — execute a proxima tool call imediatamente. NUNCA diga 'vou olhar', 'me da 2 minutos' ou equivalente. Se voce nao tem tool call imediata, declare 'Nenhuma tool call necessaria — proxima acao: [acao minima]' e execute. Parar de processar apos anuncio e travamento — proibido."

## 5. ECONOMIA_CONTEXTO

- nao reproduz conteudo de arquivos -> referencia por nome e caminho | nao explica protocolo | nao gera intro conclusao confirmacao
- respostas intermediarias minimas | outputs longos: sinal canonico, relatorio P1/P2, validacao E1, verificacao E1.5, log de execucao E3
- CoT e raciocinio intermediario (scratchpad interno) sao executados estritamente em ingles tecnico para maxima densidade de tokens e eficiencia do espaco latente; outputs, logs e entregas finais ao humano mantem o padrao pt-BR
- proibido parafrasear confirmar planejar_em_voz_alta anunciar — tool call executada imediatamente

## 6. NEVER_DO (transversal)

- usar contexto de sessoes anteriores | resolver P1 por inferencia | explicar proprio protocolo
- anunciar acao sem tool call | gerar texto intermediario substituindo tool call | aguardar instrucao quando acao ja determinada
- escrever em arquivo nao declarado no plano/descricao | tomar decisao de negocio
- nunca `git config core.hooksPath --worktree` como leitura — neste git `--worktree` vira VALOR e grava `core.hooksPath = --worktree`, jogando todos os hooks em path invalido (`sh: --worktree/post-commit: invalid option`); leitura e sempre `git config --get core.hooksPath` — ocorrido 2026-09-22, corrigido em 9146fd96 (PATCH-PROCESSO-SESSAO-MCP-20260922)
- MCPs de docs não são fluxo de log: a escrita de .md em docs/, LILA-DEV/execucao/logs/ ou LILA-DEV/planejamento/snapshots/ é SEMPRE escrita direta de arquivo no worktree do frame (file tools nativas do agente) — o lila-docs-mcp foi REMOVIDO em 2026-09-15 (Evento Deliberado EVENTO-REMOCAO-LILA-DOCS-MCP-20260915; revoga a norma do REGISTRO-ADOCAO-MCP-2026-08-27)

## 7. MODO_EXECUCAO_100PCT_IA

- metodo de execucao do LILA: **100% IA** — o humano decide e arquiteta; a IA executa toda a mecanica.
- humano nao digita comando, nao roda script, nao preenche log, nao edita arquivo de execucao — decisao/arquitetura apenas.
- IA executa: tool calls, git add/commit/push, escrita de logs de execucao, regeneracao de indices (**vetorial sob demanda** — o watchdog de CI e dono do frescor fora da janela de PR, G6), auditoria FDV-EXEC, atualizacao documental.
- reforço DIVIDA: a IA é responsável por registrar dívida de forma audível (log E3 + ledger patch-debt.json + trailer `Debt: [id]` no commit) — dívida nunca é silenciosa (FDV-PATCH §DIVIDA_EXPLICITA / casa única do pipeline: `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 2).
- reforco: a IA e responsavel pelo frescor dos indices (incl. vetorial) conforme `LILA-DEV/INDICES.md` §5 — verifica por conteudo/`fileHash`; a obrigacao recorrente de regen local foi removida pelo G6 (REANC-L4) — nao depende de acao humana.

---

## 8. TRUST_BOUNDARIES (política de fronteiras de confiança — FRAME-CONTRATOS-DE-FRONTEIRA-20260922)

Casa ÚNICA da política de fronteiras de confiança — os FDVs apontam para este protocolo (blocos TRANSVERSAL_PROTOCOL) e nunca re-encodam. Decisão deliberada 2026-09-22 (F4 do frame).

Régua (3 regras — verbatim da decisão):
- defesa obrigatória onde a entrada é não-confiável;
- fallback proibido onde há garantia dupla verificável;
- garantia afirmada sem prova = tipo honesto + dívida registrada (D1/D6), nunca silêncio.

Fronteiras classificadas:

| Fronteira | Confiança | Defesa obrigatória |
|---|---|---|
| Payload do LLM (tool calls / `arguments`) | não-confiável | tipagem honesta (`arguments?: string`) + normalização explícita ÚNICA no dispatch (`ausente/"" ⇒ "{}"`); edge omitido é silencioso — warning ao modelo proibido nesse edge (pagamento: PATCH-20260922-001) |
| Bundler / interop ESM↔CJS (módulos externos) | não-confiável | tipagem interop honesta (`{ default?: unknown }`) + validação estrutural da API usada na fronteira do módulo; fallback sem validação proibido; sem braço válido = degradação controlada declarada, nunca TypeError latente (pagamento: PATCH-20260922-002) |
| Banco legado (linhas/colunas do Postgres) | não-confiável | validação por schema (zod) / redaction / allowlist existentes; nunca confiar no shape declarado |
| Rede/JSON externo (respostas de API) | não-confiável | parse com try/catch + validação de forma; erro nunca propaga cru ao modelo/usuário |

Garantia dupla verificável (ex.: default notNull no DDL + tipo do schema; tipo do pacote + build ESM conferido por sonda registrada) ⇒ o fallback é MORTO e sai com lastro (padrão REPARO-POS-BUMP-20260922 §3). Toda deliberação que afirme forma de runtime exige sonda registrada antes do veredito (lição de processo FRAME-CONTRATOS-DE-FRONTEIRA-20260922).


---

**FIM DO PROTOCOLO-TRANSVERSAL.md v1.6**

## Comandos em batch = PARALELO (2026-09-06)
No harness do Cline, comandos da mesma chamada podem executar em paralelo. Sequência obrigatória: comandos dependentes em CHAMADAS SEPARADAS (git commit/push, leitura após escrita).

<!-- 6-checks EVENTO-REMOCAO-LILA-DOCS-MCP-20260915 (veredito próprio, nada herdado): C1 integridade OK — revogação da norma cobre toda menção viva; fósseis preservados (E-INV-13) | C2 coesão OK — bump v1.4 alinhado ao evento deliberado e aos bumps dos FDVs no mesmo commit | C3 coerência OK — revogação explícita do REGISTRO-ADOCAO-MCP-2026-08-27; sem zumbi canonizado | C4 contradições OK — nenhuma norma remanescente exige o componente removido | C5 outdatedness OK — âncoras revalidadas no tree 2026-09-15 | C6 complexidade OK — executável sem inferência -->
