# LILA-DEV — Gestão dos Índices

> **ADAPTAÇÃO LOCAL (2026-10-20 — ADAPTACAO-LOCAL-001):** neste repo **não existe nenhum índice** —
> não há `grafo.json`, `indice-rastreabilidade.json` nem `indice-vetorial.*`, e não há corpus que os
> justifique (`src/` = 6 arquivos). Localização é `grep` nativo. Este documento e
> `PROTOCOLO-INDICES.md` são **referência herdada**; a camada viva é `LILA-DEV/PROJETO/`
> (`PROTOCOLO-LOCAL.md` §2 lista a suspensão e §5 o gatilho de reativação: ~100 arquivos em `src/`).

> **BANNER RECONCILIADO (REANC-L4 / I6 — 2026-09-20):** o banner antigo ("os índices refletem a árvore pré-reestruturação; a regeneração estrutural acontece na fase de reorganização de estado") está **obsoleto** e foi removido: a reorganização de estado foi executada (B1–B6, encerrada em 2026-09-14) e os índices vivos cobrem a árvore atual. O mesmo lote (I1/I3/I4) tirou da superfície ativa o índice reverso, a matriz de cobertura e o inventário de testes — o inventário abaixo lista apenas o que existe. Referência normativa do processo: FDV-PLAN v7.1 (LILA-DEV/Canonical/FDV-PLAN.md + derivado na raiz).

> Documento canônico de gestão dos índices do repo. Define propriedade, regeneração, validação e classificação de fricção.

---

## 1. INVENTÁRIO

| Índice | Caminho | Script gerador |
|--------|---------|----------------|
| Localização literal | — (grep nativo do agente) | — (o índice reverso + `buscar-simbolo.cjs` morreram em REANC-L4 / I1 — proibido reintroduzir equivalente sem tese de valor explícita) |
| Rastreabilidade | `LILA-DEV/indice-rastreabilidade.json` | `scripts/gerar-indice-rastreabilidade.cjs` |
| Vetorial (embeddings) | `indice-vetorial.json` (sidecar) + `indice-vetorial.bin` (Float32Array, Git LFS) | `scripts/gerar-indice-vetorial.cjs` (incremental via fileHash) + `scripts/verificar-frescor-indice-vetorial.cjs` (frescor fileHash por chunk) |
| Grafo (fonte, não gerado) | `LILA-DEV/planejamento/grafo.json` + `LILA-DEV/planejamento/grafo-historico.json` (histórico congelado KF-01 a KF-16) | manual |
| — (orquestrador smart) | — (regenera apenas índices stale) | `scripts/gerar-indice-smart.cjs` |
| — (ledger de dívidas de patch) | `LILA-DEV/execucao/patch-debt.json` | `scripts/verificar-divida-patch.cjs` (verifica pagamento pendente) |
| — (registry de contratos por área) | `LILA-DEV/execucao/contratos-afetados.json` | `scripts/verificar-contratos.cjs` (cruzamento mecânico de elegibilidade do PATCH — F1, EVENTO-DELIBERADO-PATCH-FUSIVEIS-20260922) |
| — (ledger de síntese pendente) | `LILA-DEV/execucao/sintese-pendente.json` + `sintese-config.json` (thresholds) | `scripts/sintese-ledger.cjs` (registro/consumo) + `scripts/verificar-sintese.cjs` (pendências por área vs threshold — F2, mesmo evento) |

## 2. COBERTURA

