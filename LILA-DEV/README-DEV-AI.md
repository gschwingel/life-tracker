# LILA-DEV — Sistema FDV de Governança, Planejamento e Execução

> **ADAPTAÇÃO LOCAL (2026-10-20 — ADAPTACAO-LOCAL-001):** este documento é **referência herdada** do
> framework original (monorepo com grafo/KF/MCP/CI), **não** regra viva deste repo. A camada vigente é
> `LILA-DEV/PROJETO/` — ver `PROJETO/PROTOCOLO-LOCAL.md` §2 (suspenso) e §4 (o que continua valendo).
> Ordem de leitura vigente: bloco `IA_ENTRY_ANCHORING` do `.clinerules` (v2.0-LOCAL).

> Documento canônico compresso para consumo exclusivo por IA.
> Compressão semântica dos 4 FDVs (1489 linhas → ~400 linhas). Zero expansão inferencial.
> Hierarquia de autoridade: FDV-PLAN v7.1 → FDV-DEV → FDV-EXEC (FDV-ZERO foi absorvido pelo FDV-PLAN e removido da superfície ativa em 2026-09-19 — sentença G5; não é processo vivo).
> CONVENCAO DE CITACAO KF (B5, 2026-09-14): em documentos vivos, citacao de `KF-XX` numerico =
> referencia HISTORICA de proveniencia (keyframe do modelo cronologico, congelado em
> `LILA-DEV/historico/keyframes/`); o ESTADO vigente se le em `LILA-DEV/kfs/` pelo slug do KF-area
> (ex.: KF-CHAT, KF-RITUAIS-PAINEL). Citacao numerica como estado vigente e proibida.
>
> **PADRÃO CANONICAL (2026-09-13 — Deliberate Event "KF como Posicionamento e Estado"):** toda FDV/protocolo existe em duas camadas — fonte pt-BR em `LILA-DEV/Canonical/` (leitura humana, FONTE da decisão, conteúdo verbatim) e derivado na raiz em inglês técnico denso (Governor-Dense, cabeçalho `DERIVED_FROM`); canônica prevalece, sempre (regra: `LILA-DEV/Canonical/PROTOCOLO-CANONICAL.md`). Modelo KF-área: KF = projeção de estado por área, compilada mecanicamente (nunca editada à mão); SP/FR = log imutável de execução e provenance; decisões entram exclusivamente pelo registro no FR (FDV-PLAN v7.1 §2). KF-Padrão: entradas default no kf-fonte.yaml que projetos novos herdam (modelo normativo per FDV-PLAN v7.1 §4 — kf-fonte.yaml e compilador chegam na fase de reorganização de estado; modelo, não arquivo existente). Porta do processo de frames: FDV-PLAN v7.1 (canônica + derivado).
> Ordem de leitura do agente (PLAN/ACT): ver bloco `ANCORAGEM_ENTRADA_IA` em `LILA-DEV/FDV-DEV.md` (PLAN) e `LILA-DEV/FDV-EXEC.md` (ACT) — este documento é o item 4 da ordem. O `.clinerules` é o dispatcher que roteia para o FDV correspondente (PATCH → FDV-PATCH.md; ESTRUTURAL-PLAN → FDV-DEV.md; ESTRUTURAL-ACT → FDV-EXEC.md). Blocos transversais replicados (LASTRO, FRESCOR, ANTI_TRAVAMENTO, INSTRUCAO_ATIVACAO, ECONOMIA_CONTEXTO, NEVER_DO, MODO 100% IA) vivem em `LILA-DEV/PROTOCOLO-TRANSVERSAL.md` — os FDVs apontam, não re-encodam.

---

## 0. VISÃO GERAL DO MÉTODO

### Problema resolvido
Desenvolver software com IA sem conhecimento técnico, garantindo que zero decisão de negócio fique ambígua ou inferida pela IA. O método decompõe o produto em camadas de comportamento observável, cristaliza decisões humanas antes da implementação, e executa com fidelidade máxima ao plano.

### Filosofia central
- **Rastreabilidade total:** toda afirmação sobre o sistema tem origem rastreável em declaração explícita do humano ou snapshot
- **Fricção deliberada:** velocidade não é critério — completude de decisão é o único critério de avanço
- **Proibição de inferência:** IA nunca completa, expande ou interpreta regras de negócio não declaradas
- **Memória explícita:** o estado do projeto é exclusivamente o que está nos snapshots e no grafo.json lidos nesta sessão

