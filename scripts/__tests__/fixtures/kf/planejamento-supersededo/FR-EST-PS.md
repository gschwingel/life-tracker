# FR-EST-PS (fixture v1.3) — FR cassada por executora vira tombstone e sai do pendente
# v1.3 (Q2=B): deprecada é isenta E vedada de ESTADO — o carimbo ESTADO: PLANEJAMENTO saiu de D1;
# o cenário "PLANEJAMENTO cassado" deixou de existir por contrato (ver fixture deprecada-com-estado).

ID: FR-EST-PS.D1
DECISAO: Planejamento que vira alvo formal de executor sai do pendente
TIPO: negocio
AREA_TATICA: KF-DOC
TOMADA_POR: humano
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: observavel

ID: FR-EST-PS.D2
DECISAO: Executora formaliza a cassacao do planejamento alvo
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: FR-EST-PS.D1
MOTIVO_SUPERSAO: evolucao
VALIDACAO: teste
