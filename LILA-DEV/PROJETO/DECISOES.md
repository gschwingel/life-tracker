# DECISOES — life-tracker

atualizado_em: 2026-10-20
camada: PROJETO (substitui `decisoes-ledger.json` + frames — ver PROTOCOLO-LOCAL §3.3)
regra: **append-only**. Decisão registrada nunca é editada; é suplantada por decisão nova que a cita
(`supersede: DEC-NNN`). Decisão de negócio só entra por declaração do dono — a IA nunca decide (E-INV-02).

## Registro

| ID | Data | Decisão | Origem | Status |
|---|---|---|---|---|
| DEC-001 | 2026-10-20 | Adotar o método LILA-DEV **adaptado** ao repo: camada viva = `LILA-DEV/PROJETO/`; herdado mantido como referência e suspenso onde depende de infra ausente | dono: "adapte a estrutura e as regras para a realidade do projeto" | vigente |
| DEC-002 | 2026-10-20 | Estado vigente vive em `PROJETO/ESTADO-ATUAL.md` (texto), não em `grafo.json`/snapshots | consequência de DEC-001 | vigente |
| DEC-003 | 2026-10-20 | Decisões em `PROJETO/DECISOES.md` (append-only, `DEC-NNN`); entregas em `PROJETO/LOG.md` | consequência de DEC-001 | vigente |
| DEC-004 | 2026-10-20 | Gate do projeto = `npm run typecheck` + `npm run governanca:validar` (+ `npm run build` quando `src/` muda); substitui merge-gate/pr-gate/gates-grafo | consequência de DEC-001 | vigente |
| DEC-005 | 2026-10-20 | Bloco `E-INV-01..18` do `.clinerules` passa a ser **home única** neste repo (a fonte `src/prompts/Canonical/FDV-E.md` não existe aqui, logo não há regen); regen volta a valer se a fonte for reintegrada | consequência de DEC-001 | vigente |
| DEC-006 | 2026-10-20 | Toda mudança em `SCHEMA` (`src/db/database.ts`) ou em dado persistido do usuário é classe **ESTRUTURAL**, nunca PATCH | risco §4.1 de ESTADO-ATUAL (sem migração) | vigente |
| DEC-007 | 2026-10-20 | `tsconfig.json` `include` passa a `["src"]` (citava `vite.config.ts` inexistente; o arquivo real é `vite.config.mjs`) | defeito medido no baseline | vigente |
| DEC-008 | 2026-10-20 | `node_modules` permanece **rastreado** por enquanto; remoção do índice é decisão do dono (altera repo publicado) | risco §4.6 de ESTADO-ATUAL | **pendente de decisão do dono** |
| DEC-009 | 2026-10-20 | Reativar **em modo espelho retroativo** o bloco suspenso de estado (`LILA-DEV/kf-fonte.yaml` + `LILA-DEV/kfs/` + `LILA-DEV/planejamento/` + snapshots SP/FR + `LILA-DEV/execucao/contratos-afetados.json`), formalizando SÓ o que o rascunho já faz. Precedência mantida: `ESTADO-ATUAL.md` continua sendo o estado vigente; grafo/KF/snapshots são espelho mecânico do as-built e, em conflito, perdem para `PROJETO/` | ordem do dono, 2026-10-20: "siga como o plano enviado" (bootstrap LILA-DEV) — `PROTOCOLO-LOCAL` §5 exige decisão do dono para reativação | vigente (supersede parcial de DEC-002: grafo.json passa a existir como espelho, não como autoridade) |
| DEC-010 | 2026-10-20 | `docs/AI-PROJECT-MANIFEST.md` entra como **artefato gerado não-autoritativo** (skeleton via `scripts/gerar-manifest-esqueleto.cjs`). Em conflito prevalecem `ESTADO-ATUAL.md`, `MAPA-PROJETO.md` e `REGRAS-CODIGO.md` (§3.5 do PROTOCOLO-LOCAL continua valendo) | consequência de DEC-009 (bootstrap: output 3) | vigente |
| DEC-011 | 2026-10-20 | `js-yaml` é exigido por `scripts/kf-compiler.cjs` e `scripts/gerar-manifest-esqueleto.cjs`, mas **não está declarado** em `package.json` (nem instalado). O bootstrap rodou com instalação fora do repo (`NODE_PATH` → `%TEMP%\lila-deps`), sem tocar `package.json`/`node_modules`. Declarar como `devDependency` é decisão do dono | defeito medido no bootstrap (exit de módulo ausente) | **pendente de decisão do dono** |

## Parada por ambiguidade (P1)

Pedido que não está coberto nem pelo `ESTADO-ATUAL.md` nem por estas decisões → parar no formato
`P1 — AMBIGUIDADE NÃO COBERTA` (bloco `P1-DEV` do `.clinerules`). Exemplos já conhecidos:
nova tela/rota, backup/export de dados, política de migração de base instalada, remoção de
`portfolio_positions`, chamada de rede.
