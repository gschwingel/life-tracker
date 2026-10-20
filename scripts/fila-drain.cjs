#!/usr/bin/env node
// Fila drain — loop de drenagem mecânico (v2; RUNBOOK-FILA-INDIANA §Drenagem).
// Papel: DRENADOR — único escritor de merge enquanto roda (guarda de exclusão abaixo).
// Escopo v2: classificação mss-first (scripts/lib/fila-checks.cjs) — pousa
//   (--drenar) PRs com mss CLEAN/UNSTABLE/BEHIND (strict=false), re-despacha o
//   gate só quando ele está AUSENTE DE VERDADE (família merge-gate|merge-gate-
//   runner ausente do rollup + BLOCKED — playbook C), classifica DIRTY/vermelhos/
//   pendentes. Corrida com o auto-merge ("already merged") = no-op, não falha.
// NÃO faz (fica na skill/agente): resync de DIRTY (playbooks B/O), forense de logs,
//   playbooks invasivos, conteúdo de autor ausente (playbook F).
// v1→v2 (2026-10-06): o rollup eager NÃO expõe o required `merge-gate` (ele nasce
//   autorreportado no merge-ref, E5) — o v1 procurava esse nome em `x.name` e
//   classificava TODO PR pousável como "re-despachar gate" (6 falsos na drenagem
//   de 2026-10-06).
// Uso: node scripts/fila-drain.cjs [--drenar]   (default = dry-run; JSON no stdout;
//      exit 0 drenou/limpo | 1 falha | 2 bloqueado por guarda)
const { execFileSync } = require("child_process");
const { classificarPR } = require("./lib/fila-checks.cjs");

const REPO = "igorlopes000/LilaV2";
const DRENAR = process.argv.includes("--drenar");
const t0 = new Date();
const acoes = [];
const pendentes = [];
const vermelhos = [];
const alarmes = [];

function gh(args, timeout = 90000) {
  try { return { out: execFileSync("gh", args, { timeout, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }) }; }
  catch (e) { return { err: String((e.stderr || "") + e.message).slice(0, 400) }; }
}

// Guarda de exclusão: ninguém mais escrevendo merges agora.
// C3-12 (sweep 2026-10-15): a trava antiga consultava runs do `fila-merge.yml` —
// workflow APOSENTADO no FRAME-FIM-FILA-EAGER-20261006 (arquivo removido no E2), o que
// deixava a guarda em `exit 2` PERMANENTE (ferramenta de emergência morta). No regime
// eager o escritor é o auto-merge do GitHub por PR; a corrida com ele é no-op
// declarada ("already merged"). A exclusão fica garantida por FILA_PAUSADA (freeze
// deliberado) — freeze por ausência de escritor único já não é o modelo.
function guarda() {
  const fv = gh(["api", `repos/${REPO}/actions/variables/FILA_PAUSADA`]);
  if (!fv.err && (JSON.parse(fv.out).value || "").toLowerCase() === "true")
    return "FILA_PAUSADA=true — fila congelada deliberadamente (drenagem humana em curso?)";
  return null;
}

function despachaMergeGate(prNumber) {
  // Disciplina C: base_sha SEMPRE de rev-parse isolado — nunca substituição inline malformada.
  const base = gh(["api", `repos/${REPO}/commits/main`, "--jq", ".sha"]);
  if (base.err) return { erro: base.err.slice(0, 120) };
  // Disciplina C (E5): o check é creditado em GITHUB_SHA do ref despachado —
  // despachar na main credita a MAIN, não o head do PR (igual ao fila-merge.yml:354).
  const headRef = gh(["api", `repos/${REPO}/pulls/${prNumber}`, "--jq", ".head.ref"]);
  if (headRef.err) return { erro: headRef.err.slice(0, 120) };
  const r = gh(["workflow", "run", "merge-gate.yml", "-R", REPO, "--ref", headRef.out.trim(),
    "-f", `pr_number=${prNumber}`, "-f", "base_ref=main", "-f", `base_sha=${base.out.trim()}`]);
  if (r.err) return { erro: r.err.slice(0, 120) };
  return { ok: true, ref: headRef.out.trim(), base_sha: base.out.trim().slice(0, 8) };
}