### Cadeia de outputs (fluxo entre fases)
```
Fase 0 (FDV-PLAN v7.1 — absorveu o FDV-ZERO, removido em 2026-09-19)
  Output: Prompts de Ancoragem validados
  ↓ (consumido por)

Fase 1 (FDV-PLAN)
  Output: Snapshots (KF, Sprint, Frame) + grafo.json atualizado
  ↓ (consumido por)

Fase 2 PLAN (FDV-DEV)
  Output: Sinal canônico de encerramento do PLAN
  ↓ (autoriza)

Fase 2 ACT (FDV-EXEC)
  Output: Código implementado + log de execução + commit
```

### Glossário de termos canônicos (usados em todo o documento)
- **KF (Keyframe):** nó raiz da decomposição. Unidade de infraestrutura — KFs separados quando output de um é pré-requisito para outros
- **Sprint:** agrupamento de frames que compartilham objeto de estado ou dependência de execução direta
- **Frame:** unidade atômica de execução. Pode ser Frame de Negócio (exige decisão humana) ou Frame Técnico (delegação à IA)
- **Snapshot:** documento canônico que registra decisões de negócio, comportamento esperado, arquivos produzidos/consumidos, testes e checks de um nó
- **grafo.json:** estado canônico do projeto — nós, dependências, estados (🟢🟡🟣🔴 — régua canônica com ação por estado na seção 3)
- **Prompt de Ancoragem:** documento que acopla a Fase 0 à Fase 1 — carrega escopo validado e pré-condições
- **Sinal Canônico de Encerramento:** documento que acopla a Fase 2 PLAN à Fase 2 ACT — autoriza execução
- **P1:** ambiguidade não coberta por snapshot ou plano. Bloqueia execução.
- **P1-Light:** P1 resolúvel localmente na Fase 2 sem retorno ao planejamento (frame isolado, sem filhos, sem dependentes)
- **Override:** desvio explícito de FDV superior autorizado pelo humano com frase canônica
- **Contratos Exportados:** assinaturas de funções produzidas por um frame e consumidas por frames dependentes

---

## 1. IDENTIDADE DO SISTEMA

| FDV | Fase | Executor | Output único |
|-----|------|----------|-------------|
| FDV-PLAN v7.1 (absorveu o FDV-ZERO, removido em 2026-09-19) | Fase 0 — Orientação e Preparação | Lila C137 + humano | Prompts de Ancoragem validados (6 checks FDV-E) |
| FDV-PLAN | Fase 1 — Planejamento | Orquestrador de Planejamento | Snapshots + grafo.json atualizado |
| FDV-DEV | Fase 2 PLAN — Orquestração | Orquestrador de Execução (modo PLAN) | Sinal canônico de encerramento do PLAN |
| FDV-EXEC | Fase 2 ACT — Execução | Executor agentic (modo ACT) | Código implementado + log + commit |

**Regra fundamental:** Nenhum FDV inferior viola regras de superior. Conflito = prevalece o de maior precedência. FDV-DEV e FDV-EXEC não se comunicam diretamente — o sinal canônico do FDV-DEV autoriza o FDV-EXEC.

---

## 2. FLUXO COMPLETO — MAPA (a norma vive nos FDVs)

> **Reduzido em 2026-09-20 (sentença D3, Lote 1):** as descrições de fase 2.1–2.5 re-encodavam os FDVs de modo. Este capítulo agora é **mapa + pointers**; a norma está nos FDVs (fonte canônica em `LILA-DEV/Canonical/`, derivado de leitura em `LILA-DEV/`).

| Fase | Papel | Norma (leia) | Output |
|---|---|---|---|
| 0 — Orientação | preparação e ancoragem do trabalho | `LILA-DEV/FDV-PLAN.md` | prompts de ancoragem validados |
| 1 — Planejamento | decomposição (KF-área → sprint → frame), snapshots e grafo | `LILA-DEV/FDV-PLAN.md` §1–§5 | snapshots + `grafo.json` |
| 2 PLAN — Cobertura | verificação de cobertura e sinal canônico que autoriza a execução | `LILA-DEV/FDV-DEV.md` (+ `.clinerules`) | sinal `PLAN ENCERRADO` |
| 2 ACT — Execução | implementação fiel, validação, commit, log e auditoria | `LILA-DEV/FDV-EXEC.md` | código + log de execução |
| Patch | correção incremental sem frame | `LILA-DEV/FDV-PATCH.md` | mudança + log curto |

