# FR-BOOTSTRAP-20261020 — registros retroativos (as-built)

Escopo: bootstrap LILA-DEV (DEC-009/010/011). Cada registro abaixo descreve um comportamento
ou arranjo técnico **observado no rascunho existente** (não é regra nova, não é inferência).
Lastro: leitura direta de `package.json`, `index.html`, `vite.config.mjs`, `src/main.tsx`,
`src/App.tsx`, `src/db/database.ts`, `src/db/idb.ts` em 2026-10-20.

ID: FR-BOOTSTRAP-20261020.D1
DECISAO: Reativar a camada de estado (KF + grafo + snapshots) em modo espelho retroativo do rascunho as-built, mantendo PROJETO/ESTADO-ATUAL.md como estado vigente.
TIPO: tecnica
AREA_TATICA: KF-GOV
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: gate
ESTADO: PRESENTE

ID: FR-BOOTSTRAP-20261020.D2
DECISAO: A superficie do app e uma unica tela "Hoje" com cinco blocos (peso, treino, cardio, estudo, aporte) e um botao Salvar; nao existe rota, historico, navegacao de data, grafico ou autenticacao.
TIPO: comportamento
AREA_TATICA: KF-UI-HOJE
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: observavel
ESTADO: PRESENTE

ID: FR-BOOTSTRAP-20261020.D3
DECISAO: Cardio grava no maximo um registro por dia e somente quando ao menos um de minutos, km ou RPE e preenchido; os tres campos vazios nao criam nem alteram a linha do dia.
TIPO: comportamento
AREA_TATICA: KF-UI-HOJE
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: observavel
ESTADO: PRESENTE

ID: FR-BOOTSTRAP-20261020.D4
DECISAO: Aporte do dia e sempre reescrito por delete + insert em invest_transactions (tipo='aporte'); aporte vazio remove o aporte do dia.
TIPO: comportamento
AREA_TATICA: KF-UI-HOJE
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: observavel
ESTADO: PRESENTE

ID: FR-BOOTSTRAP-20261020.D5
DECISAO: daily_logs usa modelo EAV com chave unica (dia, domain) e booleano persistido como 1/0; a DDL vive exclusivamente em SCHEMA e nao existe caminho de migracao para base ja instalada.
TIPO: tecnica
AREA_TATICA: KF-MODELO-DADOS
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: gate
ESTADO: PRESENTE

ID: FR-BOOTSTRAP-20261020.D6
DECISAO: Persistencia local unica: sql.js exporta bytes para IndexedDB (life-tracker/sqlite/main) apos debounce de 300 ms; nenhum outro caminho grava a base.
TIPO: tecnica
AREA_TATICA: KF-PERSISTENCIA-LOCAL
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: observavel
ESTADO: PRESENTE

ID: FR-BOOTSTRAP-20261020.D7
DECISAO: Build Vite 6 com vite-plugin-pwa em autoUpdate, manifest e icones 192/512, saida estatica em dist/ publicada na Vercel; gate local e typecheck + validacao de governanca + build.
TIPO: tecnica
AREA_TATICA: KF-PWA-BUILD
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: gate
ESTADO: PRESENTE
