PROTOCOLO-CANONICAL v1.4 — APPROVED — 2026-10-16 (deliberate event Igor 2026-10-16, PATCH-REMEDIACAO-HOMEOSTASE-20261016 item 4.2)
Emenda v1.4: reclassificação do §7 — regen de derivados sai do MESMO PR para o regime vigente (watchdog async + docs-einv-frescor não-bloqueante; regime de facto desde FRAME-GATES-ROTINAS-DIARIAS-20261015). A distinção REGEN-MECÂNICA ≠ REMAPEAMENTO-DE-ESTADO permanece; muda só o QUANDO/ONDE a regen pousa.
Emenda v1.3: cadastro dos 6 pares P1 (P1.6 + P1.5 + P1.1 + P1.3 + P1.4 + P1.2) no §7 — transporte generalizado (registry + gerador + frescor multi-par), gate assíncrono único, merge=binary + eol=lf PRECEDENCE: subordinate aos FDVs de processo do LILA-DEV SCOPE: padrão fonte/derivado da camada de documentação de governança do LILA-DEV

1. PADRÃO
Toda FDV e protocolo do LILA-DEV existe em duas camadas:

LILA-DEV/Canonical/: pt-BR, leitura humana, FONTE da decisão, conteúdo verbatim
LILA-DEV/ raiz: derivado em inglês técnico de alta densidade semântica (estilo Governor-Dense), com cabeçalho DERIVED_FROM apontando a canônica
2. PRECEDÊNCIA
Conflito entre canônica e derivado → canônica prevalece, sempre
Version bump acontece SÓ na canônica; derivado regenera com o mesmo número
Derivado nunca é segunda fonte de verdade
3. GATE DE TRANSPORTE
Todo elemento normativo da canônica precisa ser traçável no derivado
O PR de conversão nasce com checklist de mapeamento seção a seção
A revisão humana confere transporte, não estilo
4. GATES POR CAMADA
6-checks FDV-E na canônica (onde mora julgamento humano)
Derivado não ganha 6-checks próprios — só o gate de transporte
5. ESCOPO DE APLICAÇÃO
Aplica-se a: FDV-PLAN, FDV-DEV, FDV-EXEC, FDV-PATCH, PROTOCOLO-INDICES, PROTOCOLO-TRANSVERSAL, e este protocolo — mais os pares P0–P1 (§7, cadastros v1.2–v1.3)
Exceções (camada única, sem dual): README-DEV-AI.md (entrada de IA por natureza) EXCETO §5, que é mirror derivado verbatim da Canonical FDV-E §4 (cadastro v1.2), e §4.X, que é lista de áreas táticas gerada (cadastro v1.3); INDICES.md (artefato operacional). O bloco E-INV-DEV de .clinerules é derivado (o resto do .clinerules = dispatcher, camada única). FDV-ZERO.md foi removido da superfície ativa (sentença G5, 2026-09-19).
6. KF-ÁREA
KF-área compilados saem em inglês técnico denso (artefato de consumo de IA, não leitura humana) — especificação de idioma no kf-fonte.yaml (FDV-PLAN v7.1 §3–§4)