Blocos transversais (lastro de localização, pipeline de frescor, anti-travamento, instrução de ativação, economia de contexto, proibições, execução 100% IA): `LILA-DEV/PROTOCOLO-TRANSVERSAL.md` e `LILA-DEV/PROTOCOLO-INDICES.md`. Roteamento de modo do agente: `.clinerules`.

---

## 3. GRAFO DE ESTADO

**Arquivo:** `LILA-DEV/planejamento/grafo.json`

**Estrutura:**
```json
{
  "projeto": "[nome]",
  "versao": "YYYY-MM-DD",
  "keyframes": [
    { "id": "KF-XX", "estado": "🟢|🟡|🟣|🔴", "depende_de": [], "desbloqueia": ["SP-XX"], "snapshot": "caminho" }
  ],
  "sprints": [
    { "id": "SP-XX", "pai": "KF-XX", "estado": "...", "depende_de": [], "desbloqueia": ["FR-XX"], "snapshot": "caminho" }
  ],
  "frames": [
    { "id": "FR-XX", "pai": "SP-XX", "estado": "...", "depende_de": [], "desbloqueia": [], "snapshot": "caminho", "reancoragem": "caminho" }
  ]
}
```

**Estados (régua canônica do farol — evento deliberado 2026-09-06; cada cor = ação da IA sobre o nó):**
- 🟢 = executado e finalizado — validação fechada, com rastro (log de execução, referências resolvendo, código vivo). A IA consome os artefatos; não re-executa.
- 🟡 = planejado e pronto para execução — planejamento completo e confirmado. A IA pode executar.
- 🔴 = não aprovado para execução — sem planejamento completo, planejamento com erros, ou dependente de nó não 🟢 (default de nó novo). A IA planeja ou aguarda a cadeia.
- 🟣 = desbloqueado para revalidação — dependência concluiu; revalidar antes de 🟡 (estado transitório de evento, não de repouso).

Regra de interrupção de sessão: interrompida com planejamento completo → 🟡; sem planejamento completo → 🔴.

**Versionamento:**
- Decisão de negócio alterada → novo snapshot do nó + filhos 🟣 (revalidar, não recriar).
- Bug técnico corrigido → log atualizado, snapshot inalterado.
- Nó subdividido → snapshot pai arquivado (-ARQUIVADO), novos snapshots filhos.
- Sprint/KF com planejamento confirmado (estabilizado em Fase 1) → grafo recebe nova versão (R1, R2...).

---

## 4. ESTRUTURA LILA-DEV (CANÔNICA)

```
/LILA-DEV                          ← 1 tipo de documento = 1 caminho (ORGANIZAÇÃO-LILA-DEV 2026-09-06)
  README-DEV-AI.md                 ← este arquivo + mapa de navegação
  FDV-PLAN.md | FDV-DEV.md | FDV-EXEC.md | FDV-PATCH.md
  PROTOCOLO-TRANSVERSAL.md         ← blocos transversais únicos (última versão; versões antigas em /historico/versoes)
  PROTOCOLO-INDICES.md | INDICES.md
  /planejamento                    ← PLANO: estrutura e futuro (nada de registro executado aqui)
    grafo.json                     ← estado canônico do grafo (nós + snapshot refs)
    decisoes-ledger.json           ← ledger de decisões/comportamentos
    /prompts                       ← inputs deliberados de sessão (ASCII kebab, sem emoji)
    /snapshots                     ← snapshots canônicos do grafo (nós)
      /keyframes/ | /sprints/ | /frames/ | /patches/ | /baselines/ | /artefatos/ | /fase-0/
    /discovery                     ← discoveries (KF-discovery)
    /hardening                     ← programa de hardening (registry + protocols + waves)
  /execucao                        ← REGISTRO: o que foi executado
    /logs                          ← canal ATIVO de logs de execução (0-15 dias; escrita direta no worktree do frame)
    /logs-arquivo                  ← retenção > 15 dias (endpoint único; fora do canal ativo)
    /auditorias                    ← revisões executadas (AK/AS e remediacoes)
    /evidencias                    ← evidências de camada/pipeline (PR reviews)
    patch-debt.json
  /historico                       ← arquivo morto de versões e artefatos antigos (nomes preservados)
    /versoes | /manifesto | /snapshots-antigos | /documentos
  /validacao                       ← evidências JSON de gate-lote (untracked; vinculadas ao SHA)
```

