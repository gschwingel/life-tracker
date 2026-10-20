#!/usr/bin/env node
// scripts/kf-gate-semantico-rodar.cjs — runner do gate semântico (FDV-PLAN v7.1 §5).
// Consulta o modelo de qualidade (temperatura zero, READ-ONLY) sobre cada KF compilado e grava um
// veredito versionado em LILA-DEV/kfs/vereditos/<slug>.json (modelo, prompt_hash, doc_hash, checks
// C1-C6, pass/fail). Sem OPENROUTER_API_KEY grava 'indisponivel' declarado (nunca pass fabricado).
// Com --apenas-stale só re-avalia KF cujo doc mudou; KF sem mudança mantém o veredito e sai marcado
// no_op (ciclo sem mudanças = no-op declarado). Falha de rede/parse vira status 'erro' do KF.
//
// Uso: node scripts/kf-gate-semantico-rodar.cjs [--kfs <dir>] [--out <dir-vereditos>] [--apenas-stale]
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const CHECKS = ["C1", "C2", "C3", "C4", "C5", "C6"];
const MODELO_PADRAO = "openai/gpt-4o-mini";
const PROMPT_GATE = [
  "Voce e o gate semantico do FDV-PLAN v7.1 (6-checks) sobre um documento KF-AREA compilado.",
  "READ-ONLY: apenas avalie; nunca sugira edicao manual do KF (correcao e a montante: FR/SP + recompile).",
  "Avalie SOMENTE a integridade interna do documento (realidade vs documentacao e do discovery).",
  "Responda em JSON estrito, sem prosa: {\"C1\":\"pass|fail\",\"C2\":\"pass|fail\",\"C3\":\"pass|fail\",\"C4\":\"pass|fail\",\"C5\":\"pass|fail\",\"C6\":\"pass|fail\",\"notas\":{\"C1\":\"...\"}}",
  "C1 completo (as secoes do §3 devem estar PRESENTES — secao sem registros aparece como \"(none)\" POR DESENHO do §3 e isso e CONFORME, nunca violacao; reprove apenas secao AUSENTE ou conteudo corrompido), C2 coeso (sem secao orfa/duplicada), C3 coerente com o particionamento (ESCOPO/FRONTEIRAS), C4 sem contradicao interna, C5 reflete capacidades reais declaradas, C6 gerenciavel (tamanho e granularidade).",
  "IMPORTANTE: secao \"(none)\" e o rendering conforme do §3 para KF sem registros do tipo — reprová-la como \"vazia\" e falso positivo. Falha real: secao ausente, texto corrompido ou conteudo que contradiga o kf-fonte.",
].join("\n");
const promptHash = crypto.createHash("sha256").update(PROMPT_GATE + "|" + MODELO_PADRAO).digest("hex");
const hashDoc = (s) => crypto.createHash("sha256").update(String(s).replace(/\r\n/g, "\n")).digest("hex");

function parseArgs(argv) {
  const cfg = { kfs: path.join(ROOT, "LILA-DEV/kfs"), out: path.join(ROOT, "LILA-DEV/kfs/vereditos"), apenasStale: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--kfs") cfg.kfs = argv[++i];
    else if (argv[i] === "--out") cfg.out = argv[++i];
    else if (argv[i] === "--apenas-stale") cfg.apenasStale = true;
    else throw new Error("argumento desconhecido: " + argv[i]);
  }
  return cfg;
}

function lerAnterior(dir, arquivo) {
  const p = path.join(dir, arquivo.replace(/\.md$/, ".json"));
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

async function avaliarComModelo(doc) {
  const key = process.env.OPENROUTER_API_KEY;
  const modelo = process.env.KF_GATE_MODEL || MODELO_PADRAO;
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      messages: [
        { role: "system", content: PROMPT_GATE },
        { role: "user", content: doc },
      ],
    }),
  });
  if (!resp.ok) throw new Error("OpenRouter HTTP " + resp.status);
  const json = await resp.json();
  const conteudo = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
  const limpo = conteudo.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
  const parsed = JSON.parse(limpo);
  const checks = {};
  for (const c of CHECKS) checks[c] = parsed[c] === "pass" ? "pass" : "fail";
  return { modelo, checks, notas: parsed.notas || null };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(cfg.kfs)) throw new Error("diretorio de KFs inexistente: " + cfg.kfs);
  fs.mkdirSync(cfg.out, { recursive: true });
  const arquivos = fs.readdirSync(cfg.kfs).filter((f) => f.endsWith(".md")).sort();
  const key = process.env.OPENROUTER_API_KEY;
  const geradoEm = new Date().toISOString();
  const saida = [];
  for (const arquivo of arquivos) {
    const slug = arquivo.replace(/\.md$/, "").toUpperCase();
    const doc = fs.readFileSync(path.join(cfg.kfs, arquivo), "utf8");
    const base = { slug, arquivo, doc_hash: hashDoc(doc), prompt_hash: promptHash, gerado_em: geradoEm };
    const anterior = lerAnterior(cfg.out, arquivo);
    let veredito;
    if (cfg.apenasStale && anterior && anterior.doc_hash === base.doc_hash && anterior.status === "ok" && anterior.modelo) {
      veredito = { ...anterior, no_op: true, gerado_em: geradoEm };
    } else if (!key) {
      veredito = { ...base, status: "indisponivel", motivo: "OPENROUTER_API_KEY ausente no ambiente", modelo: null, checks: null, pass: null };
    } else {
      try {
        const r = await avaliarComModelo(doc);
        const falhas = CHECKS.filter((c) => r.checks[c] !== "pass");
        veredito = { ...base, status: "ok", modelo: r.modelo, checks: r.checks, notas: r.notas, pass: falhas.length === 0, falhas };
      } catch (e) {
        veredito = { ...base, status: "erro", motivo: "falha ao consultar o modelo: " + e.message, modelo: MODELO_PADRAO, checks: null, pass: null };
      }
    }
    delete veredito.no_op_anterior;
    fs.writeFileSync(path.join(cfg.out, arquivo.replace(/\.md$/, ".json")), JSON.stringify(veredito, null, 2) + "\n", "utf8");
    saida.push({ slug: veredito.slug, status: veredito.status, pass: veredito.pass, no_op: veredito.no_op === true });
  }
  const noOp = saida.every((s) => s.no_op);
  process.stdout.write(JSON.stringify({ ok: true, kfs: arquivos.length, com_modelo: Boolean(key), apenas_stale: cfg.apenasStale, no_op: noOp, vereditos: saida }, null, 2) + "\n");
  return 0;
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e) => {
    process.stdout.write(JSON.stringify({ ok: false, erro: e.message }, null, 2) + "\n");
    process.exit(1);
  });
}

module.exports = { parseArgs, hashDoc, CHECKS };
