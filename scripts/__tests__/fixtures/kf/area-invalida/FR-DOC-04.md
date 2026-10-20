# FR-DOC-04 (fixture area-invalida) — AREA_TATICA fora do particionamento
# Esperado: G1 violado — "fora do particionamento do kf-fonte" — exit 1
# v1.3: a FR viva declara ESTADO: PRESENTE para isolar o gate G1 (sem ESTADO o exit seria 2).

ID: FR-DOC-04.D1
DECISAO: Area que nao existe em nenhum KF declarado na fonte
TIPO: tecnica
AREA_TATICA: KF-INEXISTENTE
TOMADA_POR: Lila
ORIGEM: projeto
SUPERSEDE: NENHUMA
VALIDACAO: gate
ESTADO: PRESENTE