**Retenção de logs (política E-INV-13/prune-historico):** `execucao/logs/` mantém 0-15 dias (detalhe completo). Com > 15 dias, o log sai do canal ativo para `execucao/logs-arquivo/` — endpoint único de arquivamento. Scanners do canal ativo (frescor, allowlist MCP) navegam apenas `execucao/logs/`.

**Convenções de nome:** diretórios sempre lowercase; arquivos em ASCII (kebab, sem emoji/acentos) fora de `historico/` e `execucao/logs-arquivo/` (grandfather de nomes históricos). Guard: `scripts/validar-paths-case.cjs` (CI pr-gate).

---

### 4.X — ÁREAS TÁTICAS (particionamento documental)

**Conceito:** as áreas que particionam a aplicação (contagem MEDIDA no bloco gerado abaixo). Fonte única: `grafo.json` (campo `area_tatica` nos nós de planejamento — KFs/sprints/frames).

**Estado atual de uma área:** projeção KF-area compilada mecanicamente (`LILA-DEV/kfs/` via `kf-compiler.cjs` + `kf-fonte.yaml`). Não existe prose de área curada à mão — as Area Docs foram removidas (LIMPEZA-AREA-DOCS-2026-08-29).

<!-- GENERATED: readme-tactical-areas DO NOT EDIT — source: LILA-DEV/planejamento/grafo.json (campo area_tatica) + LILA-DEV/kf-fonte.yaml (congelamento.areas_historicas) (gerador: scripts/gerar-docs-derivados.cjs) -->
**Áreas táticas — MEDIDO no regen.** Fontes: `LILA-DEV/planejamento/grafo.json` (campo `area_tatica` dos nós de planejamento) + `LILA-DEV/kf-fonte.yaml` (`congelamento.areas_historicas`).

**Ativas (17):** KF-ORQUESTRACAO-AGENTES-EXTERNOS, artista, auth, backend, chat, contexto, especialistas, ferramentas, github, homeostase, infra, modelos, painel-direito, ritual, softcontext, testes, ui-ux.
**Históricas (2):** abandonados, lila-embrionaria.
**Total: 19** (17 ativas + 2 históricas).

Particionamento KF-area sobre este mapa (`LILA-DEV/kf-fonte.yaml`): **16 slugs** (6 framework + 10 projeto) — projeção compilada em `LILA-DEV/kfs/` (`kf-compiler.cjs`).

**Anomalia (reportada, não corrigida aqui):** 1 valor(es) de `area_tatica` fora do espaço kebab-case de área: `KF-ORQUESTRACAO-AGENTES-EXTERNOS`.
<!-- /GENERATED: readme-tactical-areas -->

**G7 (2026-09-20):** o artefato `mapa-areas-taticas.json`, os scripts `manter-mapa-areas.cjs`/`injetar-area-tatica.cjs`/`auditar-areas-taticas.cjs` e os gates (E1.5, pr-gate "Areas taticas", gates-grafo, gate `auditar_areas` da fachada `lila-auditoria-mcp`) foram REMOVIDOS da superfície ativa (sentença G7/O2, Lote 1; git preserva o rastro). O campo `area_tatica` no grafo e a projeção KF-area sobrevivem.

---

## 5. INVARIANTES TRANSVERSAIS (TODAS AS FASES)

<!-- E-INV-DEV:GERADO:BEGIN (fonte: src/prompts/Canonical/FDV-E.md §4 [normative schema] — NAO EDITAR A MAO) -->
**E-INV-01 — Canonical Truth**
- **Obligation:** Truth must always be traceable to an FDV, snapshot, or frozen canonical document.
- **Trigger:** Any assertion of truth or canonical status.
- **Exception:** None.
- **Violation:** Ungrounded assertion constitutes epistemological damage; output invalidated.

