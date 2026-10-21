# REGRAS-CODIGO — life-tracker

atualizado_em: 2026-10-20
camada: PROJETO (substitui `docs/AI-PROJECT-MANIFEST.md` no que toca convenção — ver PROTOCOLO-LOCAL §3.5)
natureza: **descrição do que o código já faz**, não preferência nova. Desvio exige `DEC-NNN`.

## 1. LINGUAGEM E TIPOS

- TypeScript **strict** com `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`.
  Código que não passa em `npm run typecheck` não existe.
- Proibido `any` explícito; linha de banco vem de `stmt.getAsObject() as { ... }` (`src/db/repo.ts:92`).
- Sem `enum`, sem decorators, sem namespace. Tipos locais com `type` (`type Form = {...}`).
- Funções utilitárias de módulo em `const` arrow (`const num = (s: string): number | null => ...`,
  `src/db/repo.ts:37`).

## 2. ESTILO (medido no código existente)

- 2 espaços, aspas simples, ponto e vírgula obrigatório.
- Componentes: função + hooks (`export default function App()`), nunca classe. Um `createRoot`.
- `useState` com updater funcional em patch (`setForm(f => ({ ...f, ...patch }))`, `src/App.tsx:94`).
- CSS global em `src/index.css`, classes curtas (`.card`, `.row`, `.toggle`, `.save`). Sem framework,
  sem CSS-in-JS, sem Tailwind. Paleta atual: fundo `#0f172a`, superfície `#1e293b`, texto `#e2e8f0`,
  destaque `#38bdf8`.

## 3. IDIOMA DO DOMÍNIO

- Nomes de domínio **em pt-BR**, no código **e** no banco: `peso`, `treino`, `cardio`, `aporte`,
  `dia`, `tipo`, `valor`, `quantidade`.
- Strings de UI em pt-BR. Identificadores técnicos (funções, tipos, colunas genéricas como `id`,
  `created_at`) em inglês/neutro — seguir o que já existe, não traduzir retroativamente.

## 4. DATAS

- Dia de referência **sempre local**: `new Date().toLocaleDateString('en-CA')` → `YYYY-MM-DD`.
- **Proibido** `toISOString().slice(0, 10)`: é UTC e, em UTC-3, vira o dia seguinte depois das 21h
  (registro cairia no dia errado). `scripts/validar-projeto.cjs` reprova esse padrão.

## 5. NÚMEROS

- Entrada numérica = `<input type="text" inputMode="decimal|numeric">` + `num()`:
  `Number(s.replace(',', '.'))`, vazio → `null` (`src/db/repo.ts:37`).
- Proibido `parseFloat`/`Number` direto no valor do input: `parseFloat('82,4')` retorna `82`
  (truncamento silencioso do decimal brasileiro).
- Comparação de `value` booleano no banco: `1/0` (`row.value === 1`, `form.treino ? 1 : 0`).

## 6. ESCRITA NO BANCO

- Sempre parametrizado: `db.run(sql, [params])` / `stmt.bind([...])`. **Nunca** interpolar valor em SQL.
- Upsert é o padrão de gravação: `ON CONFLICT(chave) DO UPDATE SET campo = excluded.campo`.
- `id` gerado com `crypto.randomUUID()` (nunca `Math.random`, nunca autoincrement).
- Toda escrita termina com `persist()`. Sem `persist()` = gravação só em memória (perde no reload).
- Leitura: `db.prepare(...)` → `bind` → `step()` → `getAsObject()` → **sempre** `stmt.free()`.

## 7. SCHEMA E DADOS DO USUÁRIO

- DDL vive só em `SCHEMA` (`src/db/database.ts`). Nenhum outro arquivo cria/altera tabela.
- `CREATE TABLE IF NOT EXISTS` **não migra** base já existente: adicionar coluna exige migração
  idempotente + `DEC-NNN` de classe ESTRUTURAL. Proibido `ALTER/DROP` improvisado.
- Proibido apagar/renomear tabela ou coluna sem decisão registrada (o dado é local e insubstituível).

## 8. LOCAL-FIRST

- Proibido `fetch`, `axios`, `XMLHttpRequest`, WebSocket ou qualquer chamada de rede: o app não tem
  backend. Chamada externa exige decisão registrada (muda a arquitetura, não é PATCH).
- Dado do app **não** vai para `localStorage` nem `sessionStorage`: a única persistência é IndexedDB
  via `src/db/idb.ts`.
- Nenhuma dependência nova sem decisão do dono (E-INV-02). Hoje: react, react-dom, sql.js + tooling
  (vite, plugin-react, vite-plugin-pwa, typescript, types).

## 9. HIGIENE

- Sem `console.log` esquecido em `src/` (debug temporário sai antes da entrega).
- Sem `alert`/`confirm`: feedback é estado de UI (`saved` + timeout, `src/App.tsx:60-62`).
- Segredo nunca no código: `.env.local` é untracked (`.gitignore`: `.env*`); só `VERCEL_OIDC_TOKEN` hoje.
- Texto visível ao usuário em pt-BR, com acentuação correta (o código é UTF-8).

## 10. GATE (antes de declarar entrega)

```
npm run validate   # typecheck + governanca:validar
npm run build      # obrigatório quando src/ muda
```