- **Vetorial:** `src/**`, `backend/src/**` (`.ts`/`.tsx`) + `docs/**/*.md`. FORA: `LILA-DEV/`, `scripts/`, `Agents/`, `Templates/`. Embeddings `openai/text-embedding-3-small` (1536 dims), incremental via `fileHash`.
- **Registros 2026-09-24 (PROMPT A — modo expandido, FDV-Tooluse v6):** novos artefatos cobertos pelos índices — serviços `backend/src/services/tool-budget.ts` + `backend/src/services/tool-mode-flip-log.ts` e testes `backend/src/__tests__/tool-budget.test.ts` + `tool-mode-flip-log.test.ts` (vetorial, via regen) e tabela `tool_mode_flip_log` (schema — migração idempotente em `backend/src/scripts/migrate.ts`; flip-log canônico do `tool_mode`, consumido READ-ONLY pelo decisor JEV).
- **Registros 2026-09-29 (Ciclo 2 / sessão B — `structural/hardening-ciclo2-sessao-b`):** (a) infraestrutura ENTREGUE registrada no MANIFEST §13 pela fonte curada (`docs/manifest-fonte.yaml`): `infra/backup/` + workflow `postgres-backup-diario.yml` (PULL+VERIFY) com linhagem HB-043 (#910/#911/#912) e evidência datada — o serviço vive DENTRO do Railway e não tem superfície de código coberta pelo vetorial (mesma situação de `infra/pgproxy/`, declarada, não coberta); (b) gates novos sob `scripts/` — `verificar-ausencia-prompt-dist.cjs` (C25-18) e `probe-f9-exposicao.cjs` (C25-27/F9), ambos com teste próprio em `scripts/__tests__/` (cobertos por `test:scripts`; fora da cobertura vetorial, que cobre `src/**`, `backend/src/**` e `docs/**`); (c) evidências datadas em `LILA-DEV/validacao/` (`c25-18-dist-gate-evidence-20260929.json`, `f9-probes-20260929.json`, `f8-restore-f12a-20260929.json`) — diretório de evidência, fora da cobertura dos índices por desenho (mesma natureza do `gate-lote-evidence`).
- **Rastreabilidade:** grafo + ledgers + logs de execução → navegação KF → código → teste/evidência. Verificação por **conteúdo** (regeneração offline em tmp + comparação, ignorando só `geradoEm`) em `verificar-frescor-indices.cjs`.
- **Mortos em REANC-L4 (2026-09-20):** o índice reverso (I1 — localização literal passa ao grep nativo), a matriz de cobertura (I3 — Opção B; a rastreabilidade preservada responde à navegação) e o inventário de testes (I4 — descoberta de testes volta ao mecanismo nativo do runner; a evidência de execução vive em `docs/TESTING.md`).
- **Mortos na aposentadoria do CHANGELOG (FRAME-CHANGELOG-APOSENTADORIA-20261006, evento deliberado Igor 2026-10-05):** o sistema do índice mecânico de CHANGELOG inteiro — `gerar-changelog.cjs` (+`.ps1`), `verificar-changelog.cjs`, `changelog-scaffold.cjs`, `lib/changelog-block-core.cjs`, `lib/changelog-registries.cjs` e o artefato `CHANGELOG.md` (escritor único + 3 gates + scaffolder; custo medido: 55% das falhas de pr-gate no dreno 2026-10-01→05, sem consumidor de runtime). Justificativa e herança: `LILA-DEV/planejamento/decisoes-ledger.json` (registro de aposentadoria).

## 3. REGENERAÇÃO

**Comando único:** `npm run indices`

Ordem: rastreabilidade → **vetorial**. (REANC-L4 / I1+I3+I4: os geradores do reverso, da matriz e do inventário de testes saíram da superfície ativa — a ordem não os inclui mais.)

**Comando seletivo (fluxo PATCH — D3):** `npm run indices:smart` regenera apenas índices stale (staleness por **conteúdo** em `verificar-frescor-indices.cjs` + `verificar-frescor-indice-vetorial.cjs` por `fileHash`), todos independentes em paralelo (rastreabilidade), vetorial incremental. `npm run indices` completo permanece para CI e fluxo estrutural. `npm run indices:related` (`--related`) verifica apenas índices cujos diretórios intersectam os arquivos alterados do patch.

**Pipeline de frescor/vetorial — CASA ÚNICA:** `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 2 (Opção A estrutural | Opção B patch | frescor por `fileHash` | integridade sidecar↔bin | testes do vetorial | regeneração seletiva) — sentença G3. Este documento **aponta** para a casa; não re-encoda.

**Testes escopados no patch (D4):** `vitest run --changed` (test:related) roda apenas testes de arquivos alterados + dependentes; `npm run test:scripts` roda no patch apenas se o vetorial foi tocado (`indices:related`). Full suite (`test:ci`/`test:all`) permanece gate no CI.

**Responsabilidade (REANC-L4 / G6 — 2026-09-20):** o frescor do **vetorial** fora da janela de PR é responsabilidade do **watchdog de CI** (`.github/workflows/indices-vetorial-watchdog.yml`, único workflow do vetorial — sentença O3/G6), e a regeneração local deixou de ser obrigação recorrente do agente (a classe de dívida "vetorial não regenerado" morreu por construção). O agente regenera sob demanda — antes de **consumir** um índice cujo conteúdo mudou — e verifica o estado no fechamento do fluxo (`indices:check` + `indices:status` por conteúdo).

**Detecção de staleness — `npm run indices:check`:** por **CONTEÚDO**.
`node scripts/verificar-frescor-indices.cjs` regenera cada índice em diretório temporário (`INDICES_OUT_DIR`) e compara com o versionado, ignorando apenas metadados voláteis (`geradoEm`/`generatedAt`); exit 1 = algum stale/ausente. O vetorial tem verificador próprio por `fileHash` por chunk (`verificar-frescor-indice-vetorial.cjs`). **I5 (REANC-L4, 2026-09-20):** o critério de mtime×git foi substituído por conteúdo — índices commitados com conteúdo idêntico são frescos mesmo que um commit posterior toque os diretórios cobertos.

**Política de timestamp dos gerados (2026-10-06 — fim do churn na drenagem):** regen com conteúdo-útil idêntico ao commitado **não reescreve o arquivo** — `geradoEm`/`gerado:` congelam na última mudança real de conteúdo e regen dupla em árvore imutável produz diff zero (skip-write em `gerar-indice-rastreabilidade.cjs` e `gerar-manifest-esqueleto.cjs`; helpers em `scripts/lib/conteudo-estavel.cjs`). Exceção canônica: `generatedAt` do `indice-vetorial.json` é relógio semântico (consumidor: `buscar-vetorial.cjs` — idade e arquivos rastreados mudados desde a construção) e continua reescrito a cada regen.

| Símbolo | Significado | Ação |
|---------|-------------|------|
| 🟢 | Índice fresco | Nenhuma |
| 🟡 | Índice desatualizado | `npm run indices` |
| ⚪ | Índice ausente | `npm run indices` |
| ⚫ | git indisponível | Verificação manual |

**Protocolo do agente:** antes de consumir qualquer índice, o agente roda `npm run indices:check`. Se exit 1, roda `npm run indices` e prossegue. Se o verificador não estiver disponível (sem git), o agente regenera diretamente — custo <1s, elimina risco de stale.

**Consumo (REANC-L4 / I1 — 2026-09-20):** a localização literal de símbolo/path é feita pelo **grep nativo do agente** sobre a árvore real. O índice reverso fragmentado e o `buscar-simbolo.cjs` saíram da superfície ativa; reintroduzir um equivalente exige tese de valor explícita e comparação com as ferramentas nativas.

**Falha de script:** reporta erro, opera sem o índice ou regenera o restante (degradação graciosa).

**Índice vetorial — Opção A (bloqueante):** diferentemente da degradação graciosa acima, o vetorial é **obrigatório** no encerramento de toda execução. Sem `OPENROUTER_API_KEY` ou com falha de embedding, o encerramento bloqueia e reporta (casa única do pipeline: `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 2 — sentença G3). Regeneração incremental re-embedda apenas chunks com `fileHash` alterado; os demais são reutilizados do `.bin` anterior.

