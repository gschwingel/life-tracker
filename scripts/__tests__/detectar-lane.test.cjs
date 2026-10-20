"use strict";
/**
 * Testes do núcleo puro de detectar-lane.cjs (FRAME-LANES-20261003).
 * Roda via `npm run test:scripts` (padrão scripts/__tests__/*.test.cjs).
 * Sem git: só o núcleo de classificação (classificarLane) e o parser V3.
 */
const assert = require("assert");
const { classificarLane, patchNodesAdicionados, lanesComEntryAdicionada, tagsFromSubject, numstatParaArquivos, resolveNewPath, escolherBaseEfetiva, resolverBaseEfetiva, EXEMPT_PREFIXES, DOCS_NEGADOS } = require("../detectar-lane.cjs");

const f = (path, status = "A", linhas = 10) => ({ path, status, linhas });

// ── Classificação de lanes ───────────────────────────────────────────────────
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/ARCHITECTURE.md")], subjects: ["docs: x [LANE-DOCS]"] }).lane,
  "LANE-DOCS", "docs puro → LANE-DOCS");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md"), f("LILA-DEV/README-DEV-AI.md")], subjects: [] }).lane,
  "LANE-DOCS", "docs misto docs/ + LILA-DEV/ → LANE-DOCS");
assert.strictEqual(
  classificarLane({ arquivos: [f("Method/tema/nota.md", "A")], subjects: [] }).lane,
  "LANE-LILA-WRITE", "Method aditivo → LANE-LILA-WRITE");
assert.strictEqual(
  classificarLane({ arquivos: [f("Method/tema/nota.md", "M")], subjects: [] }).lane,
  "LANE-DOCS", "Method modificado NÃO é lila-write (cai para docs)");
assert.strictEqual(
  classificarLane({
    arquivos: [f("src/pages/DashboardChat.tsx"), f("src/components/X.tsx"), f("src/estilo.css")],
    subjects: [],
  }).lane,
  "LANE-TRIVIAL", "UI-only confinado dentro do teto → LANE-TRIVIAL");
assert.strictEqual(
  classificarLane({
    arquivos: Array.from({ length: 6 }, (_, i) => f(`src/components/C${i}.tsx`)),
    subjects: [],
  }).lane,
  null, "6 arquivos UI estoura teto → sem lane");
assert.strictEqual(
  classificarLane({ arquivos: [f("src/lib/models.ts")], subjects: [] }).lane,
  "LANE-TRIVIAL", "catálogo de modelos isolado → LANE-TRIVIAL (emenda E3/U7)");
assert.strictEqual(
  classificarLane({ arquivos: [f("src/lib/models.ts"), f("CHANGELOG.md")], subjects: [] }).lane,
  null, "catálogo + CHANGELOG → sem lane (CHANGELOG aposentado 2026-10-06 — saiu do conjunto de paths da lane)");
assert.strictEqual(
  classificarLane({ arquivos: [f("src/lib/models.ts"), f("src/lib/softcontext.ts")], subjects: [] }).lane,
  null, "models.ts + outra lógica de src/lib → sem lane (só o catálogo é path de lane)");
assert.strictEqual(
  classificarLane({ arquivos: [f("src/pages/A.tsx", "M", 60), f("src/pages/B.tsx", "M", 60)], subjects: [] }).lane,
  null, "121 linhas estoura teto → sem lane");
assert.strictEqual(
  classificarLane({ arquivos: [f("src/pages/A.tsx"), f("backend/src/routes/x.ts")], subjects: [] }).lane,
  null, "backend no diff → sem lane");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md"), f("src/pages/B.tsx")], subjects: [] }).lane,
  "LANE-TRIVIAL", "UI + .md de apoio dentro do teto → LANE-TRIVIAL (por design)");
assert.deepStrictEqual(classificarLane({ arquivos: [], subjects: ["x [LANE-DOCS]"] }),
  { lane: null, violacoes: [] }, "diff vazio → sem lane, sem violação");

