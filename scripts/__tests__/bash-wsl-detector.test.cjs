// scripts/__tests__/bash-wsl-detector.test.cjs
// PATCH-FILA-DRENAGEM-WSL-20261004 — fixtures do detector de resolução de bash.
// Incidente 2026-10-04: listener de runner (serviço) + PATH de máquina sem bash
// do Git → `shell: bash` resolve o launcher WSL do System32 → fila morre no spawn.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { analisarBashWsl, resolverBash, expandir } = require("../lib/bash-wsl-detector.cjs");

// Fixture de fs: só "existe" o que estiver neste conjunto. Comparação
// case-insensitive: o NTFS é insensível a caixa e o detector usa fs.existsSync
// real — a fixture replica essa semântica (System32 vs system32 existe igual).
function fsDe(caminhos) {
  const set = new Set(caminhos.map((c) => path.normalize(c).toLowerCase()));
  return (p) => set.has(path.normalize(p).toLowerCase());
}

const BASH_WSL = "C:\\Windows\\System32\\bash.exe";
const BASH_GIT = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";
const ENV_PROTEGIDO = "PATH=C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;C:\\Program Files\\Git\\cmd;C:\\Windows\\system32;...";
const ENV_VAZIO = "";

test("resolverBash: PATH de máquina sem bash do Git cai no WSL (caso real do incidente)", () => {
  // Git\cmd ESTÁ no PATH mas não contém bash.exe — não decide; System32 decide.
  const entries = ["C:\\Windows\\system32", "C:\\Program Files\\Git\\cmd", "C:\\Program Files\\GitHub CLI\\"];
  assert.equal(resolverBash(entries, fsDe([BASH_WSL])), "wsl");
});

test("resolverBash: Git Bash antes do System32 → git-bash (saudável)", () => {
  const entries = ["C:\\Program Files\\Git\\usr\\bin", "C:\\Windows\\system32"];
  assert.equal(resolverBash(entries, fsDe([BASH_GIT, BASH_WSL])), "git-bash");
});

test("resolverBash: %SystemRoot% expande e é reconhecido como diretório Windows", () => {
  const entries = ["%SystemRoot%\\system32", "C:\\Program Files\\Git\\cmd"];
  assert.equal(resolverBash(entries, fsDe([BASH_WSL])), "wsl");
  assert.equal(expandir("%SYSTEMROOT%\\system32"), "C:\\Windows\\system32");
});

test("resolverBash: nenhum bash.exe no PATH → none", () => {
  const entries = ["C:\\Program Files\\Git\\cmd", "C:\\Program Files\\GitHub CLI\\"];
  assert.equal(resolverBash(entries, fsDe([])), "none");
});

test("resolverBash: entrada vazia (;; no PATH) é pulada sem decidir", () => {
  const entries = ["", "C:\\Program Files\\Git\\usr\\bin"];
  assert.equal(resolverBash(entries, fsDe([BASH_GIT])), "git-bash");
});

function analisar(entries, envs, existentes) {
  return analisarBashWsl({ pathEntries: entries, fsExists: fsDe(existentes), runnerEnvs: envs });
}

const REAL = ["C:\\Windows\\system32", "C:\\Program Files\\Git\\cmd"];

test("wsl + nenhum .env → achado vermelho com assinatura do incidente e remediação", () => {
  const r = analisar(REAL, [ENV_VAZIO, ENV_VAZIO, ENV_VAZIO], [BASH_WSL]);
  assert.equal(r.resolucao, "wsl");
  assert.equal(r.protegidos, 0);
  assert.equal(r.total, 3);
  assert.equal(r.achados.length, 1);
  assert.match(r.achados[0], /WSL_E_LOCAL_SYSTEM_NOT_SUPPORTED/);
  assert.match(r.achados[0], /0\/3 runner/);
  assert.match(r.achados[0], /Git\\usr\\bin/); // receita do .env na mensagem
});

test("wsl + proteção parcial → achado nomeia o faltante (2/3)", () => {
  const r = analisar(REAL, [ENV_PROTEGIDO, ENV_VAZIO, ENV_PROTEGIDO], [BASH_WSL]);
  assert.equal(r.protegidos, 2);
  assert.match(r.achados[0], /2\/3 runner/);
});

test("wsl + todos protegidos → achado de 'restart pendente', não de fila morta", () => {
  const r = analisar(REAL, [ENV_PROTEGIDO, ENV_PROTEGIDO, ENV_PROTEGIDO], [BASH_WSL]);
  assert.equal(r.protegidos, 3);
  assert.match(r.achados[0], /APÓS o restart/);
  assert.doesNotMatch(r.achados[0], /morrem no spawn/);
});

test("git-bash resolve → zero achados mesmo com .env vazio", () => {
  const r = analisar(["C:\\Program Files\\Git\\usr\\bin", "C:\\Windows\\system32"], [ENV_VAZIO, ENV_VAZIO, ENV_VAZIO], [BASH_GIT, BASH_WSL]);
  assert.equal(r.resolucao, "git-bash");
  assert.equal(r.achados.length, 0);
});

test("none → achado de bash ausente (não fala em WSL)", () => {
  const r = analisar(["C:\\Program Files\\Git\\cmd"], [ENV_VAZIO], []);
  assert.equal(r.resolucao, "none");
  assert.match(r.achados[0], /nenhum bash.exe/);
  assert.doesNotMatch(r.achados[0], /WSL/);
});

test(".env com referência a Git\\bin (sem usr) também protege", () => {
  const r = analisar(REAL, ["PATH=C:\\Program Files\\Git\\bin;C:\\Windows"], [BASH_WSL]);
  assert.equal(r.protegidos, 1);
});

test(".env com falso candidato não protege (git\\binary não é Git\\bin)", () => {
  const r = analisar(REAL, ["PATH=C:\\tools\\git\\binary;C:\\Windows"], [BASH_WSL]);
  assert.equal(r.protegidos, 0);
});
