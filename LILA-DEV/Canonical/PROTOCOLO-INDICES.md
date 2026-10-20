# LILA-DEV — Protocolo de Consumo de Índices

> Documento canônico de protocolo obrigatório para qualquer agente que consomir índices. Define como cada índice deve ser lido e quais scripts usar. Violação do protocolo gera travamento por truncamento de contexto — o comportamento a eliminar.

---

## 1. REGRA 1 — Localização literal pelo grep nativo (índice reverso MORTO)

O índice reverso fragmentado (`indice-reverso/`), seu gerador (`gerar-indice-reverso.cjs`), o lookup (`buscar-simbolo.cjs`) e o módulo de critério (`lib/fragmentacao.cjs`) **saíram da superfície ativa** — sentença **I1** executada no `FRAME-REANC-L4-OPS-20260920` (2026-09-20, REANC-L4). O agente localiza símbolo/path com o **grep nativo** sobre a árvore real do repo.

**Proibido reintroduzir um equivalente** (índice de símbolos, catálogo de paths, lookup próprio) **sem tese de valor explícita** e comparação com as ferramentas nativas. O histórico do artefato está preservado no git (constraint TCC).

## 2. REGRA 2 — Pipeline de frescor antes de consumir

**Regime vigente (EVENTO-FRAME-GATES-ROTINAS-DIARIAS-20261015, Igor 2026-10-15):** o frescor dos índices é dos WATCHDOGS DIÁRIOS — `indices-textual-watchdog.yml` (05:20 UTC; textuais + MANIFEST + pares registrados) e `indices-vetorial-watchdog.yml` (04:30 UTC; `.bin`/`.json` vetorial). Ambos entregam por PR com required checks; nenhum gate por-PR reprova staleness. Nenhuma rodada de regen é devida no encerramento de patch/frame.

Consumo em sessão:

- Consumir direto — staleness de até ~24h é aceito por desenho (D1 do frame; docs de localização são coarse).
- **Detecção sob demanda (gatilho C6):** se o índice consumido estiver stale e atrapalhar (`npm run indices:check`, exit 1), regenere (`npm run indices` ou o gerador único do artefato) e embarque NO commit de conteúdo — verificação barata, sem gate, sem dívida.

O pipeline cobre **todos** os índices do inventário `LILA-DEV/INDICES.md`, incluindo o **índice vetorial** (`indice-vetorial.json` + `.bin`) — **frescor por `fileHash`**, verificado por chunk. **Este capítulo (REGRA 2) é a CASA ÚNICA do pipeline de frescor/vetorial (sentença G3)** — os demais documentos apontam para cá e nunca re-encodam.

**G6 — a regeneração local NÃO é obrigação recorrente do agente (REANC-L4, 2026-09-20):** o frescor do vetorial fora da janela de PR é responsabilidade do **watchdog de CI** (`.github/workflows/indices-vetorial-watchdog.yml` — único workflow do vetorial, absorveu o cron diário e o `cron-vetorial-fixup.cjs` na sentença O3). A obrigação bloqueante de regen local no encerramento estrutural e a classe de dívida "vetorial não regenerado" (`patch-debt.json`) **morreram**: falha de embedding por ambiente (key ausente/API) deixa de gerar dívida. O agente regenera **sob demanda** — quando precisa consumir um índice cujo conteúdo mudou — e o fechamento **verifica** o frescor (por conteúdo/`fileHash`).

**Regeneração seletiva — `npm run indices:smart` (fluxo PATCH):** exit 1 não exige `npm run indices` completo — `node scripts/gerar-indice-smart.cjs` roda apenas os geradores dos índices stale (rastreabilidade; vetorial incremental). `npm run indices:related` (verificar-frescor-indices.cjs `--related`) verifica apenas índices cujos diretórios cobertos intersectam os arquivos alterados do patch. O comando `npm run indices` completo permanece para CI e fluxo estrutural.

