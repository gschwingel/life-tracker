# FDV-PLAN v7.3 — APPROVED — 2026-10-02
Emenda v7.3: RELAÇÃO COM DECISÕES ATIVAS — campo obrigatório no snapshot novo +
consulta obrigatória antes de cristalizar + ponteiro do rascunho incremental
(Evento Deliberado FRAME-LACO-ESTADO-20261002 — decisão Igor, sessão ZCode 2026-10-02)
Emenda v7.2: OUTPUT_LANGUAGE (Evento Deliberado EVENTO-AIFIRST-TEMPLATES-20260929 — decisão Igor, sprint SP-AIFIRST-DEFAULT-20260929 F5)
Emenda v7.1: campo ORIGEM no registro de decisão (requisito do modelo framework-carried,
Deliberate Event "KF como Posicionamento e Estado" — fase de estado)
Deliberate Event: "KF como Posicionamento e Estado" (sessão 2026-09-13)
OUTPUT_LANGUAGE: todo artefato produzido pelo fluxo nasce AI-AI em EN denso conforme docs/AI-IAIA-GRAMMAR.md — snapshots de sprint/frame e demais artefatos do ciclo. Contratos de script permanecem VERBATIM: chaves de cartão de decisão (DECISAO/TIPO/AREA_TATICA/TOMADA_POR/ORIGEM/SUPERSEDE/VALIDACAO), chaves de header de snapshot (**Área tática:** **Tipo:** **Versão:** **Data:** **Status:** — regex do gerador de índice). Comunicação Lila→humano permanece PT. Stock histórico existente não é traduzido (SP-AIFIRST-DEFAULT-20260929 D2).
PRECEDENCE: subordinate_to FDV-Principal FDV-E
SCOPE: entrada de trabalho no sistema, decomposição, alocação, registro de decisões,
compilação de KF-área, gates, discovery. Absorveu o FDV-ZERO (removido da superfície ativa — 2026-09-19, sentença G5).
PADRÃO DOCUMENTAL: este documento segue o PROTOCOLO-CANONICAL (fonte em LILA-DEV/Canonical/).

## 1. UNIDADES DE TRABALHO
- Árvore em 3 níveis: KF-área (projeção de estado, gerada) → SP (unidade de execução) → FR (unidade canônica endereçável)
- Nível de campanha: NÃO EXISTE. Agrupamento cross-área = tag `campanha:` em SPs (metadado de query)
- Classificador frame vs patch: documento é frame/sprint SE E SOMENTE SE contém ao menos
  um registro em DECISÕES ou COMPORTAMENTOS ESPERADOS. Sem isso = prompt de patch (FDV-PATCH), fora da árvore
- Todo SP declara PROTOCOLO_GOVERNANTE = KF-área cujo protocolo rege a atividade
- SP regido por dois protocolos = split obrigatório (sem exceção)

## 2. REGISTRO DE DECISÃO (no FR — única superfície de escrita de decisão)

    DECISÃO: [enunciado]
    TIPO: negócio | técnica | comportamento
    ÁREA_TATICA: [área ÚNICA]
    TOMADA_POR: humano | Lila
    ORIGEM: framework | projeto
    SUPERSEDE: [D-id] | NENHUMA
    VALIDAÇÃO: [teste | gate | observável]

Regras:
- ÁREA_TATICA obrigatória em TODO FR, com ou sem decisões (join key do sistema)
- Granularidade obrigatória: toda decisão/comportamento traçável a exatamente UMA área;
  sem área secundária; span de duas áreas = split do registro na escrita
- Um FR pode conter registros de decisões de múltiplas áreas — cada registro aponta para
  sua área (e portanto para seu KF-área) individualmente
- TIPO negócio → TOMADA_POR: humano (fronteira FDV-Principal, não delegável)
- TIPO técnica/comportamento → delegável per FDV-E §7 (descrever risco → classificar → confirmar)
- IDs cunhados na origem (FR), estáveis entre regenerações
- Supersessão declarada no ato da escrita; propagação (tombstone, recompile) é mecânica
- Comportamentos esperados (B-ids): mesmo ciclo de vida dos D-ids
- Morte de feature: o FR que remove a feature declara a morte (supersessão) das decisões dela
- ORIGEM framework = decisão framework-carried: herda com o install do processo em
  projetos novos; alterá-la exige supersessão declarada preservando a origem histórica
