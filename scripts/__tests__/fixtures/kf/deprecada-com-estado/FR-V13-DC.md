# FR-V13-DC (fixture v1.3) — FR deprecada COM ESTADO: erro de categoria (exit 2)
# Esperado: exit 2 — tombstone nao carrega ESTADO (simetria com executora×ESTADO, D2).

ID: FR-V13-DC.D1
DECISAO: Decisao cassada que carrega ESTADO indevido — tombstone nao tem estado
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: gate
ESTADO: PRESENTE

ID: FR-V13-DC.D2
DECISAO: Executora formaliza a cassacao da decisao com estado indevido
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: FR-V13-DC.D1
MOTIVO_SUPERSAO: remocao
VALIDACAO: teste