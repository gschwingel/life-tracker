# ESTADO-ATUAL — life-tracker

atualizado_em: 2026-10-20
camada: PROJETO (substitui grafo.json + snapshots + KF — ver PROTOCOLO-LOCAL §3.2)
regra: este arquivo é o **único** lastro de estado vigente. Sessão que altera comportamento reescreve aqui e atualiza `atualizado_em`.

## 1. O QUE EXISTE HOJE (comportamento observável)

Três telas por **estado React** (`pagina: 'home' | 'saude' | 'dopamina'`, default `'home'`, sem
roteador e sem URL):

- **Home** — título `life-tracker` (sem data) e 5 botões: **Saúde** e **Gestão de dopamina** (ativos,
  navegam por estado) + **Finanças**, **Aviação**, **Self improvement** (`disabled`, `opacity 0.5`,
  `title="em breve"`, sem clique, sem rota).
- **Saúde** — header `Saúde — AAAA-MM-DD` (ou `Editando DD/MM/YYYY` com **Voltar para hoje**), botões
  **Histórico** e **Voltar** (volta para a home) e três blocos: **Peso (kg)**, **Treino** (checkbox) e
  **Cardio** — Esteira/Corrida/Bicicleta (o valor gravado de Bicicleta continua `'bike'`; legado aparece
  como Bicicleta) com **Distância (km)** → `distancia_km`, **Tempo (min)** → `minutos` e
  **Intensidade percebida** → `intensidade`. **Salvar** grava (upsert) e mostra "Salvo ✓" por 2 s.
- **Gestão de dopamina** (DEC-015) — header `Gestão de dopamina — AAAA-MM-DD` (ou `Editando DD/MM/YYYY`
  + **Voltar para hoje**), botões **Histórico** e **Voltar**, blocos **Instagram** e **Sono**:
  - Instagram: toggle **Não abri hoje** (default desmarcado). Marcado → abstinência `1` e o dropdown de
    horas fica `disabled` e grava vazio (trava anti-contradição). Desmarcado → dropdown `—` /
    `< 1 hora` / `1 a 3 horas` / `> 3 horas`, gravando `0` / `1` / `2` (ou nada, se `—`).
  - Sono: horas dormidas em campo decimal pt-BR (`num()` com vírgula, placeholder `7,5`), gravadas em
    `sono_horas` limitadas a 0–24; vazio = sem registro.
- **Estudo e aporte saíram da UI** (DEC-014): nenhuma leitura ou escrita toca nessas linhas; os dados
  existentes em `daily_logs` (`domain='estudo'`) e `invest_transactions` (`tipo='aporte'`) permanecem.
- **Histórico dropdown por página** (DEC-014/DEC-015, substitui o drawer de FR-04): o botão
  **Histórico** — presente na Saúde e na Gestão de dopamina, cada uma com o seu — abre
  `.historico-painel` sobre `.overlay` nas duas plataformas (desktop e ≤720 px), com **Fechar**; lista
  hoje + os 6 dias anteriores, descendente, data em DD/MM/YYYY. Chips: na Saúde peso/treino/cardio; na
  Dopamina `IG ✓/·` + `<1h`/`1–3h`/`>3h`/`—` + `sono Xh`/`—`. Dia sem registro da página mostra
  `— sem registro —`. Fora das duas páginas não há histórico.
- **Edição de dia passado** (DEC-012/DEC-013): clicar na linha carrega o formulário com os SELECTs
  parametrizados pelo dia, fecha o painel e o header vira "Editando DD/MM/YYYY"; salvar com
  `diaEditando != hoje` abre modal custom ("Salvar alterações em DD/MM/YYYY?" [Confirmar] [Cancelar]).
- **Reset do dia** (DEC-014/DEC-015): botão **Zerar** em cada linha do histórico; modal "Zerar
  DD/MM/YYYY?" [Confirmar] [Cancelar]; confirmar roda `DELETE` em `daily_logs` (todos os `domain` do dia,
  incluindo os da Dopamina e os legados) + `cardio_logs` + `invest_transactions`, chama `persist()`,
  recarrega a lista e zera o formulário se aquele dia estiver exibido. Vale para hoje e para dia
  passado. Sem `DROP`/`ALTER` (DEC-006).