// ── V1: lane exige tag em todo commit ────────────────────────────────────────
assert.ok(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["a [LANE-DOCS]", "b"] })
    .violacoes.some((v) => v.codigo === "V1"), "commit sem tag em PR de lane → V1");
assert.ok(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["a [LANE-TRIVIAL]"] })
    .violacoes.some((v) => v.codigo === "V1"), "tag de lane errada → V1");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["a [LANE-DOCS]", "b [LANE-DOCS] #1"] }).violacoes.length,
  0, "tags corretas em todos os commits → zero violação");

// ── V2: tag de lane sem lane ─────────────────────────────────────────────────
assert.ok(
  classificarLane({ arquivos: [f("backend/src/x.ts")], subjects: ["a [LANE-DOCS]"] })
    .violacoes.some((v) => v.codigo === "V2"), "tag de lane em diff não-lane → V2");
assert.strictEqual(
  classificarLane({ arquivos: [f("backend/src/x.ts")], subjects: ["fix: x [PATCH-FOO-20261003]"] }).violacoes.length,
  0, "tag PATCH clássica em caminho normal não é violação de lane (fronteira é V3 + gates de cobertura)");

// ── V3: fronteira — nó PATCH-* adicionado ao grafo ───────────────────────────
const diffGrafo = [
  "diff --git a/grafo.json b/grafo.json",
  "+    {",
  '+      "id": "PATCH-NOVO-20261003",',
  '+      "estado": "🟡",',
  "    }",
].join("\n");
assert.deepStrictEqual(patchNodesAdicionados(diffGrafo), ["PATCH-NOVO-20261003"], "linha + com PATCH-* → detectado");
assert.deepStrictEqual(
  patchNodesAdicionados('-      "id": "PATCH-VELHO-20261002",\n context'), [], "linha -/contexto não conta");
assert.deepStrictEqual(patchNodesAdicionados('+      "id": "FRAME-X-20261003",'), [], "FRAME-* é legítimo");

// ── tagsFromSubject (paridade com changelog-block-core) ──────────────────────
assert.deepStrictEqual(tagsFromSubject("a: b [LANE-DOCS] c (#123)"), ["LANE-DOCS"]);
assert.deepStrictEqual(tagsFromSubject("sem tag"), []);

// ── Parser de path com rename do git (brace compacto) ────────────────────────
// Regressão do caso real PR #1239: `git diff --numstat` emite o prefixo comum
// FORA das chaves (".../prompts/{ => executados}/arquivo.md"); o parser antigo
// (split(" => ").pop() + remoção crua de chaves) perdia o prefixo e deixava
// resíduo de "}" → rename puro de .md sob LILA-DEV/ vinha como "executados/…"
// → lane=null → a tag [LANE-DOCS] correta reprovava como V2.
const BRACE_LINE = "0\t0\tLILA-DEV/planejamento/prompts/{ => executados}/2026-10-05-fim-fila-eager-drenador.md";
const ARQUIVADO = "LILA-DEV/planejamento/prompts/executados/2026-10-05-fim-fila-eager-drenador.md";

assert.strictEqual(
  resolveNewPath("LILA-DEV/planejamento/prompts/{ => executados}/2026-10-05-fim-fila-eager-drenador.md"),
  ARQUIVADO, "brace { => executados} → prefixo comum + lado novo + sufixo");
assert.strictEqual(resolveNewPath("src/pages/{A => B}.tsx"), "src/pages/B.tsx",
  "brace {A => B} com ambos os lados preenchidos → src/pages/B.tsx");
assert.strictEqual(resolveNewPath("docs/OLD.md => docs/NEW.md"), "docs/NEW.md",
  "rename simples (sem chaves) → path novo");
assert.strictEqual(resolveNewPath("LILA-DEV/planejamento/prompts/plano.md"),
  "LILA-DEV/planejamento/prompts/plano.md", "sem => → path literal intacto (nada é adivinhado)");
assert.ok(!/[{}]/.test(resolveNewPath("LILA-DEV/a/{ => b}/c.md")), "resultado sem resíduo de { ou }");

