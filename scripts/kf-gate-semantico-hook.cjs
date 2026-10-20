#!/usr/bin/env node
// scripts/kf-gate-semantico-hook.cjs — hook do gate semântico do kf-compiler (FDV-PLAN v7.1 §5 / §3.6).
//
// CONTRATO: o compilador chama `verificar({ kfs })` de forma SÍNCRONA e espera um veredito
// { modelo, prompt_hash, checks, pass }. Como o modelo de qualidade é uma chamada de rede, o desenho
// separa as duas metades: o RUNNER (scripts/kf-gate-semantico-rodar.cjs) consulta o modelo e grava um
// veredito versionado por KF em LILA-DEV/kfs/vereditos/<slug>.json; este HOOK (síncrono) apenas valida
// que existe veredito FRESCO (doc_hash igual ao documento compilado) e devolve pass/fail.
//
// READ-ONLY: nunca escreve KF, nunca corrige conteúdo — correção é sempre a montante (FR/SP + recompile).
// Sem veredito fresco, o KF sai BLOQUEADO (não há 'pass' fabricado).
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VEREDITOS_DIR = process.env.KF_GATE_VEREDITOS || path.resolve(__dirname, "..", "LILA-DEV/kfs/vereditos");
const CHECKS = ["C1", "C2", "C3", "C4", "C5", "C6"];
const ho = (s) => crypto.createHash("sha256").update(String(s).replace(/\r\n/g, "\n")).digest("hex");

function lerVeredito(slug) {
  const p = path.join(VEREDITOS_DIR, slug.toLowerCase() + ".json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return { invalido: true, motivo: "veredito ilegivel: " + e.message };
  }
}

function verificar({ kfs }) {
  const porKf = [];
  for (const kf of kfs) {
    const docHash = ho(kf.doc);
    const v = lerVeredito(kf.slug);
    if (!v) {
      porKf.push({ slug: kf.slug, status: "bloqueado", motivo: "sem veredito versionado em " + VEREDITOS_DIR, doc_hash: docHash });
      continue;
    }
    if (v.invalido) {
      porKf.push({ slug: kf.slug, status: "bloqueado", motivo: v.motivo, doc_hash: docHash });
      continue;
    }
    if (v.doc_hash !== docHash) {
      porKf.push({ slug: kf.slug, status: "bloqueado", motivo: "veredito stale (doc alterado desde o veredito)", doc_hash: docHash, veredito_doc_hash: v.doc_hash });
      continue;
    }
    if (v.status !== "ok") {
      porKf.push({ slug: kf.slug, status: "indisponivel", motivo: v.motivo || "gate semântico não executado", modelo: v.modelo || null, doc_hash: docHash });
      continue;
    }
    const falhas = CHECKS.filter((c) => v.checks && v.checks[c] !== "pass");
    porKf.push({
      slug: kf.slug,
      status: falhas.length ? "fail" : "pass",
      checks: v.checks,
      modelo: v.modelo,
      prompt_hash: v.prompt_hash,
      veredito_em: v.gerado_em,
      doc_hash: docHash,
      falhas,
    });
  }
  // pass SOMENTE quando todos os KFs têm veredito fresco com 6/6 verde — indisponível NAO aprova
  const pass = porKf.every((k) => k.status === "pass");
  const bloqueados = porKf.filter((k) => k.status === "bloqueado").map((k) => k.slug);
  const indisponiveis = porKf.filter((k) => k.status === "indisponivel").map((k) => k.slug);
  const falhou = porKf.filter((k) => k.status === "fail").map((k) => k.slug);
  return {
    modelo: process.env.KF_GATE_MODEL || null,
    prompt_hash: null,
    checks: porKf,
    pass,
    resumo: { bloqueados, indisponiveis, falhou },
    status_geral: pass ? "pass" : (falhou.length ? "fail" : (bloqueados.length ? "bloqueado" : "indisponivel")),
    nota: indisponiveis.length ? "gate semântico INDISPONÍVEL em " + indisponiveis.length + " KF(s) — declarado, nunca fabricado" : "gate semântico versionado",
  };
}

if (require.main === module) {
  process.stdout.write(JSON.stringify({ ok: false, erro: "hook de biblioteca: use --gate-semantico-hook do kf-compiler ou scripts/kf-gate-semantico-rodar.cjs" }, null, 2) + "\n");
  process.exit(2);
}

module.exports = { verificar, CHECKS, VEREDITOS_DIR };
