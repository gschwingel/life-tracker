# KF-MODELO-DADOS — KF-AREA (compiled projection; never hand-edited)

meta:
  gerado_em: 2026-10-20T17:01:40-03:00
  commit_fonte: e0b1ee7b606927cf29ae850370c0a2976a2e4d9f
  compilador: kf-compiler v1.3
  hash_fonte: e473f08340c62d3f236e9358517c79e7526dde0af4f193b304fced1e81aee4c7
  fonte: LILA-DEV/kf-fonte.yaml
  origem: projeto
  eixo: componente

## ESCOPO
  Single DDL source `SCHEMA` in `src/db/database.ts`: daily_logs (EAV keyed by dia+domain), cardio_logs (one row per dia), invest_transactions (aporte per data) and portfolio_positions (declared, unused). CREATE TABLE IF NOT EXISTS only — no migration path exists.

## FRONTEIRAS
  Query/write call sites belong to KF-UI-HOJE until a data layer exists; byte storage belongs to KF-PERSISTENCIA-LOCAL. Column/table changes are ESTRUTURAL (DEC-006).

## DECISOES VIGENTES
- FR-BOOTSTRAP-20261020.D5 | tipo: tecnica | origem: projeto | tomada_por: humano | validacao: gate
  daily_logs usa modelo EAV com chave unica (dia, domain) e booleano persistido como 1/0; a DDL vive exclusivamente em SCHEMA e nao existe caminho de migracao para base ja instalada.

## COMPORTAMENTOS ESPERADOS
  (none)

## DECISOES DEPRECADAS (tombstone)
  (none)

## MAPA DE ARQUIVOS
  LILA-DEV/planejamento/migracao/frs-retroativos/FR-BOOTSTRAP-20261020.md | registros: 1 | vigentes: 1 | deprecadas: 0 | planejamentos: 0