- ORIGEM projeto = decisão project-authored pelo projeto (boot ou vida)
- ORIGEM persiste na compilação: o KF-área exibe a origem de cada decisão nas seções
  VIGENTES e DEPRECADAS

### RELAÇÃO COM DECISÕES ATIVAS (obrigatória na cristalização — Emenda v7.3)

Toda cristalização nova declara sua relação com o estado vigente — é o que impede
que o snapshot novo invalide silenciosamente uma decisão ativa antiga (limite
conhecido do E3.5: contradição não declarada não é detectável). Campo
obrigatório em TODO snapshot novo (frame, sprint e `[ID]-patch.md`), escrito na
linha que abre a seção de decisões:

    Relacao decisoes ativas: sem-contradicao — verificacao: <fonte declarada>
    Relacao decisoes ativas: substitui <ID>[, <ID>...] — deprecacao: <estado>

Regras:
- a determinação EXIGE consulta às decisões ativas da área ANTES de cristalizar:
  unidades ativas da área no grafo + leitura dos canônicos tocados; vetorial
  (`buscar-vetorial`) quando disponível
- `sem-contradicao` carrega a fonte da verificação (leitura direta, grafo, vetorial)
- `substitui` cita IDs no formato do `decisoes-ledger.json` (`unidades[].id`,
  `<NÓ>.U<n>`); a deprecacao correspondente é registrada no fechamento
  (`register_unit` + `deprecate_unit` via lila-grafo-mcp) — o gate do pr-gate
  (`verificar-relacao-decisoes.cjs`) valida existência e status `deprecated`
- relação indeterminável = P1 (fluxo existente) — nunca preencher por inferência
- chave verbatim (âncora de linha) — o gate só reconhece a chave abrindo a linha;
  menção em prosa não conta
- escopo mecânico do gate: snapshots ADICIONADOS no PR (sem retroatividade —
  Modified/Renamed/Copied isentos; estoque histórico intocado)

### RASCUNHO INCREMENTAL DO SNAPSHOT (ponteiro — casa única na 2.2 do TRANSVERSAL)

O rascunho do snapshot de frame/sprint PODE ser escrito e commitado
incrementalmente durante o PLAN (commit por decisão deliberada, na branch da
sessão) — protege a decisão da morte de sessão antes da cristalização. Norma
completa (exceção estreita e seus limites): `PROTOCOLO-TRANSVERSAL.md` §2.2
BATCH_ENCERRAMENTO — proibido re-encodar aqui.

## 3. KF-ÁREA (projeção materializada — nunca editada à mão)
- Nomeado por slug (KF-BACKEND, KF-RITUAIS...), sem numeração
- Seções: meta {gerado_em, commit_fonte, compilador, hash_fonte} | ESCOPO | DECISÕES VIGENTES |
  COMPORTAMENTOS ESPERADOS | DECISÕES DEPRECADAS (tombstone: executor + motivo + origem) | MAPA DE ARQUIVOS
- SEM farol: estado de execução é propriedade de SP/FR; KF-área carrega apenas meta de geração
- Compilado em inglês técnico de alta densidade semântica (especificação de idioma no kf-fonte.yaml)
- Verdade canônica de ESTADO (toda leitura de "o que vale" passa por aqui)
- FR/SP imutáveis = verdade canônica de PROVENANCE (por quê, quando, quem, contexto)

## 4. FONTE DE CURADORIA (kf-fonte.yaml)
- Arquivo único: particionamento, escopos e fronteiras de todos os KFs-área
- Re-corte de particionamento = Deliberate Event leve (single-focus, freeze, 6-checks na fonte)
- Gates por camada (padrão da exceção R-ESCRITA-GATE-6CHECKS): 6-checks na fonte curada;
  gates mecânicos no artefato gerado
