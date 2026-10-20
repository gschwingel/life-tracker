# KF-PERSISTENCIA-LOCAL — KF-AREA (compiled projection; never hand-edited)

meta:
  gerado_em: 2026-10-20T17:01:40-03:00
  commit_fonte: e0b1ee7b606927cf29ae850370c0a2976a2e4d9f
  compilador: kf-compiler v1.3
  hash_fonte: e473f08340c62d3f236e9358517c79e7526dde0af4f193b304fced1e81aee4c7
  fonte: LILA-DEV/kf-fonte.yaml
  origem: projeto
  eixo: capacidade

## ESCOPO
  sql.js (WASM) in-memory database, exported to bytes and stored in a single IndexedDB database `life-tracker` / store `sqlite` / key `main`. Writes go through `persist()` with a 300 ms debounce; that is the only persistence path. No backup, no export, no network.

## FRONTEIRAS
  Schema ownership belongs to KF-MODELO-DADOS. Sync/backup do not exist and would be a new capability (P1 before any code).

## DECISOES VIGENTES
- FR-BOOTSTRAP-20261020.D6 | tipo: tecnica | origem: projeto | tomada_por: humano | validacao: observavel
  Persistencia local unica: sql.js exporta bytes para IndexedDB (life-tracker/sqlite/main) apos debounce de 300 ms; nenhum outro caminho grava a base.

## COMPORTAMENTOS ESPERADOS
  (none)

## DECISOES DEPRECADAS (tombstone)
  (none)

## MAPA DE ARQUIVOS
  LILA-DEV/planejamento/migracao/frs-retroativos/FR-BOOTSTRAP-20261020.md | registros: 1 | vigentes: 1 | deprecadas: 0 | planejamentos: 0