7. REGEN DE DERIVADOS
Regime vigente (v1.4, deliberate event Igor 2026-10-16): PR que toca fonte de artefato derivado NÃO precisa regenerar no MESMO PR — o frescor é garantido pelo regime watchdog async (watchdogs diários entregando por PR + gate docs-einv-frescor não-bloqueante em gates-grafo.yml; pr-gate.yml sem steps de frescor desde FRAME-GATES-ROTINAS-DIARIAS-20261015). Exceção: prompt vivo (module-map backend/src/**) permanece por PR — prompt não tolera 24h (D1 do frame). A regra antiga ("MESMO PR como consequência determinística") valeu até 2026-10-15 e está reclassificada, não apagada — git preserva o rastro.
Distinção (inalterada): REGEN-MECÂNICA (regenerar derivado de fonte — permitida e obrigatória, onde quer que pouse) ≠ REMAPEAMENTO DE ESTADO (decidir onde estruturas penduram — decisão estrutural própria)
Artefato de saída determinístico: mesma árvore → mesmo byte a byte (verificar com segunda execução e diff vazio quando aplicável)
Par cadastrado P0 E-INV-DEV (v1.2, FRAME-DOCS-MECANIZACAO-P0-20261002 D3-EMENDA): fonte src/prompts/Canonical/FDV-E.md §4 [normative schema] → derivados .clinerules bloco E-INV-DEV + LILA-DEV/README-DEV-AI.md §5, via scripts/injetar-einv-dev.cjs (verbatim EN, 18 E-INV, idempotente); frescor por CONTEÚDO via scripts/verificar-frescor-docs.cjs (regen em memória, diff byte a byte); gate ASSÍNCRONO próprio docs-einv-frescor em gates-grafo.yml (não-bloqueante; promoção = decisão humana futura); merge=binary + text eol=lf nos dois consumidores; pr-gate.yml INTOCADO; conflito resolve por REGEN, nunca por line-merge
Transporte generalizado P1 (v1.3, SP-DOCS-MECANIZACAO-P1a/P1b/P1.2): scripts/docs-pairs.registry.json (7 pares, 8 derivados) + scripts/gerar-docs-derivados.cjs (determinístico, idempotente, sem timestamp/locale, flags --check/--dry-run/--pair /--list/--json/--live, splice SÓ entre marcadores <!-- GENERATED: <id> -->, marcador ausente = fail-closed exit 2) + scripts/verificar-frescor-docs.cjs (multi-par, block-scoped, regen em memória, normaliza CRLF/LF + espaço final, exit 0/1/2, acusa com par + derivado + fontes + regen). Gate ASSÍNCRONO único docs-einv-frescor em gates-grafo.yml (não-bloqueante; pr-gate.yml INTOCADO). Consumidores com merge=binary + text eol=lf no .gitattributes. Corpus vetorial (README-DEV-AI.md + docs/*.md): gate não-bloqueante. Conflito resolve por REGEN, nunca por line-merge.
Par P1.6 protocolo-indices-rule3 (D5): fonte wc -l -c medido a cada regen (sem carimbo) → derivados LILA-DEV/PROTOCOLO-INDICES.md RULE 3 (+ nota do grafo). A instrução manual "re-measured at each update" MORRE no mesmo PR — derivado nunca manda medir à mão.
Par P1.5 scripts-readme-table (D3): fontes scripts/*.cjs filesystem + package.json#scripts
header por script MENOS dead-list de LILA-DEV/INDICES.md (âncora Mortos em REANC-L4). Fórmula explícita: vivos = presentes − mortos; morto nunca listado como vivo; colisão morto×filesystem reportada com path:linha → derivado scripts/README.md.
Par P1.1 readme-tactical-areas (D4): fontes LILA-DEV/kf-fonte.yaml (congelamento.areas_historicas + slugs KF-area) + distinct(area_tatica) de LILA-DEV/planejamento/grafo.json → derivado LILA-DEV/README-DEV-AI.md §4.X. Contagem/lista à mão MORRE dentro do marcador; prosa fora byte-idêntica.
Par P1.3 deploy-tables (DEPLOY parcial, 3 blocos deploy-env/deploy-workflows/deploy-railway via derived_block_markers[{key,begin,end}]): fontes .env.example + backend/.env.example (CHAVES apenas, nunca valores) + .github/workflows/*.ya?ml (nomes + triggers + jobs) + .railway/railway.ts (nomes de recursos/configs) → derivado docs/DEPLOY.md. Prosa normativa, smoke checklists, história operacional e lições ficam MANUAIS fora dos marcadores.
Par P1.4 localstorage-keys (D1, INVERSÃO): fonte de DADOS = código (grep localStorage em src/lib/**, escopo impresso no bloco) + DEAD_STORAGE_KEYS (src/lib/storage-hygiene.ts) e mortes em comentário (src/lib/softcontext.ts). Fórmula: alive = code_found − dead_declared; fantasma nunca listado como vivo. Autoridade em 2 camadas (prosa MANUAL fora do marcador, uma vez): "Normative authority: AI-PROJECT-MANIFEST §A1; data source: code scan at regen time." scripts/verificar-localstorage-keys.cjs vira CONSUMIDOR do bloco gerado (não duplica scan). → derivado docs/LOCALSTORAGE-KEYS.md.
Par P1.2 tests-structure (D6, 2 blocos tests-path-gate/tests-e2e-gold, CHURN RULE dura): fontes VIVAS vitest.config.ts + backend/vitest.config.ts (test.coverage.thresholds, 10 gates) + test/e2e/*.spec.ts filesystem (gold = membros g<N>-*) + LILA-DEV/kfs/kf-testes.md. KF-TEST-REGRESSION (C2 congelado) NUNCA é fonte (fail-closed se citado). Bloco materializa SÓ estrutura (PATH-GATE rows + gold list + links de fonte + linha "Live numbers: run — never hand-copied here"); contagens/coverage/datas NUNCA entram no commitado (staleiam SÓ: threshold mudado ou add/remove de membro gold). Números vivos = --live no stdout, nunca escreve; --check ignora --live. → derivado docs/TESTING.md.