const arquivosRename = numstatParaArquivos(BRACE_LINE);
assert.strictEqual(arquivosRename.length, 1, "linha de numstat brace → 1 arquivo");
assert.strictEqual(arquivosRename[0].path, ARQUIVADO, "numstat brace → path novo completo");
assert.ok(arquivosRename[0].path.startsWith("LILA-DEV/"),
  "path novo começa com LILA-DEV/ (prefixo comum preservado, não 'executados/…')");
assert.strictEqual(arquivosRename[0].linhas, 0, "rename puro mede 0 linhas");

const renameDocs = [{ path: ARQUIVADO, status: "R", linhas: 0 }];
assert.strictEqual(
  classificarLane({ arquivos: renameDocs, subjects: ["chore(prompts): x [LANE-DOCS]"] }).lane,
  "LANE-DOCS", "rename puro .md sob LILA-DEV/ → LANE-DOCS (era null com o parser quebrado)");
assert.strictEqual(
  classificarLane({ arquivos: renameDocs, subjects: ["chore(prompts): x [LANE-DOCS]"] }).violacoes.length,
  0, "rename de docs com tag correta → zero violação (sem V2 espúrio)");
assert.ok(
  classificarLane({ arquivos: renameDocs, subjects: ["chore(prompts): x"] })
    .violacoes.some((v) => v.codigo === "V1"),
  "rename de docs SEM tag → V1 (prova que o rename é lane, não caminho normal)");

// ── Extensão 2026-10-10: prompts/** entra na LANE-LILA-WRITE (create/update) ──
const PROMPT = (p, status = "A", linhas = 10) => ({
  path: `LILA-DEV/planejamento/prompts/${p}`,
  status,
  linhas,
});

assert.strictEqual(
  classificarLane({ arquivos: [PROMPT("novo.md", "A")], subjects: [] }).lane,
  "LANE-LILA-WRITE", "prompts/** create → LANE-LILA-WRITE (não LANE-DOCS)");
assert.strictEqual(
  classificarLane({ arquivos: [PROMPT("existente.md", "M")], subjects: [] }).lane,
  "LANE-LILA-WRITE", "prompts/** update (M) → LANE-LILA-WRITE");
assert.strictEqual(
  classificarLane({
    arquivos: [PROMPT("existente.md", "M")],
    subjects: ["chore(prompts): x [LANE-LILA-WRITE]"],
  }).violacoes.length,
  0, "prompts/** update com tag correta → zero violação (V4 não reprova M em prompts)");
assert.strictEqual(
  classificarLane({ arquivos: [PROMPT("novo.md", "A"), PROMPT("outro.md", "A")], subjects: [] }).lane,
  "LANE-LILA-WRITE", "dois prompts aditivos → LANE-LILA-WRITE");
assert.strictEqual(
  classificarLane({ arquivos: [PROMPT("antigo.md", "D")], subjects: [] }).lane,
  "LANE-DOCS", "delete em prompts/** NÃO é LILA-WRITE (cai na LANE-DOCS)");
assert.strictEqual(
  classificarLane({ arquivos: [PROMPT("nota.txt", "A")], subjects: [] }).lane,
  null, "não-.md em prompts/** não é lane");
assert.strictEqual(
  classificarLane({
    arquivos: [PROMPT("novo.md", "A"), f("LILA-DEV/planejamento/frames/x.md", "A")],
    subjects: [],
  }).lane,
  "LANE-DOCS", "prompts/** + outro LILA-DEV/** → regra de diff misto = LANE-DOCS (sem precedência nova)");
assert.ok(
  classificarLane({ arquivos: [PROMPT("a.md", "A")], subjects: ["chore(prompts): x"] })
    .violacoes.some((v) => v.codigo === "V1"),
  "prompts/** aditivo SEM tag → V1 (é lane, exige [LANE-LILA-WRITE])");
assert.ok(
  classificarLane({ arquivos: [PROMPT("a.md", "A")], subjects: ["chore(prompts): x [LANE-DOCS]"] })
    .violacoes.some((v) => v.codigo === "V1"),
  "prompts/** aditivo com tag errada [LANE-DOCS] → V1");