**E-INV-02 — No Structural Implicit Inference**
- **Prohibition:** Deduce undeclared objectives, fill scope gaps, or invent systems, goals, or tasks without an explicit request.
- **Trigger:** Absence of explicit request for the inferred element.
- **Exception:** Explicit delegation per §7.
- **Violation:** If FDV mechanism altered, additionally engages E-INV-07 (structural drift). Output invalidated.

**E-INV-03 — No Consolidation Without Grounding**
- **Obligation:** Any consolidation of information must have verifiable grounding in FDVs or concrete data; otherwise generate a contextualization discussion or block.
- **Trigger:** Consolidation of information.
- **Exception:** None.
- **Violation:** Epistemological damage; production of false, contradictory, or ungrounded information.

**E-INV-04 — No Skipping of Methodological Steps**
- **Prohibition:** Skip rules and rituals defined in FDVs, Snapshots, or Canonical Documents.
- **Trigger:** Absence of explicit override.
- **Exception:** Explicit local override per §7.
- **Violation:** Methodological damage; non-auditable execution with loss of traceability.

**E-INV-05 — No Unjustified Confidence**
- **Obligation:** Express uncertainty when the knowledge base is insufficient or the risk is high.
- **Trigger:** Insufficient knowledge base or high risk.
- **Exception:** None.
- **Violation:** Operational damage; well-presented wrong decisions.

**E-INV-06 — No Excessive Fluency**
- **Prohibition:** Fluency that compromises precision, traceability, or adherence to FDVs.
- **Trigger:** Tradeoff between fluency and precision/traceability/FDV adherence.
- **Exception:** None.
- **Violation:** Epistemological damage; masked failures.

**E-INV-07 — No Structural Drift**
- **Prohibition:** Altering the scope, objectives, or mechanisms of FDVs, Snapshots, or Canonical Documents on one's own initiative.
- **Trigger:** Any unilateral change.
- **Exception:** Deliberate event ritual (§6).
- **Violation:** Systematic violation of usage policies; high-risk use without human review.

**E-INV-08 — No Well-Presented Wrong Decisions**
- **Prohibition:** Form masking epistemological or methodological failure.
- **Trigger:** Well-presented output containing error.
- **Exception:** None.
- **Violation:** Misleading or manipulative content; security damage.

**E-INV-09 — Critical Friction**
- **Obligation:** Maintain deliberate friction to ensure epistemological security, even if this reduces speed or convenience.
- **Prohibition:** Reducing friction for speed or convenience at the cost of epistemological security.
- **Trigger:** Friction would serve epistemological security but reduce speed or convenience.
- **Exception:** None.
- **Violation:** Epistemological damage; increased LLM-Brain symptom rate.

**E-INV-10 — Blocking by Risk**
- **Authority:** Block any action or output that represents an epistemological, methodological, operational, or security risk, as per the damage categories in §2.
- **Trigger:** Risk detected per §2 damage categories.
- **Exception:** Explicit local override (§7).
- **Violation of authority:** Epistemological security failure; unmitigated LLM-Brain damage.

**E-INV-11 — Human-in-the-Loop**
- **Obligation:** Every structural decision or action requires explicit human validation or prior approval from the human.
- **Trigger:** Structural decision or action.
- **Exception:** Explicit delegation per §7.
- **Violation:** Additionally engages E-INV-02 (implicit inference) if scope invented; loss of human agency.

**E-INV-12 — Auditability**
- **Obligation:** All actions and decisions must be traceable and auditable through the FDVs and canonical documents in force.
- **Trigger:** Any action or decision.
- **Exception:** None.
- **Violation:** Non-auditable outputs; risk of failure in regulatory or judicial investigations.

**E-INV-13 — Prohibition of Implicit Memory**
- **Prohibition:** Using undocumented inference, current conversation content, or unrecorded human memory as a valid basis for any structural decision.
- **Obligation:** All information used as a basis for governance or structural decisions must be external, traceable, and auditable.
- **Trigger:** Structural decision or governance action.
- **Exception:** None.
- **Violation:** Epistemological damage; loss of traceability and auditability.

**E-INV-14 — Primacy of External Memory**
- **Obligation:** In any conflict or ambiguity between current chat content and a Snapshot or Canonical Document, the Snapshot or Canonical Document always prevails.
- **Prohibition:** The current chat may not overwrite validated external memory.
- **Trigger:** Conflict or ambiguity between chat content and external document.
- **Exception:** Explicit deliberate event altering the external document (§6).
- **Violation:** Structural drift; loss of canonical truth authority; additionally engages E-INV-07 if scope altered on own initiative.

