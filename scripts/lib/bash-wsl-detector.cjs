// scripts/lib/bash-wsl-detector.cjs — PATCH-FILA-DRENAGEM-WSL-20261004
// FRAME-FILA-DRENAGEM-SKILL-20261002 · E3 (observabilidade de ambiente do host)
//
// Detector puro da resolução de `bash` no HOST do runner. Incidente 2026-10-04:
// o listener `lila-local-fila` reiniciou como serviço (evento 7045) num PATH de
// máquina sem nenhum diretório de bash do Git — o `shell: bash` do GitHub Actions
// resolve `bash` pelo PATH e cai no launcher do WSL (`C:\Windows\system32\bash.exe`),
// que se recusa a rodar como LocalSystem (WSL_E_LOCAL_SYSTEM_NOT_SUPPORTED). Todo
// round da fila morria NO SPAWN do shell, antes de executar qualquer script.
//
// Regra de resolução replicada (por ORDEM do PATH): o primeiro diretório que
// CONTÉM bash.exe decide. `Git\cmd` está no PATH mas NÃO contém bash.exe — não
// decide. Se o primeiro com bash.exe é diretório do Windows → WSL vence.
// Mitigação canônica: `.env` na raiz de cada runner (lido no start do Listener)
// com PATH=Git\usr\bin;Git\bin;Git\cmd;<PATH de máquina> + restart do serviço.
//
// Puro: nenhuma I/O — pathEntries, fsExists e runnerEnvs vêm de fora (o CLI lê
// registro e arquivos; o teste injeta fixtures). Fora de Windows (sem registro)
// o CLI simplesmente não alimenta o detector — mudo, nunca falso positivo.
"use strict";

const path = require("path");

// Diretório do Windows: o bash.exe de lá é o launcher do WSL, não um bash real.
const WINDOWS_DIR = /[\\/]windows(?:[\\/]|$)/i;
// Referência a Git Bash dentro de um conteúdo de .env (Git\bin ou Git\usr\bin).
// O lookahead aceita o ';' do PATH (entrada no meio da string) e rejeita
// 'git\binary' (bin seguido de letra não é o diretório bin).
const GIT_BASH_REF = /[\\/]git[\\/](?:usr[\\/])?bin(?=[\\/;]|$)/i;

function expandir(entry) {
  return entry
    .trim()
    .replace(/%SystemRoot%/gi, "C:\\Windows")
    .replace(/%SYSTEMROOT%/gi, "C:\\Windows");
}

// "git-bash" | "wsl" | "none" — pela ORDEM das entradas do PATH de máquina.
function resolverBash(pathEntries, fsExists) {
  for (const raw of pathEntries) {
    const entry = expandir(raw);
    if (!entry || !fsExists(path.join(entry, "bash.exe"))) continue;
    if (WINDOWS_DIR.test(entry)) return "wsl";
    return "git-bash";
  }
  return "none";
}

function analisarBashWsl({ pathEntries, fsExists, runnerEnvs }) {
  const achados = [];
  const resolucao = resolverBash(pathEntries, fsExists);
  const protegidos = runnerEnvs.filter((t) => t && GIT_BASH_REF.test(t)).length;
  const total = runnerEnvs.length;

  if (resolucao === "git-bash") return { resolucao, protegidos, total, achados };

  if (resolucao === "none") {
    achados.push(
      "nenhum bash.exe no PATH de máquina — steps 'shell: bash' do host falham no spawn; adicionar Git Bash ao PATH ou .env nos runners",
    );
    return { resolucao, protegidos, total, achados };
  }

  // resolucao === "wsl"
  if (protegidos < total) {
    achados.push(
      `shell: bash do host resolve WSL (System32\\bash.exe) — rounds da fila morrem no spawn ` +
        `(WSL_E_LOCAL_SYSTEM_NOT_SUPPORTED); ${protegidos}/${total} runner(s) protegido(s) via .env — ` +
        "completar o .env (PATH=C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;C:\\Program Files\\Git\\cmd;<PATH de máquina>) " +
        "nos demais e reiniciar os serviços dos runners (admin)",
    );
  } else {
    achados.push(
      "shell: bash do host resolve WSL; runners protegidos via .env — protege APÓS o restart " +
        "dos serviços; listener em memória pode carregar ambiente velho (reiniciar para valer)",
    );
  }
  return { resolucao, protegidos, total, achados };
}

module.exports = { analisarBashWsl, resolverBash, expandir };