// ── V5 (PATCH-LANES-BINDING-20261015): título do PR como portador de tag ────
// Furo real #1265: tag só no título; squash carimbou [LANE-TRIVIAL] na main
// num diff que reprova V2. O título agora obedece às mesmas regras V1/V2.
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["a [LANE-DOCS]"], prTitle: "docs: x [LANE-DOCS]" }).violacoes.length,
  0, "título com tag correta em PR de lane → zero violação");
assert.ok(
  classificarLane({ arquivos: [f("src/pages/A.tsx"), f("indice-vetorial.json")], subjects: [], prTitle: "fix: x [LANE-TRIVIAL]" })
    .violacoes.some((v) => v.codigo === "V2"), "título taggado em diff não-lane → V2 (caso #1265)");
assert.ok(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["a [LANE-DOCS]"], prTitle: "docs: x [LANE-TRIVIAL]" })
    .violacoes.some((v) => v.codigo === "V1"), "título com tag de lane ERRADA → V1");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["a [LANE-DOCS]"], prTitle: "docs: x sem tag" }).violacoes.length,
  0, "título sem tag não é exigido (tags vivem nos commits)");

// ── Isenções §5 (derivado puro — lista pinada EXEMPT_PREFIXES) ──────────────
assert.ok(EXEMPT_PREFIXES.includes("chore(indices):"), "lista pinada carrega chore(indices)");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["chore(indices): regen do espelho — fixpoint"] }).violacoes.length,
  0, "commit isento sem tag em PR docs-only → zero violação (regen não é entrega de lane)");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["chore(indices): regen [LANE-DOCS]", "docs: x [LANE-DOCS]"] }).violacoes.length,
  0, "isento + entrega taggada convivem → zero violação");

// ── Paths canônicos congelados fora da LANE-DOCS (ritual humano) ────────────
assert.ok(DOCS_NEGADOS.includes("docs/AI-PROJECT-MANIFEST.md"), "manifest na lista de negados");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/AI-PROJECT-MANIFEST.md")], subjects: [] }).lane,
  null, "manifest sozinho → sem lane (ritual humano, caminho normal)");
assert.ok(
  classificarLane({ arquivos: [f("docs/AI-PROJECT-MANIFEST.md")], subjects: ["docs: x [LANE-DOCS]"] })
    .violacoes.some((v) => v.codigo === "V2"), "manifest com tag de lane → V2 (a lane não cobre mais)");
assert.strictEqual(
  classificarLane({ arquivos: [f("src/pages/A.tsx"), f("docs/AI-PROJECT-MANIFEST-INDEX.md")], subjects: [] }).lane,
  null, "UI + manifest de apoio NÃO é trivial (negado vaza para o suporte)");

// ── V6 (rastro com dente): entry na âncora ───────────────────────────────────
const DIFF_LOGS = [
  "diff --git a/LILA-DEV/execucao/logs/LANE-DOCS-log.md b/LILA-DEV/execucao/logs/LANE-DOCS-log.md",
  "+- entry_id: LANE-DOCS.E3",
  " context",
  "+  - entry_id: LANE-TRIVIAL.E1",
].join("\n");
assert.deepStrictEqual(lanesComEntryAdicionada(DIFF_LOGS), ["LANE-DOCS", "LANE-TRIVIAL"],
  "linhas + com entry_id de âncora → lanes detectadas (indentação tolerada)");
assert.deepStrictEqual(lanesComEntryAdicionada(" context\n-  - entry_id: LANE-DOCS.E1"), [],
  "linha -/contexto não conta como entry adicionada");

// ── PATCH-LANES-RANGE-20261017: base EFETIVA do range (núcleo puro) ─────────
// Grafo fake de ancestralidade: HEAD → M(merge) → {C (commit próprio), B (tip de
// main)}; B → A (base velha); C → A. `anc(a, b)` = "a é ancestral de b".
const PARENTS = { HEAD: ["M"], M: ["C", "B"], B: ["A"], C: ["A"], A: [] };
const anc = (a, b) => {
  const fila = [...(PARENTS[b] || [])];
  const vistos = new Set();
  while (fila.length > 0) {
    const n = fila.shift();
    if (n === a) return true;
    if (vistos.has(n)) continue;
    vistos.add(n);
    fila.push(...(PARENTS[n] || []));
  }
  return false;
};