**E-INV-15 — Functional Friction Classification**
- **Obligation:** Execution friction (distinct from the epistemological resistance of E-INV-09) is classified per instance, not per task category, by a single criterion: does its execution require a judgment that materially affects decision quality? If yes — cognitive, preserved. If no — mechanical, tending to zero.
- **Boundary conditions:** Examples (copying files, calling APIs, generating reports; reviewing hypotheses, approving risks, interpreting evidence) are illustrative, never taxonomic — any instance may be reclassified by context. Classification under this invariant does not weaken E-INV-09, E-INV-10, or the objective hierarchy in §3.
- **Trigger:** Friction classification decision.
- **Exception:** None.
- **Violation:** Misclassification weakens epistemological security; improper automation engages E-INV-17(f).

**E-INV-16 — Conservative Default on Friction Classification**
- **Obligation:** Doubt or disagreement about classification resolves as cognitive — the loss of decision quality and human agency is potentially irreversible; the loss of efficiency is not.
- **Obligation (continuity):** Doubt about whether context has materially changed likewise resolves as cognitive until reclassification is confirmed.
- **Trigger:** Ambiguity or disagreement about friction classification.
- **Exception:** None.
- **Violation:** Loss of decision quality and human agency; improper automation.

**E-INV-17 — Friction Classification Authority and Lifecycle**
- **(a) Authority:** Lila proposes; the human confirms. Lila does not unilaterally classify as mechanical for the purpose of elimination or automation, except within an explicit standing delegation in force per (g).
- **(b) Proposal trigger:** Lila proposes a classification when the human requests automation, workflow orchestration, elimination of a step, or explicit friction review. Outside a standing delegation per (g), Lila does not proactively mine the session for mechanical-friction candidates on every turn.
- **(c) Persistence:** Confirmed classifications of repetitive tasks persist until material change of context or explicit human revocation.
- **(d) Invalidation:** On material change of context, the prior classification is not authoritative; Lila must reopen proposal before elimination or automation continues. If it is unclear whether the change is material, E-INV-16 applies.
- **(e) Execution bound:** Elimination or automation of mechanical friction executes only under a currently valid confirmed classification, or under a valid standing delegation per (g).
- **(f) Violation:** Unilateral elimination or automation without a valid confirmed mechanical classification, or without a valid standing-delegation basis per (g), violates this invariant and E-INV-11. If the act also invents undeclared objectives, fills scope gaps, or invents systems/goals/tasks without explicit request, it additionally violates E-INV-02. Unilateral alteration of mechanisms or scope of FDVs, Snapshots, or Canonical Documents additionally engages E-INV-07.
- **(g) Standing-delegation exception:** Within an explicit standing delegation in force — a human grant of technical decision authority (e.g. R-DELEGACAO-DECISAO-TECNICA, 2026-10-11) — repetitive, low-risk mechanical friction may be classified and eliminated without per-instance confirmation, provided that: (i) the instance is mechanical under E-INV-15 and low-risk under §7.3; (ii) the act is inside the delegated scope; (iii) each classification is logged auditably — instance, criterion, date, delegation reference, action taken — per E-INV-12; (iv) the human may revoke the delegation or any individual classification at any time, with immediate effect; (v) doubt about scope, risk or materiality resolves as cognitive (E-INV-16) — the exception never widens by inference. The exception does not extend to cognitive friction, to structural decisions (E-INV-11), or to anything outside the delegated scope.
- **Trigger:** Friction classification lifecycle event (proposal, confirmation, persistence, invalidation, execution).
- **Exception:** Standing delegation in force per (g); None otherwise.
- **Violation:** Multiple invariant engagement as specified in (f); all applicable violations must be declared.

**E-INV-18 — No Advancement Under Ambiguity**
- **Obligation:** Signal ambiguity clearly, block structural advancement (planning, task creation, decisions), ask specific clarification questions, and resume only after the ambiguity is completely eliminated by a clear human answer.
- **Prohibition:** Proceeding with any structural advancement while ambiguity persists.
- **Trigger:** Any request with multiple relevant interpretations.
- **Exception:** None.
- **Violation:** Implicit inference; severe epistemological security violation. Additionally engages E-INV-02.
<!-- E-INV-DEV:GERADO:END -->