- Trocar de dia recarrega o formulário do banco: o que não foi salvo é descartado.
- Refresh volta para a home (a página não é persistida — comportamento esperado, sem roteador).
- Dia de referência: `new Date().toLocaleDateString('en-CA')` → `YYYY-MM-DD` **local** (`today()` em `src/db/repo.ts:35`).
- **Camada de dados em `src/db/repo.ts`** (SP-05/FR-09, 2026-10-20): `lerDia`, `gravar(db, dia, pagina, form)`,
  `resetDia`, `carregarUltimos7Dias` + puros `today`, `num`, `formatarDia`, `listarUltimos7Dias`,
  `temRegistroSaude`, `temRegistroDopamina`, `chipCardio`, `rotuloHoras`. `App.tsx` mantém só estado + JSX +
  modal/dropdown; o SQL parametrizado e o `persist()` vivem no repo.
- Sem gráficos, sem roteador, sem autenticação, sem sincronização, sem exportação/importação.
- Dias fora da janela de 7 dias não são navegáveis pela UI (ver §5).

## 2. MODELO DE DADOS (autoridade: `SCHEMA` em `src/db/database.ts`)

| Tabela | Chave de unicidade | Campos | Uso hoje |
|---|---|---|---|
| `daily_logs` | `UNIQUE (dia, domain)` | `id, dia, domain, value, notes, created_at` | EAV por dia: `peso`, `treino` (Saúde); `dopamina_insta_abst` 1/0, `dopamina_insta_horas` 0/1/2 (`<1h`/`1–3h`/`>3h`), `sono_horas` float 0–24 (Dopamina, DEC-015); `estudo` legado, fora da UI |
| `cardio_logs` | `UNIQUE (dia)` | `id, dia, tipo, minutos, distancia_km, intensidade, notes, created_at` | 1 cardio por dia (tipo `esteira`/`corrida`/`bike`) |
| `invest_transactions` | — | `id, data, tipo, ticker, valor, quantidade, notes, created_at` | `tipo='aporte'` legado, fora da UI; só `DELETE` no reset do dia (DEC-014) |
| `portfolio_positions` | `UNIQUE (ticker)` | `id, ticker, quantidade, preco_medio, atualizado_em` | **sem uso** (tabela morta hoje) |

Leitura/escrita sempre via `db.prepare(...)` / `db.run(sql, params)` (sql.js), nunca SQL concatenado —
hoje concentrado em `src/db/repo.ts` (único arquivo com SQL, além do DDL).

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
11. **Fronteira `App.tsx` × `repo.ts` (SP-05/FR-09, 2026-10-20).** `src/App.tsx` = 248 linhas
    (estado + JSX + modal/dropdown, zero `db.prepare`/`db.run`) e `src/db/repo.ts` = 179 linhas
    (2 SELECTs, 2 upserts, 3 `DELETE` de reset, 1 `DELETE` por domain, `persist()`). Os 8 statements
    são idênticos, na mesma ordem, aos que viviam no `App.tsx` (move puro, nenhum statement novo);
    `SCHEMA` intocado (DEC-006).

## 5. PENDÊNCIAS DE DECISÃO (não são backlog da IA)

- Exportar/importar a base (backup local) — sim/não e em que formato.
- Destino de `portfolio_positions` (implementar carteira ou remover tabela).
- Política de migração para bases já instaladas (hoje: inexistente).
- Versionar ou não `node_modules` (ver §4.6).
- Restante do escopo pós-14-dias: o dono furou a regra de sessão dos 14 dias de captura pura **apenas**
  para o frame do drawer/edição (DEC-012 corrigida por DEC-013); o que vinha depois dos 14 dias segue
  sem decisão de produto.
- Destino do dado legado de **estudo** (`daily_logs.domain='estudo'`) e **aporte**
  (`invest_transactions`): fora da UI desde DEC-014, permanecem no banco sem leitura/escrita fora do
  reset — manter, reexpor ou remover é decisão do dono.
- Sugestões avançadas da Dopamina **guardadas** em SP-04, sem decisão: streak sem abrir, deitar/acordar
  + qualidade do sono, notificação tornando o preenchimento compulsório.

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