**Bootstrap de worktree (ambiente local — `2026-09-19-bootstrap-worktree-env`):** `.env` é **untracked**, logo toda worktree nova nasce sem `OPENROUTER_API_KEY` e os scripts de embedding falham com erro críptico — causa raiz de 8 de 20 dívidas do ledger. Antes de rodar qualquer script vetorial numa worktree nova, execute:

```
npm run worktree:bootstrap -- <path-da-worktree-destino>
```

(`node scripts/bootstrap-worktree.cjs <path> [--from=<origem>]`.) O script copia da worktree principal os arquivos untracked essenciais declarados na constante do topo do próprio script (`.env` obrigatório; `backend/.env` opcional), é idempotente (re-executar sobrescreve sem apagar nada) e nunca toca arquivo rastreado. A classe de dívida "regen vetorial local sem chave" morre por construção: bootstrap + regeneração vetorial 100% CI (sentença G6 do núcleo governança).

## 4. VALIDAÇÃO

`node scripts/validar-integridade.cjs`

Valida (5 checagens):
1. Grafo legível
2. Snapshots existem
3. Logs ↔ nós
4. Conflito de ownership
5. Integridade do índice vetorial (sidecar ↔ `.bin`: `chunks.length × 1536 × 4 == size` + offsets monotônicos) + integridade estrutural do AI-PROJECT-MANIFEST