function main() {
  const bloqueio = guarda();
  if (bloqueio) { console.log(JSON.stringify({ worker: "fila-drain", inicio: t0.toISOString(), bloqueado: bloqueio, acoes, alarmes })); process.exit(2); }

  const prsR = gh(["pr", "list", "-R", REPO, "--state", "open", "--limit", "50",
    "--json", "number,title,headRefName,author,createdAt,mergeStateStatus,statusCheckRollup"]);
  if (prsR.err) { console.log(JSON.stringify({ worker: "fila-drain", erro: prsR.err.slice(0, 200) })); process.exit(1); }
  const prs = JSON.parse(prsR.out);
  if (!prs.length) {
    console.log(JSON.stringify({ worker: "fila-drain", inicio: t0.toISOString(), fim: new Date().toISOString(), modo: DRENAR ? "drenar" : "dry-run", resumo: "fila vazia", acoes, alarmes }));
    process.exit(0);
  }

  for (const p of prs) {
    const v = classificarPR(p);
    const alvo = {
      number: p.number, title: p.title, branch: p.headRefName,
      estado_merge: p.mergeStateStatus, classe: v.classe, motivo: v.motivo,
      checks: v.checks.map((c) => `${c.nome}:${c.estado}`),
    };

    if (v.classe === "DIRTY") { vermelhos.push(alvo); continue; }
    if (v.classe === "POUSAVEL") {
      if (DRENAR) {
        const m = gh(["pr", "merge", String(p.number), "-R", REPO, "--squash", "--delete-branch"]);
        if (m.err && /already merged|not open/i.test(m.err))
          acoes.push(`#${p.number} já pousou (auto-merge venceu a corrida) — no-op`);
        else if (m.err) vermelhos.push({ ...alvo, classe: "VERMELHO", motivo: "merge falhou — ver estado", erro: m.err.slice(0, 150) });
        else acoes.push(`POUSOU #${p.number} (squash) — ${p.title}`);
      } else acoes.push(`[DRY] pousaria #${p.number} — ${p.title}`);
      continue;
    }
    if (v.classe === "REDESPACHAR_GATE") {
      if (DRENAR) {
        const d = despachaMergeGate(p.number);
        if (d.erro) alarmes.push(`#${p.number}: despacho merge-gate falhou: ${d.erro}`);
        else acoes.push(`re-despachou merge-gate para #${p.number} (base ${d.base_sha})`);
      } else acoes.push(`[DRY] re-despacharia merge-gate para #${p.number}`);
      continue;
    }
    if (v.classe === "PENDENTE") { pendentes.push({ ...alvo, nota: v.motivo, pendentes: v.pendentes }); continue; }
    vermelhos.push(alvo); // VERMELHO | ANOMALIA_D | AVALIAR — olho humano/skill
  }

  const resumo = { worker: "fila-drain", inicio: t0.toISOString(), fim: new Date().toISOString(), modo: DRENAR ? "drenar" : "dry-run",
    fila: { abertos: prs.length }, pousos: acoes.filter(a => a.includes("POUSOU")).length,
    acoes, pendentes, vermelhos, alarmes,
    nota: "classificação mss-first (lib/fila-checks): o required `merge-gate` não aparece no rollup eager (E5/merge-ref) — família merge-gate|merge-gate-runner + mergeStateStatus mandam. vermelhos/DIRTY = skill fila-drenagem (playbooks), nunca automáticos" };
  console.log(JSON.stringify(resumo, null, 2));
  process.exit(vermelhos.length ? 1 : 0);
}

if (require.main === module) main();