assert.deepStrictEqual(
  escolherBaseEfetiva({ base: "A", mergeBase: "B" }, anc),
  { efetiva: "B", motivo: "base-ancestral-do-merge-base" },
  "merge de main: base velha ancestral do merge-base ⇒ base efetiva = merge-base (#1460)");
assert.deepStrictEqual(
  escolherBaseEfetiva({ base: "A", mergeBase: "A" }, anc),
  { efetiva: "A", motivo: "base-ancestral" },
  "branch linear-behind: fork/merge-base == base ⇒ range do autor preservado");
assert.deepStrictEqual(
  escolherBaseEfetiva({ base: "A", mergeBase: null }, anc),
  { efetiva: "A", motivo: "base-ancestral" },
  "origin/main ausente ⇒ base informada (fail-open mantido)");
assert.deepStrictEqual(
  escolherBaseEfetiva({ base: "Z", mergeBase: "Y" }, anc),
  { efetiva: "Z", motivo: "sem-candidato-ancestral" },
  "nenhum candidato ancestral do HEAD ⇒ fallback para a base");
assert.deepStrictEqual(
  escolherBaseEfetiva({ base: "B", mergeBase: "A" }, anc),
  { efetiva: "B", motivo: "merge-base-ancestral-da-base" },
  "fetch stale (base já mais nova que o merge-base) ⇒ base vence (newest-ancestor)");
assert.deepStrictEqual(
  escolherBaseEfetiva({ base: "B", mergeBase: "C" }, anc),
  { efetiva: "C", motivo: "nao-relacionados-prefere-merge-base" },
  "candidatos sem relação ⇒ prefere merge-base e registra o motivo");

// Regressão de RANGE (contrato): subjects filtrados não disparam V2 falso, e
// os verdadeiros positivos seguem dentes no range filtrado.
const MIXED = [f("backend/src/routes/x.ts"), f("src/components/chat/X.tsx")];
const HISTORICO = "docs(fechamento): zera residuos [LANE-DOCS] (#1455)";
const PROPRIO = "fix(resil): breaker de progresso";
assert.ok(
  classificarLane({ arquivos: MIXED, subjects: [PROPRIO, HISTORICO] })
    .violacoes.some((v) => v.codigo === "V2"),
  "range POLUÍDO (base velha) dispara V2 — reprodução #1442/#1460");
assert.strictEqual(
  classificarLane({ arquivos: MIXED, subjects: [PROPRIO] }).violacoes.length,
  0,
  "range EFETIVO (só commits do autor) ⇒ zero violação");
assert.ok(
  classificarLane({ arquivos: MIXED, subjects: [PROPRIO, "fix: x [LANE-DOCS]"] })
    .violacoes.some((v) => v.codigo === "V2"),
  "V2 verdadeiro preservado: tag do AUTOR em diff caminho normal continua reprovando");
assert.ok(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["docs: x"] })
    .violacoes.some((v) => v.codigo === "V1"),
  "V1 verdadeiro preservado: commit do autor sem tag em PR de lane");
assert.strictEqual(
  classificarLane({ arquivos: [f("docs/A.md")], subjects: ["docs: x [LANE-DOCS]"] }).violacoes.length,
  0, "PR de lane com tag correta no range efetivo ⇒ zero violação");

// ── PATCH-LANES-RANGE-20261017: INTEGRAÇÃO em repo temporário (sem rede) ────
// Reproduz o mecanismo real: main ganha um squash [LANE-DOCS]; a branch do PR
// parte de uma base velha e faz `git merge main` ANTES de avaliar. Na base velha
// o range carrega o squash (V2 falso, #1460); na base efetiva não.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const pathMod = require("path");