- KF-Padrão = entradas default no kf-fonte.yaml + documentado no README-DEV-AI;
  projetos novos nascem com eles; conteúdo definido em fase própria
- Particionamento declarado como curadoria humana, não derivação

## 5. COMPILAÇÃO E GATES
- Compilador: scripts/ na raiz, arquivo trunk, determinístico, não-interativo
- Ordem de construção: compilador validado primeiro contra um KF-Padrão (previsível)
  antes dos KFs de produto
- Gates mecânicos (bloqueio de merge no CI, exaustivos):
  G1 cobertura — todo FR com ÁREA_TATICA válida e única
  G2 supersessão — alvos existem, sem órfãos, sem ciclos
  G3 determinismo — mesma árvore → mesmo KF byte a byte
  G4 frescor — hash_fonte do KF commitado == hash da árvore atual
- Gate semântico (bloqueio): 6-checks FDV-E sobre integridade INTERNA do documento compilado;
  modelo de qualidade, temperatura zero, READ-ONLY (emite veredito, nunca edita conteúdo)
- Fronteira: gate semântico = interno do doc; realidade vs documentação = discovery (§6)
- Trigger do gate semântico: todo compile com mudança de decisões + cron semanal obrigatório;
  veredito de ciclo sem mudanças marcado como no-op
- Veredito versionado junto ao KF: modelo, prompt-hash, checks individuais, pass/fail
- Estados de frescor (COMPUTADOS no momento da leitura/CI, nunca armazenados como campo
  editável): fresco | stale | bloqueado — bloqueado exige ação; única via de correção é a
  montante (FR/SP fonte + recompile); KF não tem via de edição manual, sem exceção

## 6. DISCOVERY (radar, não gate)
- On-demand (humano ou Lila propõe), teto de um ciclo por mês
- Modos:
  M1 realidade ⊃ log — executado sem decisão → FR retroativo com marcador obrigatório de
     DUAS datas: "formalizado retroativamente em [data] sobre comportamento em produção
     desde [commit/data]"
  M2 log ⊃ realidade — decisão zumbi → flaga o par conflitante; direção da correção
     (doc stale vs código driftado) é decisão humana
  M3 contradição não-declarada — varredura assistida por LLM; digest alimenta triage,
     nunca decisão (R-DIGEST-NAO-CANONICO)
- Relatório por ciclo em LILA-DEV/planejamento/discovery/
- Cada achado nasce com destino obrigatório: FR retroativo | supersede retroativo | correção de código
- Garantia honesta: espaço implícito encolhe monotonicamente, nunca zera;
  varredura limpa ≠ ausência de contradição

## 7. MIGRAÇÃO (uma vez, mecânica — R-DADO-GRANULAR-DIFF)
- KF-01..22: congelados como histórico (banner, read-only, não afetam evolução)
- SP/FR existentes: remapeados para KFs-área de trabalho via protocolo-governante + área
  tática; campo PAI no grafo.json; matriz de cobertura e índices regenerados
- Decisões vigentes sem FR-fonte: FR retroativo de migração por KF antigo — extração
  assistida, validação contra o repo, validação humana UM KF POR VEZ
- Material de validação no formato barato de conferir: decisão extraída + citação da
  linha-fonte no KF antigo, um por linha
- FDV-ZERO: removido da superfície ativa (absorvido aqui; histórico preservado no git — sentença G5, 2026-09-19)

<!-- 6-checks (re-run na emenda v7.1): C1 completo (7 seções + campo ORIGEM e suas 3 regras —
todos os pontos da Deliberate Event) | C2 coeso (ORIGEM integrado ao registro, sem seção órfã) |
C3 coerente FDV-Principal/FDV-E e com o modelo framework-carried (origem da decisão ≠ tipo ≠
autoridade de tomada) | C4 sem contradição (ORIGEM ortogonal a TIPO/TOMADA_POR; supersessão
preserva a origem histórica) | C5 reflete capacidades reais (particionamento framework/projeto
já declarado no kf-fonte em curadoria) | C6 gerenciável — 6/6 verde (Lila, 2026-09-13) -->
