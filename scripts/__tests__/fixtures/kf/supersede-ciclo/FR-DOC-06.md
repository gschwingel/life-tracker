# FR-DOC-06 (fixture supersede-ciclo) — A supersede B e B supersede A
# Esperado: G2 violado — "SUPERSEDE ciclico" — exit 1

ID: FR-DOC-06.D1
DECISAO: Decisao A que declara supersessao de B
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: FR-DOC-06.D2
VALIDACAO: gate

ID: FR-DOC-06.D2
DECISAO: Decisao B que declara supersessao de A (fecha o ciclo)
TIPO: tecnica
AREA_TATICA: KF-DOC
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: FR-DOC-06.D1
VALIDACAO: gate