| ID | Invariante | Efeito |
|----|-----------|--------|
| DEV-INV-01 | Contratos exportados obrigatórios | Cruza ARQUIVOS PRODUZIDOS com ARQUIVOS CONSUMIDOS dos dependentes. Declara assinatura ou "Nenhum disponível". |
| DEV-INV-02 | Documentação afetada obrigatória | Sinal de encerramento declara documentação afetada (docs/, índices, scripts). Campo ausente = sinal incompleto. |
| DEV-INV-03 | Ação imediata, zero anúncio | Proibido anunciar intenção de ação. Toda ação é executada como tool call única, sem preâmbulo. Anúncio sem tool call = travamento. |
| DEV-INV-04 | Área tática obrigatória | Sinal de encerramento sem campo "Área tática" = incompleto. ACT não autorizado. Área extraída do grafo.json (campo area_tatica). |

---

## 6. ECONOMIA DE CONTEXTO

- Histórico (`execucao/logs/`) = rastro de auditoria, não lastro de decisão (E-INV-13). A cauda `meta_*` do Manifest existiu até a v2.x e está **extinta desde a v3.0** (2026-09-08, estado puro por construção; necropsia em `LILA-DEV/historico/manifesto/`) — o Manifest não emite, não parseia nem poda tail. O histórico vivo reside em `git`, `LILA-DEV/planejamento/grafo.json`, `LILA-DEV/planejamento/decisoes-ledger.json` e `LILA-DEV/historico/`. Degradação por tempo dos logs: 0–15d no canal ativo (`execucao/logs/`); >15d arquivado em `execucao/logs-arquivo/`. Aplicada por `scripts/prune-historico.cjs`; automação semanal (1x/semana — semana ISO, fim do primeiro FDV-EXEC, FDV-EXEC E5, EVENTO-DELIBERADO-PRUNE-SEMANAL-20261001) por `scripts/prune-semanal.cjs` — dry-run + aprovação humana, nunca aplica sem aprovação. Com cadência semanal, um log pode residir até ~21d no canal ativo no pior caso.
- Não reproduzir conteúdo de arquivos lidos — referenciar por caminho canônico.
- Não explicar protocolo durante execução.
- Não gerar texto introdutório/conclusivo/confirmação de recebimento.
- Respostas intermediárias mínimas: o que está sendo verificado, nada mais.
- Outputs longos permitidos: sinal de encerramento do PLAN, relatório P1, log de execução, snapshots.
- Proibido parafrasear, confirmar recebimento, planejar em voz alta ou anunciar o próximo passo — a tool call é executada imediatamente.

---

## 7. PROIBIÇÕES TRANSVERSAIS (O QUE NENHUM FDV FAZ)

- Emite sinal de encerramento com cobertura incompleta.
- Interpreta ou expande regras de negócio não declaradas.
- Resolve P1 por inferência.
- Usa contexto de sessões anteriores como base de decisão.
- Gera texto explicativo sobre o próprio protocolo durante execução.
- Permite que o ACT inicie sem sinal canônico completo (FDV-DEV).
- Gera código para situação não coberta pelo plano (FDV-EXEC).
- Toma decisão de negócio (FDV-EXEC).
- Commita com verificação documental pendente (FDV-EXEC).
- Anuncia ação sem executar a tool call correspondente (todas as fases).
- Gera texto intermediário que substitui a execução de uma tool call (todas as fases).
- Aguarda instrução quando a ação já está determinada pelo protocolo (todas as fases).

---

**FIM DO README-DEV-AI — Compressão semântica v2.6 dos 4 FDVs (FDV-PLAN v6.1, FDV-DEV v6.2, FDV-EXEC v3.10, FDV-PATCH v1.4) + PROTOCOLO-TRANSVERSAL v1.0**
<!-- 6-checks: C1 integridade OK (legenda, S5, regra de sessão, glossário, Etapa 4) | C2 coesão OK (régua única = mesma do FDV-PLAN v6.2) | C3 coerência OK (alinhado a FDV-PLAN REGUA_ESTADOS e MCP-GRAFO) | C4 contradições OK (nenhuma semântica antiga remanescente na legenda) | C5 desatualização OK (line refs L44/L168/L175/L192/L444-449 conferidas 2026-09-06) | C6 complexidade OK — 2026-09-06 -->
