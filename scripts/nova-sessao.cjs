#!/usr/bin/env node
/**
 * scripts/nova-sessao.cjs
 * FR-SESSAO-ISOLADA-WORKTREE-20260921 -- SP-GUARDS-VALIDADORES / KF-FERRAMENTAS.
 * Decisão Igor 2026-09-21: "o foco total do grafo é leitura de IA" + 7ª camada
 * da arquitetura IA-first — re-leitura de estado fresco vira DEFAULT ESTRUTURAL,
 * não disciplina. Doc canônico: docs/FLUXO-SESSAO-ISOLADA.md.
 *
 * POR QUE ESTE SCRIPT EXISTE
 * O inimigo de dev-IA é trabalhar sobre estado velho confabulado. A abertura de
 * sessão pelo script elimina a classe de erro na origem: a base é SEMPRE
 * origin/main recém-buscado (nunca a main local, que pode estar stale), o
 * GATE-BASE é gravado como fato em .sessao.json, e o ambiente nasce pronto.
 * Antes disso, o fluxo vivia como bloco repetido em templates de prompt
 * (convenção de memória) — exatamente o que a 7ª camada elimina.
 *
 * O QUE FAZ (fases da ABERTURA)
 * 1. fetch origin main (falha explícita se indisponível — nunca segue com base
 *    duvidosa);
 * 2. base = origin/main resolvido pós-fetch;
 * 3. valida a branch: obrigatório "<prefixo>/<tema>" (ex.: zcode/tema,
 *    patch/tema), sem espaços, charset seguro; recusa branch existente;
 * 4. caminho destino (default: ../lila-<tema>): recusa se já existe;
 * 5. `git worktree add -b <branch> <path> <base>`;
 * 6. fixa core.autocrlf=false no config LOCAL do repo (FRAME-LF-CANONICO-20261002:
 *    .gitattributes eol=lf é soberano e autocrlf=true da máquina global já
 *    materializou CRLF em worktree nova e poluiu medições wc -l -c dos
 *    geradores — #1153. Config LOCAL do repo, nunca o global do usuário);
 * 7. grava .sessao.json na sessão: { base (GATE-BASE), branch, tema, criadoEm };
 * 8. roda scripts/bootstrap-worktree.cjs <path> (.env e untracked essenciais);
 * 9. surface da guarda de disciplina (best-effort — sessões abandonadas
 *    aparecem na abertura seguinte; FRAME-LACO-ESTADO-20261002).
 *
 * SAÍDA
 * Resumo com GATE-BASE e próximos passos (npm ci dentro da sessão). Exit 0 |
 * exit 1 (erro acionável, nunca silencioso).
 *
 * USO
 *   npm run sessao:nova -- zcode/tema [--caminho=../lila-tema]
 * Env de teste: LILA_SESSAO_ROOT (raiz do repo), injeção de git/fs nos testes.
 * Sem dependência externa: builtins do Node.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

/** Valida o nome da branch da sessão. Retorna null se válida, erro se não. Pura. */
function validarBranch(nome) {
  if (typeof nome !== "string" || !nome.trim()) return "branch obrigatória (ex.: zcode/tema)";
  if (/\s/.test(nome)) return "branch não pode conter espaços: " + nome;
  if (!nome.includes("/")) return 'branch deve seguir "<prefixo>/<tema>" (ex.: zcode/tema, patch/tema): ' + nome;
  if (nome.startsWith("/") || nome.endsWith("/")) return "prefixo e tema são obrigatórios: " + nome;
  if (/[^A-Za-z0-9._/-]/.test(nome)) return "branch aceita apenas letras, números e . _ / -: " + nome;
  if (nome.includes("..")) return "branch não pode conter '..': " + nome;
  return null;
}

/** Normaliza o tema para o caminho default da worktree. Pura. */
function caminhoDefault(repoRoot, branch) {
  const tema = branch.split("/").pop().replace(/[^A-Za-z0-9._-]/g, "-").toLowerCase();
  return path.join(path.dirname(repoRoot), "lila-" + tema);
}

/**
 * Abre a sessão. `gitExec(args, cwd)` e `execNode(script, args, cwd)` são
 * injetáveis para teste; default executa de verdade. Retorna o resumo.
 */
