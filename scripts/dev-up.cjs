// scripts/dev-up.cjs
// PATCH-DEV-UP-STACK (2026-09-26) — ferramenta MANUAL de boot da stack visual local:
// Postgres (docker compose) + backend (tsx watch) + frontend (vite), em ordem
// determinística e com falhas loud. NÃO usada por CI, hooks ou outros scripts.
//
// Uso:
//   npm run dev:up        (raiz) — ou: node scripts/dev-up.cjs
//
// Pré-requisitos: .env e backend/.env provisionados manualmente a partir dos
// .env.example correspondentes (este script NUNCA cria/popula .env).
//
// Comportamento:
//   1. pre-flight: .env + backend/.env presentes; portas 4000/5173 livres
//   2. docker compose up -d em backend/ (idempotente) + poll de readiness do
//      Postgres (pg_isready via docker compose exec) com timeout de 60s
//   3. npm run db:migrate em backend/ + verificação SEMÂNTICA do schema aplicado
//      (o exit code do drizzle-kit push não é confiável — ver F-B no commit)
//   4. npm run dev em backend/ e depois na raiz (children em foreground)
//   5. Ctrl+C mata os dois servers; container Postgres permanece de pé (por
//      design) — para derrubá-lo: docker compose down em backend/
//
// Exit 0 = stack no ar (até Ctrl+C); 1 = falha loud (env ausente, porta ocupada,
// compose/migrate erro, schema incompleto, readiness timeout, child morreu).

"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 4000;
const PG_READY_TIMEOUT_MS = 60_000;
const PG_READY_POLL_MS = 1_000;
const PG_USER = "lila";
const PG_DB = "lila_c137";

const TAG = "[dev-up]";

/**
 * Lista de sanidade DEV do banco local (dev sanity list): objetos que o boot
 * precisa ver materializados para a stack ser considerada saudável.
 * Manutenção: acrescente aqui o objeto que faltar — a decisão NUNCA é inferida do
 * exit code do drizzle-kit push (ele retorna 0 mesmo em erro FATAL).
 *
 * Base de evidência (não re-inferir): a lista espelha o que o schema do repo cria
 * de fato — `drizzle.config.ts` aponta para `src/db/schema.ts` (41 pgTable = 41
 * tabelas no banco após o push). `public.accounts` NÃO existe nesse schema e
 * nunca existiu (`git log -S '"accounts"' -- backend/src/db/schema.ts` = vazio):
 * não reintroduzir esse check — ele trava o boot num objeto inexistente.
 */
const CHECKS_MIGRATE = Object.freeze([
  {
    nome: "extensão vector",
    sql: "SELECT count(*) FROM pg_extension WHERE extname = 'vector'",
    valorEsperado: "1",
    causa: "imagem do Postgres sem pgvector (backend/docker-compose.yml deve usar pgvector/pgvector:pg15) " +
      "ou volume com data dir criado antes da init script backend/docker/init/01-extensions.sql",
  },
  {
    nome: "tabela public.sessions",
    sql: "SELECT to_regclass('public.sessions') IS NOT NULL",
    valorEsperado: "t",
    causa: "drizzle-kit push não aplicou o schema (sessions é drizzle-managed; veja a saída do push acima)",
  },
]);

function die(msg) {
  console.error(`${TAG} ${msg}`);
  process.exit(1);
}

// --- pre-flight -------------------------------------------------------------

/** Faltas de provisão de .env (PURA — recebe o predicado de existência). */
function listaEnvFaltando(pares, existe) {
  return pares.filter(({ arquivo }) => !existe(arquivo));
}

function checkEnvFiles() {
  const pares = [
    { arquivo: path.join(ROOT_DIR, ".env"), exemplo: ".env.example" },
    { arquivo: path.join(BACKEND_DIR, ".env"), exemplo: "backend/.env.example" },
  ];
  for (const { arquivo, exemplo } of listaEnvFaltando(pares, (p) => fs.existsSync(p))) {
    die(`.env ausente: ${arquivo}\n` +
        `${TAG} Copie e preencha o exemplo: ${exemplo} → ${path.basename(arquivo)} (provisão manual; este script nunca cria .env).`);
  }
}