Exit code: 1 se erros 🔴

> REANC-L4 / I1 (2026-09-20): as checagens 5 (índice reverso fragmentado) e 6 (presença de `buscar-simbolo.cjs`) saíram com a superfície do reverso.

Dessincronia = aviso 🟡 (rede de segurança pós-fato). A linha de frente é o protocolo de regeneração do §3.

## 5. CLASSIFICAÇÃO DE FRICÇÃO (E-INV-15/16/17 — FDV-E real)

Regeneração e frescor dos índices (incluindo o **vetorial**) são classificados como **fricção mecânica** (não exigem julgamento que afete qualidade de decisão — tendem a zero).

- **Proponente:** Lila (E-INV-17a)
- **Confirmação humana:** 2026-08-03 — "Vamos automatizar o frescor, deve estar no próprio fluxo de gestão dos índices. Você será responsável por eles."
- **Persistência:** válida até mudança material de contexto ou revogação explícita do humano (E-INV-17c)
- **Execução (REANC-L4 / G6 — 2026-09-20):** o frescor do vetorial roda no **watchdog de CI** (cron) e a regeneração local passa a ser **sob demanda** (antes de consumir índice stale). A execução automatizada pelo agente permanece autorizada enquanto a classificação mecânica for válida — o que mudou é a obrigação recorrente, que morreu.

## 6. OBSERVAÇÃO DE CONSISTÊNCIA

Resolvido (2026-08-13): LILA-DEV adota espelho da FDV-E (`E-INV-01..18`, mesma numeração/identificação) + prefixo `DEV-INV` para invariantes exclusivas de LILA-DEV. `README-DEV-AI.md` §5 agora lista E-INV-14..18 com a semântica correta da FDV-E e os antigos E-INV-14/15/16/17 de LILA-DEV migraram para DEV-INV-01..04. Fonte canônica da numeração E-INV: `backend/src/prompts/governor/FDV-E.md` / `backend/src/prompts/executor/FDV-E.md` (paths retargetados em 2026-09-24 — os prompts derivados migraram para o backend no FR-P20-PROMPT-SERVER #734; Canonical segue em `src/prompts/Canonical/`). **Atualização 2026-09-19 (sentença G1):** o espelho textual nos FDVs de modo foi descontinuado — a cópia única operacional vive no bloco `E-INV-DEV` do `.clinerules` e os FDVs apontam (a numeração canônica continua a da FDV-E).

<!-- 6-checks (REANC-L4 2026-09-20): C1 ok (inventário/cobertura/regeneração/validação cobrem só os índices vivos) C2 ok (I1/I3/I4 mortos declarados com fundamento; I5 conteúdo; I6 banner reconciliado) C3 ok (subordinado a PROTOCOLO-INDICES §3 — regra de consumo declarada lá) C4 ok (sem contradição: G6 remove a obrigação de regen local sem remover a classificação de fricção) C5 ok (estado real medido por tool: reverso/matriz/testes ausentes, rastreabilidade + vetorial presentes) C6 ok -->
