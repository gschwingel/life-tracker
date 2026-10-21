# ESTADO-ATUAL — life-tracker

atualizado_em: 2026-10-20
camada: PROJETO (substitui grafo.json + snapshots + KF — ver PROTOCOLO-LOCAL §3.2)
regra: este arquivo é o **único** lastro de estado vigente. Sessão que altera comportamento reescreve aqui e atualiza `atualizado_em`.

## 1. O QUE EXISTE HOJE (comportamento observável)

Uma tela única ("Hoje — AAAA-MM-DD") com cinco blocos: **Peso (kg)**, **Treino** (checkbox),
**Cardio** (tipo bike/esteira/corrida + minutos + km + RPE 1-10), **Estudo** (checkbox) e
**Aporte (R$)**. Ao abrir, o app carrega o que já existe para o dia de hoje; o botão **Salvar**
grava (upsert) e mostra "Salvo ✓" por 2 s.

- **Drawer "Histórico — 7 dias"**: `<aside class="drawer">` à direita da tela em FLEX com `<main>`
  (~280 px, fixo no desktop) listando hoje + os 6 dias anteriores, mais recente primeiro, data em
  DD/MM/YYYY e chips resumidos (peso `82,4 kg` ou `—`, `treino ✓/·`, cardio `bike 30min` ou `—`,
  `estudo ✓/·`, aporte `R$ X` ou `—`); dia sem registro mostra `— sem registro —`. Em viewport ≤720 px
  vira gaveta oculta atrás do botão **Histórico**, com `.overlay` e **Fechar**.
- **Edição de dia passado** (DEC-012/DEC-013): clicar num dia carrega o formulário com os mesmos três
  SELECTs, parametrizados pelo dia; o cabeçalho vira "Editando DD/MM/YYYY" e aparece **Voltar para hoje**.
  Salvar com `diaEditando != hoje` abre modal custom ("Salvar alterações em DD/MM/YYYY?" [Confirmar]
  [Cancelar]) antes de escrever; salvar o dia de hoje segue o fluxo de FR-02 sem popup.
- Trocar de dia recarrega o formulário do banco: o que não foi salvo é descartado.
- Dia de referência: `new Date().toLocaleDateString('en-CA')` → `YYYY-MM-DD` **local** (`src/App.tsx:5`).
- Sem gráficos, sem rota/roteador, sem autenticação, sem sincronização, sem exportação/importação.
- Dias fora da janela de 7 dias não são navegáveis pela UI (ver §5).

## 2. MODELO DE DADOS (autoridade: `SCHEMA` em `src/db/database.ts`)

| Tabela | Chave de unicidade | Campos | Uso hoje |
|---|---|---|---|
| `daily_logs` | `UNIQUE (dia, domain)` | `id, dia, domain, value, notes, created_at` | peso / treino / estudo (EAV: `domain` + `value`) |
| `cardio_logs` | `UNIQUE (dia)` | `id, dia, tipo, minutos, distancia_km, intensidade, notes, created_at` | 1 cardio por dia |
| `invest_transactions` | — | `id, data, tipo, ticker, valor, quantidade, notes, created_at` | só `tipo='aporte'`, 1 por dia (delete + insert) |
| `portfolio_positions` | `UNIQUE (ticker)` | `id, ticker, quantidade, preco_medio, atualizado_em` | **sem uso** (tabela morta hoje) |

Leitura/escrita sempre via `db.prepare(...)` / `db.run(sql, params)` (sql.js), nunca SQL concatenado.

## 3. PERSISTÊNCIA

`getDb()` (singleton) → `loadDbBytes()` (IndexedDB `life-tracker` / store `sqlite` / chave `main`)
→ `new SQL.Database(bytes)` → `db.run(SCHEMA)`. Depois de qualquer escrita, `persist()` agenda
(debounce 300 ms) `saveDbBytes(db.export())`. **Não há outro caminho de gravação.**

## 4. RISCOS ABERTOS (fatos, não decisões)

1. **Sem migração de schema.** `SCHEMA` só tem `CREATE TABLE IF NOT EXISTS`: em base já existente
   uma coluna nova/alterada **não é aplicada**. Mudança de schema exige migração idempotente
   explícita + decisão registrada (classe ESTRUTURAL).
2. **Janela de perda no `persist()`.** O debounce de 300 ms não é aguardado; fechar/recarregar a
   aba imediatamente após "Salvo ✓" pode descartar o último write (nenhum flush em `beforeunload`).
