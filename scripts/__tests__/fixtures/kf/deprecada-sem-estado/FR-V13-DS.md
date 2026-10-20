# FR-V13-DS (fixture v1.3) — FR deprecada SEM ESTADO: isenta do requisito (exit 0)
# Esperado: compile exit 0; D1 entra no tombstone (executor D2) e nunca no pendente.

ID: FR-V13-DS.D1
DECISAO: Decisao cassada por executora — tombstone isento do requisito de ESTADO
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: gate

ID: FR-V13-DS.D2
DECISAO: Executora formaliza a cassacao do tombstone isento de ESTADO
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: FR-V13-DS.D1
MOTIVO_SUPERSAO: evolucao
VALIDACAO: teste