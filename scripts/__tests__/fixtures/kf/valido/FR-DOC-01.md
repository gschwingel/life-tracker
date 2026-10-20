# FR-DOC-01 (fixture) — registros de decisão VÁLIDOS
# v1.3: FRs VIVAS carregam ESTADO: PRESENTE (fail-closed); D1 é CASSADA por D2 (deprecada — isenta
# e vedada de ESTADO) e D2 é executora de supersede — ambas isentas.

FR-ID: FR-DOC-01
Estado: fixture de teste (Fase A2 — compilador KF)

## Registros

ID: FR-DOC-01.D1
DECISAO: Convencao Canonical/derivado obrigatoria em todo documento de governanca
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: framework
SUPERSEDE: NENHUMA
VALIDACAO: gate

ID: FR-DOC-01.D2
DECISAO: Banner de snapshot historico obrigatorio em documento congelado
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: FR-DOC-01.D1
MOTIVO_SUPERSAO: evolucao
VALIDACAO: teste

ID: FR-DOC-01.B1
DECISAO: Todo documento .md de docs/ declara Version, Last update e Status
TIPO: comportamento
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: framework
SUPERSEDE: NENHUMA
VALIDACAO: observavel
ESTADO: PRESENTE

ID: FR-DOC-01.D3
DECISAO: Indice vetorial regenera no mesmo PR da fonte que ele indexa
TIPO: tecnica
AREA_TATICA: KF-INDICES
TOMADA_POR: Lila
ORIGEM: framework
SUPERSEDE: NENHUMA
VALIDACAO: gate
ESTADO: PRESENTE