**Frescor do vetorial (fileHash, não mtime):** `npm run indices:check` executa `verificar-frescor-indice-vetorial.cjs` após o verificador genérico — compara o `fileHash` de cada chunk no sidecar com o hash atual do arquivo fonte. Exit 1 = conteúdo mudou → `npm run indices:vetorial` (incremental re-embedda só os alterados).

**Integridade sidecar↔bin:** `npm run indices:status` (validar-integridade.cjs) valida `chunks.length × 1536 × 4 == .bin.size` e offsets monotônicos — `.bin` truncado/corrompido = erro 🔴 (fricção cognitiva, não auto-repara).

**Testes do vetorial:** `npm run test:scripts` (node:test) roda 26 testes (cosine, threshold calibrado 0.40, gate recall@5≥83%, chunking, embedding client, gerador incremental, verificador fileHash) — parte de `test:all`/`test:ci`.

**CONVENÇÃO — frescor por CONTEÚDO (I5, REANC-L4 2026-09-20; substitui a convenção de timestamp de 2026-09-04):** a rastreabilidade e o manifest são verificados por **regeneração offline em tmp + comparação de conteúdo** (ignorando só `geradoEm`/`generatedAt`); o vetorial, por **`fileHash` por chunk**. Consequências operacionais:

1. **Fechamento de fluxo**: regenerar os índices vivos (`npm run indices` + `indices:check` + `indices:status`) quando o conteúdo coberto mudou; o CI (`gates-grafo`) regenera e compara **conteúdo** contra o commitado. Desde o G6 (REANC-L4), a regeneração do vetorial fora da janela de PR é do watchdog — o encerramento **verifica**, não regenera por obrigação.
2. **PROIBIDO abrir PR "só de frescor"**: commitar regeneração com conteúdo idêntico para "limpar o stale" cria um novo merge commit que torna o índice stale de novo (loop infinito de PRs). PR de índices só é legítimo quando há **mudança de conteúdo** (arquivos cobertos alterados de fato, ex.: novo código/docs/prompts).
3. Exceção: se o diff de conteúdo da regeneração for **não-vazio** (arquivos cobertos mudaram no merge), o PR de índices é obrigatório no mesmo commit do merge (PR #27/#39/#41 — precedentes).

## 3. REGRA 3 — Consumo seguro por índice

| Índice | Como consumir | Tamanho típico |
|--------|--------------|----------------|
| `LILA-DEV/indice-rastreabilidade.json` | **nunca leitura única** — `grep`/`outline`/paginação (`start_line`/`end_line`) obrigatórios | ver bloco GENERATED medido em `LILA-DEV/PROTOCOLO-INDICES.md` REGRA 3 (fonte: `wc -l -c` a cada regen) |
| `indice-vetorial.json` | `read_file` direto apenas metadados ({version, model, dimensions, generatedAt, chunksLength}); nunca o conteúdo integral (1.3MB+ — paginar/evitar) | sidecar KB |
| `indice-vetorial.bin` | **nunca** `read_file` — binário LFS; consulta só via `node scripts/buscar-vetorial.cjs` | binário |

> **Tamanhos não-normativos (veredito F1, 2026-10-02):** a coluna "Tamanho típico" é ilustrativa e envelhece; a fonte VIVA medida é o bloco GENERATED da REGRA 3 em `LILA-DEV/PROTOCOLO-INDICES.md` (regenerado por `scripts/gerar-docs-derivados.cjs`).

**REANC-L4 / I1+I3+I4 (2026-09-20):** `indice-reverso/*.json` (com `buscar-simbolo.cjs`), LILA-DEV/matriz-cobertura-decisoes.json e LILA-DEV/indice-testes.json **não existem mais** (removidos 2026-09-26 — higiene de morte) — saíram da superfície ativa com seus geradores e seus gates. Localização literal = grep nativo; cobertura = rastreabilidade; descoberta de testes = runner.

**LINHA DE COLIÇÃO (P4):** localização **literal** (grep nativo sobre a árvore — ex-reverso/`buscar-simbolo.cjs`) ≠ `indice-vetorial.json`/`indice-vetorial.bin` + `buscar-vetorial.cjs` (**semântico** por embedding). São conceitos distintos — não confundir; o uso semântico é o único que segue indexado.

**Semântica da integridade do rastreabilidade (AUDITORIA-DOCS-REPO-20261009, N-01 — decisão Igor 2026-10-09, critério declarado: leitura e compreensão de estado por IA — maior qualidade de propriocepção):** por nó, `integridade` = verificabilidade da trilha: 🟢 = snapshot + log E3 existe (quente em `logs/` OU arquivado pelo prune semanal em `logs-arquivo/`); 🟡 = snapshot sem log NENHUM (gap real); 🔴 = sem snapshot (e ⚫ via `estadoEfetivo` para nós deprecated). `logCaminho` carrega o caminho da evidência (prefixo `logs-arquivo/` = armazenamento frio) — substitui o booleano `logExiste`, que reportava 🟡 falso para trilhas arquivadas (150 nós na data do achado) e degradava monotonicamente a cada prune.

Critério: leitura direta (`read_file` integral) SOMENTE se o arquivo tem ≤ 1.000 linhas **E** ≤ 100 KB. Acima de qualquer um dos dois limites: `grep`/`outline`/paginação (`start_line`/`end_line`) ou script de lookup — nunca leitura única. Os tamanhos da tabela acima são ilustrativos e NÃO normativos — a medição VIVA é o bloco GENERATED da REGRA 3 de `LILA-DEV/PROTOCOLO-INDICES.md`.

**Nota explícita de consumo do grafo (INDICES-TESTES 2026-09-02):** `LILA-DEV/planejamento/grafo.json` (~164 KB / ~4.953 linhas — fonte, não gerado) é consumido APENAS via outline/paginação (`start_line`/`end_line`) ou script (`grep` por KF/FR, `lila-grafo-mcp` `read_node`) — **leitura integral proibida** (limite §3: ≤ 1.000 linhas E ≤ 100 KB).

## 4. REGRA 4 — Falha do script de busca semântica

Se `buscar-vetorial.cjs` (único lookup de índice restante) falhar:

1. Reporte o erro.
2. **Não** tente ler o `.bin` nem o sidecar como fallback.
3. Opere sem o dado (o grep nativo cobre localização literal) ou rode `npm run indices:vetorial` para regenerar.
4. Se a falha persistir, abra P1/P2 conforme o protocolo FDV vigente — e o watchdog de CI cobre o frescor fora da janela de PR (G6).

## 5. REGRA 5 — Precedência (a antiga REGRA 5 — expansão do índice reverso — morreu com a superfície no REANC-L4 / I1)

Este protocolo é subordinado a `LILA-DEV/INDICES.md` (documento de gestão canônica dos índices). Em divergência, INDICES.md prevalece.

**Exceção declarada (sentença G3):** a REGRA 2 (pipeline de frescor/vetorial) é a CASA ÚNICA do pipeline — `PROTOCOLO-TRANSVERSAL`, `INDICES.md` e `FDV-PATCH` apontam para ela e nunca re-encodam. A precedência acima vale para o inventário/gestão dos índices, não para este capítulo de pipeline.

**FIM DO PROTOCOLO-INDICES.md**

<!-- 6-checks: C1 ok (REGRA 3 atualizada com o novo índice + nota de consumo do grafo) C2 ok (decisões 1-2-3 refletidas: regra de acesso ao grafo formalizada) C3 ok (coerente com INDICES.md §1/§2 — mesmo schema) C4 ok (tamanhos re-medidos T7C 2026-09-02, sem contradição) C5 ok (medidas reais: 968 linhas/24 KB testes; 4.953 linhas/164 KB grafo) C6 ok — INDICES-TESTES 2026-09-02 -->