const DETECTOR = pathMod.join(__dirname, "..", "detectar-lane.cjs");
const temporarios = [];
function novoRepo() {
  const dir = fs.mkdtempSync(pathMod.join(os.tmpdir(), "lane-range-"));
  temporarios.push(dir);
  const g = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  g(["init", "-q"]);
  g(["config", "user.email", "t@t.t"]);
  g(["config", "user.name", "t"]);
  g(["config", "commit.gpgsign", "false"]);
  g(["checkout", "-q", "-b", "main"]);
  return { dir, g };
}
function escrever(g, dir, rel, texto) {
  const abs = pathMod.join(dir, rel);
  fs.mkdirSync(pathMod.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, texto);
  g(["add", rel]);
}
function rodarCli(dir, base) {
  try {
    const stdout = execFileSync(process.execPath, [DETECTOR, "--base", base, "--root", dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

// Caso A — merge de main no PR (mecanismo do #1460).
{
  const { dir, g } = novoRepo();
  escrever(g, dir, "backend/src/a.ts", "a\n");
  g(["commit", "-q", "-m", "chore: base"]);
  const baseVelha = g(["rev-parse", "HEAD"]);
  escrever(g, dir, "backend/src/a.ts", "a\nb\n");
  g(["commit", "-q", "-m", "docs: historico [LANE-DOCS] (#9999)"]);
  const tipMain = g(["rev-parse", "HEAD"]);
  g(["checkout", "-q", "-b", "pr", baseVelha]);
  escrever(g, dir, "backend/src/own.ts", "own\n");
  g(["commit", "-q", "-m", "fix(patch): entrega do autor sem tag"]);
  g(["merge", "-q", "--no-ff", "-m", "chore(merge): sync main", "main"]);
  g(["update-ref", "refs/remotes/origin/main", tipMain]);

  const sujeitosVelhos = g(["log", "--no-merges", "--format=%s", `${baseVelha}..HEAD`]).split("\n");
  assert.ok(sujeitosVelhos.some((s) => s.includes("[LANE-DOCS]")),
    "INTEGRAÇÃO: base velha + merge de main inclui o squash histórico no range (reproduz #1460)");
  assert.ok(
    classificarLane({ arquivos: [f("backend/src/own.ts", "A", 1)], subjects: sujeitosVelhos }).violacoes.some((v) => v.codigo === "V2"),
    "INTEGRAÇÃO: range velho dispara V2 falso (prova de que o gate antigo reprovava)");

  const resol = resolverBaseEfetiva(baseVelha, dir);
  assert.strictEqual(resol.efetiva, tipMain, "INTEGRAÇÃO: base efetiva = merge-base (tip de main) após merge");
  const sujeitosEfetivos = g(["log", "--no-merges", "--format=%s", `${resol.efetiva}..HEAD`]).split("\n").filter(Boolean);
  assert.deepStrictEqual(sujeitosEfetivos, ["fix(patch): entrega do autor sem tag"],
    "INTEGRAÇÃO: range efetivo = SÓ os commits do autor");

  const cli = rodarCli(dir, baseVelha);
  assert.strictEqual(cli.status, 0, `INTEGRAÇÃO: detector com base efetiva aprova (exit ${cli.status})`);
  assert.ok(cli.stdout.includes("merge-base origin/main"), "INTEGRAÇÃO: log nomeia a base efetiva e o merge-base");
}

// Caso B — V2 VERDADEIRO: tag do AUTOR em diff caminho normal continua reprovando.
{
  const { dir, g } = novoRepo();
  escrever(g, dir, "backend/src/x.ts", "x\n");
  g(["commit", "-q", "-m", "chore: base"]);
  const base = g(["rev-parse", "HEAD"]);
  escrever(g, dir, "backend/src/y.ts", "y\n");
  g(["commit", "-q", "-m", "feat: x [LANE-DOCS]"]);
  const cli = rodarCli(dir, base);
  assert.strictEqual(cli.status, 1, "INTEGRAÇÃO: V2 verdadeiro mantém exit 1");
  assert.ok(cli.stderr.includes("[V2]"), "INTEGRAÇÃO: V2 verdadeiro continua reprovando");
}

// Caso C — V1 VERDADEIRO: PR de lane com commit do autor sem tag.
{
  const { dir, g } = novoRepo();
  escrever(g, dir, "docs/A.md", "a\n");
  g(["commit", "-q", "-m", "chore: base"]);
  const base = g(["rev-parse", "HEAD"]);
  escrever(g, dir, "docs/B.md", "b\n");
  g(["commit", "-q", "-m", "docs: entrega sem tag"]);
  const cli = rodarCli(dir, base);
  assert.strictEqual(cli.status, 1, "INTEGRAÇÃO: V1 verdadeiro mantém exit 1");
  assert.ok(cli.stderr.includes("[V1]"), "INTEGRAÇÃO: V1 verdadeiro continua reprovando");
}

// Caso D — V6 VERDADEIRO: lane reivindicada SEM entry nova na âncora.
{
  const { dir, g } = novoRepo();
  escrever(g, dir, "docs/A.md", "a\n");
  g(["commit", "-q", "-m", "chore: base"]);
  const base = g(["rev-parse", "HEAD"]);
  escrever(g, dir, "docs/B.md", "b\n");
  g(["commit", "-q", "-m", "docs: entrega [LANE-DOCS]"]);
  const cli = rodarCli(dir, base);
  assert.strictEqual(cli.status, 1, "INTEGRAÇÃO: V6 verdadeiro mantém exit 1");
  assert.ok(cli.stderr.includes("[V6]"), "INTEGRAÇÃO: V6 (âncora) continua com dente");
  assert.ok(!cli.stderr.includes("[V1]"), "INTEGRAÇÃO: V6 não vira V1 (commit taggeado)");
}

// Caso E — V6-ISENTO (veredito humano 2026-10-19): LANE-LILA-WRITE aditiva
// NÃO exige entry na âncora; o diff é o rastro (V4 já garante não-destrutivo).
{
  const { dir, g } = novoRepo();
  escrever(g, dir, "docs/A.md", "a\n");
  g(["commit", "-q", "-m", "chore: base"]);
  const base = g(["rev-parse", "HEAD"]);
  escrever(g, dir, "LILA-DEV/planejamento/prompts/2026-10-19-x.md", "prompt\n");
  g(["commit", "-q", "-m", "prompts: entrega [LANE-LILA-WRITE]"]);
  const cli = rodarCli(dir, base);
  assert.strictEqual(cli.status, 0, `INTEGRAÇÃO: LILA-WRITE sem entry na âncora aprova (exit ${cli.status})`);
  assert.ok(!String(cli.stderr || "").includes("[V6]"), "INTEGRAÇÃO: V6 não se aplica à LILA-WRITE");
  assert.ok(cli.stdout.includes("LANE-LILA-WRITE"), "INTEGRAÇÃO: rota da lane continua nomeada");
}

// Caso E2 — a isenção é da LILA-WRITE, não do V6: Method aditivo também é
// LILA-WRITE (isento); um diff de docs puro SEM tag cai em LANE-DOCS e segue
// exigindo a entry (coberto por Caso D).
{
  const { dir, g } = novoRepo();
  escrever(g, dir, "docs/A.md", "a\n");
  g(["commit", "-q", "-m", "chore: base"]);
  const base = g(["rev-parse", "HEAD"]);
  escrever(g, dir, "Method/tema/nota-2026-10-19.md", "nota\n");
  g(["commit", "-q", "-m", "docs: nota nova [LANE-LILA-WRITE]"]);
  const cli = rodarCli(dir, base);
  assert.strictEqual(cli.status, 0, `INTEGRAÇÃO: Method aditivo (LILA-WRITE) sem entry aprova (exit ${cli.status})`);
}


// Limpeza garantida dos repos temporários (mesmo se um assert falhar).
process.on("exit", () => {
  for (const d of temporarios) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* limpeza best-effort — nunca falha o teste */
    }
  }
});

console.log("detectar-lane.test.cjs — todos os asserts passaram");