3. **Sem backup/export.** Os dados vivem só no IndexedDB do navegador: limpar dados do site =
   perda total. Não há decisão registrada sobre export/import (potencial P1 se o dono pedir).
4. **`portfolio_positions` sem uso** — schema antecipa carteira de investimentos que não existe na UI.
5. **Sem testes e sem lint.** Único gate automático do projeto: `tsc --noEmit` + `vite build`.
6. **`node_modules` rastreado no git** (10.637 arquivos). Correção (`git rm -r --cached node_modules`)
   pendente de decisão do dono — mexe no índice do repositório publicado.
7. **PWA `autoUpdate`**: cliente com aba aberta recebe versão nova no próximo ciclo; sem aviso ao
   usuário. Mudança de comportamento de dados + update de SW = risco de mistura de versões.
8. **Dependência de ferramenta não declarada.** `scripts/kf-compiler.cjs` e
   `scripts/gerar-manifest-esqueleto.cjs` exigem `js-yaml`, que **não está** em `package.json` nem em
   `node_modules`. O bootstrap rodou com instalação fora do repo (`NODE_PATH` → `%TEMP%\lila-deps`);
   declarar como `devDependency` é decisão do dono (DEC-011).
9. **Manifest gerado carrega identidade alheia.** O gerador herdado escreve o título
   `AI-PROJECT-MANIFEST — Lila C137` e a seção derivada 3 lê `backend/src` (inexistente aqui) — por
   isso `docs/manifest-fonte.yaml` só usa seções `CURADA`. Corrigir o gerador é decisão do dono
   (não se edita script herdado sem `DEC-NNN`).
10. **Espelho de planejamento sem ledger populado.** `LILA-DEV/planejamento/decisoes-ledger.json`
    está `[]`; as decisões retroativas vivem no FR `FR-BOOTSTRAP-20261020` e nos snapshots.

## 5. PENDÊNCIAS DE DECISÃO (não são backlog da IA)

- Exportar/importar a base (backup local) — sim/não e em que formato.
- Destino de `portfolio_positions` (implementar carteira ou remover tabela).
- Política de migração para bases já instaladas (hoje: inexistente).
- Versionar ou não `node_modules` (ver §4.6).
- Restante do escopo pós-14-dias: o dono furou a regra de sessão dos 14 dias de captura pura **apenas**
  para o frame do drawer/edição (DEC-012 corrigida por DEC-013); o que vinha depois dos 14 dias segue
  sem decisão de produto.

Formato de parada para qualquer item acima: **P1 — AMBIGUIDADE NÃO COBERTA** (bloco `P1-DEV` do `.clinerules`).

## 6. CAMADA DE PLANEJAMENTO — espelho retroativo (DEC-009, 2026-10-20)

Existe agora, em modo **espelho do as-built** (não autoridade):

| Artefato | Caminho | Lastro |
|---|---|---|
| Fonte de KFs | `LILA-DEV/kf-fonte.yaml` | 6 `kfs_padrao` (framework) + 4 `kfs_produto` observados no draft |
| KFs compilados | `LILA-DEV/kfs/` (10 arquivos) | `node scripts/kf-compiler.cjs` — G1-G4 verdes, `--check` fresco |
| Grafo | `LILA-DEV/planejamento/grafo.json` | 10 KF (4 produto 🟢, 6 padrão 🔴) + SP-01 🟢 + FR-01..FR-03 🟢 |
| Sprint | `LILA-DEV/planejamento/snapshots/sprints/SP-01.md` | draft as-built, 3 frames |
| Frames | `LILA-DEV/planejamento/snapshots/frames/FR-01..FR-03.md` | carga do dia / gravação do dia / superfície PWA |
| Decisões retroativas | `LILA-DEV/planejamento/migracao/frs-retroativos/FR-BOOTSTRAP-20261020.md` | D1-D7 (técnica/comportamento, `TOMADA_POR: humano`) |
| Contratos | `LILA-DEV/execucao/contratos-afetados.json` | `database.ts`, `idb.ts`, `snapshots/**` = PATCH inelegível |
| Manifest | `docs/AI-PROJECT-MANIFEST.md` (gerado) + `docs/manifest-fonte.yaml` (fonte) | não autoritativo (DEC-010) |

Precedência: **este arquivo vence** qualquer divergência do espelho. Toda mudança de comportamento
atualiza primeiro `PROJETO/` e depois recompila/atualiza o espelho, nunca o contrário.