/**
 * Testa bind na porta. Resolve true = livre; false = ocupada.
 * Não tenta porta dinâmica — ocupada é falha loud.
 */
function portaLivre(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

async function checkPortas() {
  const alvos = [
    { port: BACKEND_PORT, host: "127.0.0.1", dono: "backend (npm run dev)" },
    { port: FRONTEND_PORT, host: "127.0.0.1", dono: "frontend (vite)" },
  ];
  for (const { port, host, dono } of alvos) {
    if (!(await portaLivre(port, host))) {
      die(`Porta ${port} já ocupada — provável instância anterior de dev:up ainda rodando ` +
          `(${dono}). Encerre o processo dono da porta e rode de novo. Sem fallback de porta dinâmica.`);
    }
  }
}

// --- docker / migrate ---------------------------------------------------------

function composeUp() {
  console.log(`${TAG} docker compose up -d (backend/)`);
  const r = spawnSync("docker", ["compose", "up", "-d"], {
    cwd: BACKEND_DIR,
    stdio: "inherit",
  });
  if (r.error) {
    die(`docker não disponível (${r.error.message}). Docker Desktop rodando?`);
  }
  if (r.status !== 0) {
    die(`docker compose up falhou (exit ${String(r.status)}). ` +
        `Se a porta 5432 estiver ocupada por outro processo/container, encerre-o ou ajuste antes de seguir.`);
  }
}

function esperarPostgres() {
  const inicio = Date.now();
  let tentativas = 0;
  for (;;) {
    tentativas += 1;
    const r = spawnSync(
      "docker",
      ["compose", "exec", "-T", "postgres", "pg_isready", "-U", PG_USER, "-d", PG_DB],
      { cwd: BACKEND_DIR, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
    );
    if (r.status === 0) {
      console.log(`${TAG} Postgres pronto (${tentativas} tentativa(s), ${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
      return;
    }
    if (Date.now() - inicio > PG_READY_TIMEOUT_MS) {
      die(`Timeout (${PG_READY_TIMEOUT_MS / 1000}s) aguardando readiness do Postgres via pg_isready. ` +
          `Verifique 'docker compose ps' em backend/.`);
    }
    // poll com backoff mínimo entre tentativas — sem sleep fixo longo
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PG_READY_POLL_MS);
  }
}

/** Consulta escalar dentro do container (psql, 1 linha, sem TTY). */
function psqlScalar(sql) {
  const r = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", PG_USER, "-d", PG_DB, "-tAc", sql],
    { cwd: BACKEND_DIR, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
  );
  if (r.error) {
    die(`verificação pós-migrate: docker indisponível (${r.error.message}).`);
  }
  if (r.status !== 0) {
    die(`verificação pós-migrate: psql falhou (exit ${String(r.status)}) — ` +
        `${String(r.stderr || "").trim()}\n` +
        `${TAG} Container do Postgres de pé? 'docker compose ps' em backend/.`);
  }
  return String(r.stdout || "").trim();
}

/**
 * Verificação SEMÂNTICA do schema pós-migrate (F-B): o exit code do
 * `drizzle-kit push` não é confiável — ele retorna 0 mesmo em erro FATAL, e foi
 * exatamente assim que a stack subiu anunciada "no ar" com o banco sem
 * `sessions` (runPurge falhava ~60s depois e o health ficava 503).
 */
/**
 * Avalia um check de schema contra o valor observado (PURA). `ok=false` carrega
 * a mensagem canônica do `die` (byte-a-byte a mesma do boot).
 */
function avaliarCheckSchema(check, observado) {
  if (observado === check.valorEsperado) {
    return { ok: true, mensagem: `${TAG} schema ok — ${check.nome}` };
  }
  return {
    ok: false,
    mensagem:
      `schema incompleto — ${check.nome} AUSENTE (esperado "${check.valorEsperado}", observado "${observado}").\n` +
      `${TAG} Causa provável: ${check.causa}.\n` +
      `${TAG} A migração NÃO foi aplicada — a stack não sobe (falha loud, sem falso "no ar").`,
  };
}

function verificarSchema() {
  for (const check of CHECKS_MIGRATE) {
    const { ok, mensagem } = avaliarCheckSchema(check, psqlScalar(check.sql));
    if (!ok) die(mensagem);
    console.log(mensagem);
  }
}

function migrate() {
  console.log(`${TAG} npm run db:migrate (backend/)`);
  const r = spawnSync("npm", ["run", "db:migrate"], {
    cwd: BACKEND_DIR,
    // stdout/stderr capturados porque o gate LÊ o que o drizzle-kit disse; a
    // saída é ecoada logo abaixo (efeito equivalente ao antigo stdio inherit).
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.error) {
    die(`db:migrate não pôde ser executado (${r.error.message}).`);
  }
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const saida = `${String(r.stdout || "")}${String(r.stderr || "")}`;

  // Prompt interativo é a assinatura mais acionável — vem antes do exit code
  // (que no erro de TTY pode ser 1 e viraria mensagem genérica).
  if (/Interactive prompts require a TTY/i.test(saida)) {
    die(`drizzle-kit push parou num PROMPT INTERATIVO (sem TTY) — a migração não foi aplicada.\n` +
        `${TAG} Rode 'npm run db:migrate' manualmente em backend/ num terminal real para ver a pergunta e resolvê-la.`);
  }
  if (r.status !== 0) {
    die(`db:migrate falhou (exit ${String(r.status)}).`);
  }
  verificarSchema();
}

// --- dev servers ---------------------------------------------------------------

const children = [];
let shuttingDown = false;

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try { child.kill("SIGTERM"); } catch { /* já morto */ }
    }
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child);
  process.exit(code);
}

function spawnDev(cwd, label) {
  console.log(`${TAG} subindo ${label} (npm run dev em ${path.relative(ROOT_DIR, cwd) || "."})`);
  const child = spawn("npm", ["run", "dev"], {
    cwd,
    stdio: "inherit",
    // POSIX: grupo próprio p/ kill(-pid) no shutdown; Windows: tree-kill via taskkill /T
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
  });
  children.push(child);
  child.on("error", (err) => {
    console.error(`${TAG} ${label}: falha ao spawnar (${err.message})`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${TAG} ${label}: saiu inesperadamente (code=${String(code)}, signal=${String(signal)}). ` +
        `Encerrando o restante da stack.`);
    shutdown(code === null ? 1 : code);
  });
  return child;
}

function resumo() {
  console.log("");
  console.log(`${TAG} ─── stack local no ar ───────────────────────────────`);
  console.log(`${TAG} frontend:  http://127.0.0.1:${FRONTEND_PORT}`);
  console.log(`${TAG} backend:   http://localhost:${BACKEND_PORT}  (proxy /api já configurado no vite)`);
  console.log(`${TAG} postgres:  localhost:5432 (container lila-c137-db)`);
  console.log(`${TAG} parar:     Ctrl+C aqui encerra backend+frontend;`);
  console.log(`${TAG}            'docker compose down' em backend/ derruba o Postgres.`);
  console.log(`${TAG} ──────────────────────────────────────────────────────`);
}

async function main() {
  checkEnvFiles();
  await checkPortas();
  composeUp();
  esperarPostgres();
  migrate();
  spawnDev(BACKEND_DIR, "backend");
  spawnDev(ROOT_DIR, "frontend");
  resumo();

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));
}

module.exports = {
  checkEnvFiles,
  checkPortas,
  composeUp,
  esperarPostgres,
  migrate,
  spawnDev,
  main,
  // R28-03 (2026-09-28) — núcleo PURO exportado para teste (aditivo; o
  // comportamento do boot é byte-a-byte o mesmo):
  portaLivre,
  listaEnvFaltando,
  avaliarCheckSchema,
  CHECKS_MIGRATE,
};

if (require.main === module) {
  main().catch((err) => die(err && err.stack ? err.stack : String(err)));
}