function abrirSessao({ branch, caminho = null, gitExec, execNode, fsImpl, repoRoot, agora = new Date() }) {
  const erroBranch = validarBranch(branch);
  if (erroBranch) throw new Error(erroBranch);
  const root = path.resolve(repoRoot);

  // 1. fetch — a base vem SEMPRE do remote recém-buscado, nunca da main local.
  gitExec(["fetch", "origin", "main"], root);
  const base = gitExec(["rev-parse", "origin/main"], root).trim();

  // 3. branch não pode existir (sessão é sempre trabalho NOVO sobre base fresca).
  const existeBranch = (() => {
    try { gitExec(["rev-parse", "--verify", "--quiet", "refs/heads/" + branch], root); return true; }
    catch { return false; }
  })();
  if (existeBranch) throw new Error("branch já existe: " + branch + " — sessão exige trabalho novo; use outro tema ou remova a branch antiga");

  // 4. caminho não pode existir.
  const destino = path.resolve(caminho || caminhoDefault(root, branch));
  if (fsImpl.existsSync(destino)) throw new Error("caminho já existe: " + destino);

  // 5. worktree ancorada na base fresca.
  gitExec(["worktree", "add", "-b", branch, destino, base], root);

  // 6. FRAME-LF-CANONICO-20261002: core.autocrlf=false no config LOCAL do repo
  // (compartilhado por todas as worktrees; a main é read-only e já materializa
  // LF via .gitattributes eol=lf, então zero efeito nela). Motivação: autocrlf
  // true global da máquina materializou CRLF em worktree nova e os geradores de
  // índices (wc -l -c) commitaram medições CRLF — o CI (LF) re-media diferente e
  // reprova docs-einv/verificar-indices-commitados (registro: #1153, 2026-10-06).
  gitExec(["config", "core.autocrlf", "false"], root);

  // 7. GATE-BASE como fato gravado (não memória do agente).
  const sessao = { base, branch, tema: branch.split("/").pop(), criadoEm: agora.toISOString() };
  fsImpl.writeFileSync(path.join(destino, ".sessao.json"), JSON.stringify(sessao, null, 2) + "\n");

  // 8. ambiente (untracked essenciais — padrão sentença G6).
  execNode(path.join(root, "scripts", "bootstrap-worktree.cjs"), [destino], root);

  return sessao;
}

/** git real: stdout, nunca interativo. */
function gitReal(args, cwd) {
  return execFileSync("git", ["--no-pager", ...args], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/**
 * Surface da guarda de disciplina na abertura (FRAME-LACO-ESTADO-20261002,
 * decisão Igor 2026-10-02): sessões abandonadas (não-mergeada + dirty + branch
 * > 7d) aparecem NA abertura seguinte — o momento em que alguém diz "continua
 * o X". Best-effort: falha de infraestrutura da guarda avisa, NUNCA bloqueia a
 * abertura (a sessão nova já foi criada quando isto roda). `executar` injetável
 * para teste; default spawn real do verificar-disciplina-sessao.cjs.
 */
function superficiarGuarda(repoRoot, executar) {
  const rodar = executar || ((root) =>
    execFileSync("node", [path.join(root, "scripts", "verificar-disciplina-sessao.cjs")], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }));
  try {
    const saida = String(rodar(repoRoot)).trim();
    if (saida) process.stdout.write("\n--- guarda de disciplina (surface da abertura — achados são alerta, veredito humano) ---\n" + saida + "\n");
    return true;
  } catch (err) {
    const msg = err && err.stdout ? String(err.stdout).trim() : (err && err.message ? err.message : String(err));
    process.stdout.write("\n[aviso] guarda de disciplina indisponível na abertura (best-effort, nunca bloqueia): " + msg.split("\n")[0] + "\n");
    return false;
  }
}

function main(argv) {
  const args = (argv || []).slice();
  const branch = args.find((a) => !a.startsWith("--"));
  const caminhoArg = args.find((a) => a.startsWith("--caminho="));
  if (!branch) {
    process.stderr.write("uso: npm run sessao:nova -- <prefixo>/<tema> [--caminho=<path>]\n");
    return 1;
  }
  const repoRoot = process.env.LILA_SESSAO_ROOT || process.cwd();
  try {
    const sessao = abrirSessao({
      branch,
      caminho: caminhoArg ? caminhoArg.slice("--caminho=".length) : null,
      gitExec: gitReal,
      execNode: (script, a, cwd) => execFileSync("node", [script, ...a], { cwd, encoding: "utf8", stdio: "inherit" }),
      fsImpl: fs,
      repoRoot,
    });
    process.stdout.write([
      "=== sessão isolada aberta ===",
      "  branch:     " + sessao.branch,
      "  GATE-BASE:  " + sessao.base,
      "  .sessao.json gravado na raiz da sessão (cite o GATE-BASE no snapshot/PR).",
      "",
      "próximos passos: cd para a worktree, npm ci, executar o contrato,",
      "fechar com snapshot/log/grafo via MCP + gates locais + PR.",
      "atenção (root dos MCPs lila-*): abra a janela do VS Code NA worktree e rode os servidores",
      "SEM o pin LILA_WORKSPACE_ROOT (ou com o valor = esta worktree) — senão grafo/audit apontam",
      "para a árvore errada (detalhe: docs/FLUXO-SESSAO-ISOLADA.md §2.3).",
    ].join("\n") + "\n");
    superficiarGuarda(repoRoot);
    return 0;
  } catch (err) {
    process.stderr.write("[nova-sessao] ERRO: " + (err && err.message ? err.message : String(err)) + " — falha explícita, nunca silenciosa\n");
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { validarBranch, caminhoDefault, abrirSessao, superficiarGuarda, main };
