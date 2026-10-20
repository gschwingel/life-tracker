#!/usr/bin/env node
// scripts/kf-nos-area-estado.cjs — muda o ESTADO dos nós KF-área no grafo ATIVO (B5/B6).
//
// DESVIO DECLARADO (aprovado no veredito B5/B6 2026-09-14, precedente B1): a mutação é feita por
// script determinístico no worktree, e NÃO pelo MCP lila-grafo-mcp, porque nesta janela o MCP resolve
// root num tree anterior à B1 (sem nós KF-área) — mutar por ali escreveria no estado errado.
// Escrita cirúrgica: localiza a linha do `"id": "<slug>",` e substitui SÓ a linha de `"estado"`
// imediatamente seguinte (diff mínimo, resto do arquivo byte a byte intacto).
//
// Uso: node scripts/kf-nos-area-estado.cjs [--estado ���] [--apply]   (sem --apply = dry-run)
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GRAFO = path.join(ROOT, "LILA-DEV", "planejamento", "grafo.json");
const NOMES = { amarelo: "\u{1F7E1}", vermelho: "\u{1F534}", verde: "\u{1F7E2}" };
const IDS = ["KF-DOC", "KF-INDICES", "KF-TESTES", "KF-GOV", "KF-FERRAMENTAS", "KF-TELEMETRIA", "KF-CHAT", "KF-CONTEXTO", "KF-RITUAIS-PAINEL", "KF-BACKEND", "KF-INTEGRACOES", "KF-ESPECIALISTAS", "KF-MEDIA"];

function parseArgs(argv) {
  const cfg = { estado: "🟡", apply: false, materializado: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--estado") { const v = argv[++i]; cfg.estado = NOMES[v] || v; }
    else if (argv[i] === "--apply") cfg.apply = true;
    else if (argv[i] === "--materializado") cfg.materializado = true;
    else throw new Error("argumento desconhecido: " + argv[i]);
  }
  return cfg;
}

function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(GRAFO)) throw new Error("grafo inexistente: " + GRAFO);
  const linhas = fs.readFileSync(GRAFO, "utf8").split("\n");
  const original = linhas.join("\n");
  const relatorio = [];
  for (const id of IDS) {
    const alvo = '"id": "' + id + '",';
    const i = linhas.findIndex((l) => l.trim() === alvo);
    if (i < 0) throw new Error("no KF-area ausente no grafo: " + id);
    let j = i + 1;
    while (j < linhas.length && !linhas[j].includes('"estado"')) j++;
    if (j >= linhas.length) throw new Error("no sem linha de estado logo apos o id: " + id);
    const lead = linhas[j].match(/^\s*/)[0];
    const cr = linhas[j].endsWith("\r") ? "\r" : "";
    const deM = linhas[j].match(/"estado":\s*"([^"]*)"/);
    const de = deM ? deM[1] : "(nao lido)";
    if (de !== cfg.estado) linhas[j] = lead + '"estado": "' + cfg.estado + '",' + cr;
    const cp = (t) => [...t].map((c) => c.codePointAt(0).toString(16)).join("+");
    if (cfg.materializado) {
      const arquivo = "LILA-DEV/kfs/" + id.toLowerCase() + ".md";
      if (!linhas[j + 1].includes('"snapshot"')) linhas.splice(j + 1, 0, lead + '"snapshot": "' + arquivo + '",' + cr);
      const k = linhas.findIndex((l, ix) => ix > j && l.includes('"nota":'));
      if (k > 0) {
        linhas[k] = linhas[k].replace(/Estado [^;]{0,200}?materializa.{0,200}?emitir [A-Z-]+\.md\./, "Estado 🟡 desde 2026-09-14 (B5): materializado em " + arquivo + " pelo kf-compiler; vira 🟢 no fechamento da B6.");
      }
    }
    relatorio.push({ id, linha: j + 1, de, para: cfg.estado, de_cp: cp(de), para_cp: cp(cfg.estado), muda: de !== cfg.estado });
  }
  const mudancas = relatorio.filter((r) => r.muda).length;
  const houveAlteracao = linhas.join("\n") !== original;
  if (cfg.apply && houveAlteracao) fs.writeFileSync(GRAFO, linhas.join("\n"), "utf8");
  process.stdout.write(JSON.stringify({ ok: true, houve_alteracao: typeof houveAlteracao !== "undefined" ? houveAlteracao : null, apply: cfg.apply, estado_alvo: cfg.estado, mudancas, nos: relatorio }, null, 2) + "\n");
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, erro: e.message }, null, 2) + "\n");
  process.exit(1);
}
