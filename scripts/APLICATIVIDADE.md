# APLICATIVIDADE DOS SCRIPTS — life-tracker

atualizado_em: 2026-10-20
motivo: `scripts/` foi herdado do framework original (monorepo com grafo, backend, CI e MCP). Neste repo
a maioria é **inerte por construção** — falha na primeira linha por falta de fonte/estado.
fonte normativa: `LILA-DEV/PROJETO/PROTOCOLO-LOCAL.md` §2.

## 1. ATIVO (usado pelo GATE_LOCAL)

| Script | Papel |
|---|---|
| `scripts/validar-projeto.cjs` | gate local: camada de regras, contrato de schema, regras local-first, higiene de repo (exit 0/1) |

Comando: `npm run governanca:validar`.

## 2. REATIVÁVEL (inerte hoje; volta se a fonte existir)

| Script | Falta |
|---|---|
| `injetar-einv-dev.cjs` | `src/prompts/Canonical/FDV-E.md` (regen do bloco E-INV-DEV) |
| `verificar-frescor-docs.cjs`, `checar-paridade-docs.cjs` | `docs/` + as 7 fontes de `docs-pairs.registry.json` |
| `verificar-indices-commitados.cjs` | `LILA-DEV/indice-rastreabilidade.json`, `indice-vetorial.*` |

## 3. NÃO EXECUTAR sem ordem explícita do dono (efeito destrutivo/ambiente)

Detecção estática em 2026-10-20:

| Script | Efeito observado no código |
|---|---|
| `rotate-encryption-key.cjs` | rotação de chave + chamada de API |
| `prune-semanal.cjs` | apaga/arquiva logs (dry-run existe, mas não é o default lido) |
| `restore-test.cjs`, `fila-drain.cjs` | removem arquivos |
| `install-hooks.cjs` | instala hooks em `.git/hooks` |
| `lila-models.cjs` | chamada de API externa |
| `run-checks-parallel.cjs`, `run-gate.cjs`, `run-test-scripts.cjs` | invocam `vitest`/suítes que não existem neste repo |

## 4. INERTE POR DEPENDÊNCIA AUSENTE (65 dos 83 `.cjs`)

Dependem de `LILA-DEV/planejamento/` (grafo), `docs/`, `backend/`, `.github/` (CI), MCP, Railway,
`indice-vetorial.*`, `kfs/`, `snapshots/` ou worktrees — nada disso existe aqui. Não "consertar" por
inferência: cada um volta no seu gatilho declarado em `PROTOCOLO-LOCAL.md` §5.

## 5. REGRA DE USO

1. Antes de rodar qualquer script herdado, verificar se as fontes dele existem (`grep` de path no próprio arquivo).
2. Script que falha por fonte ausente **não é bug** — é herdado inerte; não reescrever sem `DEC-NNN`.
3. Script novo do projeto entra no §1 e no GATE_LOCAL no mesmo commit (padrão: `validar-projeto.cjs`).
