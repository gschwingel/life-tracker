# KF-UI-HOJE — KF-AREA (compiled projection; never hand-edited)

meta:
  gerado_em: 2026-10-20T17:01:40-03:00
  commit_fonte: e0b1ee7b606927cf29ae850370c0a2976a2e4d9f
  compilador: kf-compiler v1.3
  hash_fonte: e473f08340c62d3f236e9358517c79e7526dde0af4f193b304fced1e81aee4c7
  fonte: LILA-DEV/kf-fonte.yaml
  origem: projeto
  eixo: componente

## ESCOPO
  Single screen "Hoje" (`src/App.tsx`): five blocks (peso, treino, cardio, estudo, aporte), load of the current day on mount, save button with upsert and a 2s "Salvo ✓" confirmation. No routing, no history, no date navigation, no charts, no auth.

## FRONTEIRAS
  Styling lives here only as it serves this screen; schema belongs to KF-MODELO-DADOS and storage bytes to KF-PERSISTENCIA-LOCAL. A second screen/route requires a new decision.

## DECISOES VIGENTES
  (none)

## COMPORTAMENTOS ESPERADOS
- FR-BOOTSTRAP-20261020.D2 | origem: projeto | tomada_por: humano | validacao: observavel
  A superficie do app e uma unica tela "Hoje" com cinco blocos (peso, treino, cardio, estudo, aporte) e um botao Salvar; nao existe rota, historico, navegacao de data, grafico ou autenticacao.
- FR-BOOTSTRAP-20261020.D3 | origem: projeto | tomada_por: humano | validacao: observavel
  Cardio grava no maximo um registro por dia e somente quando ao menos um de minutos, km ou RPE e preenchido; os tres campos vazios nao criam nem alteram a linha do dia.
- FR-BOOTSTRAP-20261020.D4 | origem: projeto | tomada_por: humano | validacao: observavel
  Aporte do dia e sempre reescrito por delete + insert em invest_transactions (tipo='aporte'); aporte vazio remove o aporte do dia.

## DECISOES DEPRECADAS (tombstone)
  (none)

## MAPA DE ARQUIVOS
  LILA-DEV/planejamento/migracao/frs-retroativos/FR-BOOTSTRAP-20261020.md | registros: 3 | vigentes: 3 | deprecadas: 0 | planejamentos: 0
