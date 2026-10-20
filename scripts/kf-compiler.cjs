#!/usr/bin/env node
// scripts/kf-compiler.cjs — compilador determinístico de KFs-área (Fase A2, fase de estado).
// Normativo: FDV-PLAN v7.1 §3-§5 (LILA-DEV/Canonical/FDV-PLAN.md) + PROTOCOLO-CANONICAL §7.
//
// COMO FUNCIONA
//   Lê a fonte de curadoria (kf-fonte.yaml) + um diretório de registros de decisão (FRs) e
//   materializa UM documento KF-área por KF declarado, em inglês técnico denso, determinístico.
//   O compilador REPORTA violação de gate; nunca corrige, nunca edita a entrada.
//
// USO (não-interativo; stdout é um relatório JSON parseável)
//   node scripts/kf-compiler.cjs --fonte <kf-fonte.yaml> --decisoes <dir> --out <dir-saida>
//   node scripts/kf-compiler.cjs ... --check              (G4: não escreve; reporta stale computado)
//   node scripts/kf-compiler.cjs ... --gate-semantico-hook <modulo.cjs>
//
// EXIT CODES
//   0 = compilado (ou --check fresco) e gates G1..G4 verdes
//   1 = falha de gate — relatório nomeia gate(s) violado(s) e registro(s) responsável(is)
//   2 = erro de uso/parse (CLI inválida, schema malformado, fonte ilegível, git indisponível)
//
// SCHEMA DE ENTRADA — registro de decisão (FR), uma unidade por bloco:
//   A canônica (FDV-PLAN v7.1 §2) define o cartão com 7 campos; o compilador exige ainda a
//   linha de IDENTIDADE (o ID é cunhado na origem/FR — §2 — e precisa existir no texto para
//   que SUPERSEDE seja resolvível) e aceita MOTIVO_SUPERSAO opcional para o tombstone (§3).
//
//     ID: <FR-id>.D<n>                        # identidade estável (obrigatório, único no corpus)
//     DECISAO: <enunciado em uma linha>       # obrigatório
//     TIPO: negocio | tecnica | comportamento # obrigatório (enum)
//     AREA_TATICA: <slug de KF do kf-fonte>   # obrigatório; ÚNICO (duas linhas = split; G1)
//     TOMADA_POR: humano | Lila               # obrigatório (enum)
//     ORIGEM: framework | projeto             # obrigatório (enum; emenda v7.1)
//     SUPERSEDE: <ID> | NENHUMA               # obrigatório (G2 resolve alvos/ciclos)
//     VALIDACAO: teste | gate | observavel    # obrigatório (enum)
//     ESTADO: PRESENTE | PLANEJAMENTO         # OBRIGATÓRIO em toda FR VIVA (v1.3 fail-closed:
//                                             #   deliberate event 2026-09-18, veredito Q1=A).
//                                             #   ISENÇÕES: (i) executora de supersede (SUPERSEDE
//                                             #   != NENHUMA) — metadado de cassação, nunca carrega
//                                             #   ESTADO (D2); (ii) deprecada (cassada por executora)
//                                             #   — tombstone, isenta E vedada de ESTADO (Q2=B).
//                                             #   Valor fora do enum, vazio e duplicidade = exit 2.
//                                             #   NUNCA inferir estado por texto/arquivo/data/tipo.
//                                             #   NUNCA existe ESTADO: SUPERSEDED — supersede é e
//                                             #   permanece representado exclusivamente por SUPERSEDE.
//     MOTIVO_SUPERSAO: contradicao | remocao | evolucao   # opcional (tombstone)
//
//   Convenções do parser (declaradas como referência da migração — Prompt B):
//   - um bloco começa na linha `ID:` e termina antes do próximo `ID:` (ou do fim do arquivo)
//   - valores são de UMA linha; a primeira ocorrência de cada campo vence, EXCETO AREA_TATICA,
//     onde duas ocorrências no mesmo bloco = violação G1 (split obrigatório na escrita), e
//     ESTADO, onde duas ocorrências no mesmo bloco = erro de parse (exit 2, duplicidade)
//   - arquivo com `DECISAO:` fora de bloco `ID:` = parse error (exit 2)
//   - arquivos .md lidos recursivamente; qualquer outro arquivo é ignorado
//
// CONTRATO DE SAÍDA (determinístico — mesma entrada → mesmos bytes)
//   Um arquivo por KF da fonte em <out>/<slug-minúsculo>.md com as seções do FDV-PLAN v7.1 §3:
//     meta {gerado_em, commit_fonte, compilador, hash_fonte, fonte, origem, eixo} | ESCOPO
//     (+FRONTEIRAS) | DECISOES VIGENTES | COMPORTAMENTOS ESPERADOS | PLANEJAMENTO PENDENTE |
//     DECISOES DEPRECADAS (tombstone: executor + motivo + origem + ponteiro) | MAPA DE ARQUIVOS
//   PLANEJAMENTO PENDENTE (B1): recebe apenas registros com ESTADO: PLANEJAMENTO (identificador,
//     declaração, tipo, fonte e metadados; nunca tratado como divergência/tombstone/supersede).
//     Seção CONDICIONAL: emitida SOMENTE quando houver ≥1 entrada — nunca seção vazia.
//     Um PLANEJAMENTO que vira alvo formal de executor entra no tombstone (a cadeia formal de
//     supersede prevalece) e sai do pendente — nunca listado duas vezes.
//   SEM farol em nenhuma seção (estado de execução é propriedade de SP/FR). Seção sem conteúdo
//   sai EXPLÍCITA com "(none)" — nunca omitida (única exceção: PLANEJAMENTO PENDENTE, condicional).
//   Ordenação: KFs pela ordem da fonte; registros por ID crescente (ordem estável, independente
//   da ordem de leitura dos arquivos).
//   PATHS (B1): fonte e MAPA DE ARQUIVOS usam paths RELATIVOS À RAIZ DO REPOSITÓRIO (ex:
//     LILA-DEV/planejamento/migracao/frs-retroativos/FR-....md), com descoberta determinística
//     da raiz (subida até .git; fora de repo git, fallback legado), separador normalizado para
//     "/" — independente do diretório corrente de execução; nunca path absoluto de máquina.
//   `gerado_em` deriva do ÚLTIMO COMMIT da árvore (sem relógio de parede); `hash_fonte` é
//   sha256 sobre fonte + registros normalizados (CRLF→LF) — é o que G4 compara.
//
// CONTRATO DE ESTADO (v1.3 — fail-closed + isenção de tombstones; deliberate event 2026-09-18):
//   FR VIVA (não-executora e não cassada) SEM ESTADO = exit 2 (erro de categoria, pré-gates),
//   nomeando arquivo, linha do bloco e ID — SEM flag de escape (Q1=A veda válvula). FR cassada
//   por executora é ISENTA do requisito e do diagnóstico (simetria exata com a isenção de
//   executoras, D2); ESTADO presente em FR deprecada = exit 2 (erro de categoria — tombstone não
//   carrega estado; Q2=B). O diagnóstico LEGACY_SEM_ESTADO e os campos `diagnosticos` /
//   `legacy_sem_estado` do relatório JSON MORRERAM neste frame (a transição cumpriu propósito):
//   breaking change do schema de saída — os consumidores são os gates deste repo, que usam o
//   exit code, nunca o campo. AUSÊNCIA DE ESTADO NUNCA É REPRESENTADA INTERNAMENTE COMO PRESENTE.
//
// ESTADOS DE FRESCOR (computados na leitura/CI — NUNCA armazenados como campo editável):
//   fresco = hash_fonte gravado no KF == hash calculado da entrada atual
//   stale  = divergiu (G4 bloqueia em `--check`; em compile o KF é reescrito e volta a fresco)
//
// GATE SEMÂNTICO (§3.6) — hook pronto, integração NÃO nesta fase:
//   --gate-semantico-hook <modulo.cjs> deve exportar verificar({kfs}) e devolver veredito
//   (modelo, prompt-hash, checks, pass/fail). O compilador NUNCA chama LLM: sem o flag, o
//   relatório marca `gate_semantico: "nao-integrado"`.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const yaml = require("js-yaml");

const COMPILADOR = "kf-compiler v1.3";
const TIPOS = ["negocio", "tecnica", "comportamento"];
const ESTADOS = ["PRESENTE", "PLANEJAMENTO"];
const TOMADAS = ["humano", "Lila"];
const ORIGENS = ["framework", "projeto"];
const VALIDACOES = ["teste", "gate", "observavel"];
const MOTIVOS = ["contradicao", "remocao", "evolucao"];
const CAMPOS_OBRIGATORIOS = ["DECISAO", "TIPO", "TOMADA_POR", "ORIGEM", "SUPERSEDE", "VALIDACAO"];

class ErroUso extends Error {}

function erroUso(mensagem) {
  return new ErroUso(mensagem);
}

// ── Utilidades ────────────────────────────────────────────────────────────────
function normaliza(texto) {
  return texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function hashFonte(arquivos) {
  const h = crypto.createHash("sha256");
  const ordenados = [...arquivos].sort((x, y) => x.rel.localeCompare(y.rel));
  for (const a of ordenados) {
    h.update(a.rel.replace(/\\/g, "/") + "\n" + normaliza(a.conteudo));
    h.update("\n\u0000\n");
  }
  return h.digest("hex");
}

function commitAtual(cwd) {
  const out = execFileSync("git", ["--no-pager", "log", "-n", "1", "--format=%cI%n%H"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const [data, sha] = out.split("\n");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(data) || !/^[0-9a-f]{7,40}$/.test(sha)) {
    throw erroUso("git retornou commit invalido");
  }
  return { geradoEm: data, sha };
}

function listarArquivos(dir) {
  const out = [];
  const entradas = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listarArquivos(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

// ── Raiz do repositório (B1 — paths repo-relative determinísticos) ────────────
// Descoberta determinística: subida a partir de `dir` até encontrar .git.
// Fora de um repositório git (ex.: fixtures em tmp), devolve null — o chamador
// aplica o fallback legado. Nunca usa cwd nem path absoluto de máquina.
function descobrirRaizRepo(dir) {
  let atual = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(atual, ".git"))) return atual;
    const pai = path.dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

function relRepoRaiz(dir, abs) {
  const raiz = descobrirRaizRepo(dir);
  if (raiz) return path.relative(raiz, abs).replace(/\\/g, "/");
  return path.relative(path.resolve(dir, "..", ".."), abs).replace(/\\/g, "/"); // fallback legado (fora de repo)
}

// ── Fonte de curadoria (kf-fonte.yaml) ────────────────────────────────────────
function carregarFonte(caminho) {
  let doc;
  try {
    doc = yaml.load(fs.readFileSync(caminho, "utf8"));
  } catch (e) {
    throw erroUso("fonte ilegivel ou YAML invalido: " + caminho + " (" + e.message + ")");
  }
  if (!doc || typeof doc !== "object") {
    throw erroUso("fonte vazia ou malformada: " + caminho);
  }
  const kfs = [];
  for (const grupo of ["kfs_padrao", "kfs_produto"]) {
    const lista = doc[grupo];
    if (lista === undefined) continue;
    if (!Array.isArray(lista)) throw erroUso(grupo + " deve ser uma lista de KFs");
    for (const kf of lista) {
      if (!kf || typeof kf !== "object" || typeof kf.slug !== "string" || !kf.slug.trim()) {
        throw erroUso(grupo + ": entrada sem slug");
      }
      kfs.push({
        slug: kf.slug.trim(),
        grupo,
        origem: (kf.origem || "").toString().trim(),
        eixo: (kf.eixo || "").toString().trim(),
        escopo: normaliza((kf.escopo || "").toString()).trim(),
        fronteiras: normaliza((kf.fronteiras || "").toString()).trim(),
      });
    }
  }
  if (kfs.length === 0) throw erroUso("fonte sem KFs declarados (kfs_padrao/kfs_produto vazios)");
  const slugs = new Set();
  for (const kf of kfs) {
    if (slugs.has(kf.slug)) throw erroUso("slug duplicado na fonte: " + kf.slug);
    slugs.add(kf.slug);
  }
  return { kfs, slugs };
}

// ── Registros de decisão (FRs) ────────────────────────────────────────────────
const RE_CAMPO = /^([A-Z_]+):\s*(.*)$/;
// Chaves reconhecidas do cartão (§2 + ID + MOTIVO_SUPERSAO). Chave maiúscula fora desta lista
// é prosa do FR e é IGNORADA pelo parser (nunca vira campo nem quebra a leitura).
const CAMPOS_CONHECIDOS = new Set([
  "ID",
  "DECISAO",
  "TIPO",
  "AREA_TATICA",
  "TOMADA_POR",
  "ORIGEM",
  "SUPERSEDE",
  "VALIDACAO",
  "ESTADO",
  "MOTIVO_SUPERSAO",
]);

function parseArquivo(caminho, rel) {
  const conteudo = normaliza(fs.readFileSync(caminho, "utf8"));
  const linhas = conteudo.split("\n");
  const blocos = [];
  let atual = null;
  let viuDecisaoForaDeBloco = false;
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(RE_CAMPO);
    if (!m) continue;
    const chave = m[1];
    const valor = m[2];
    if (!CAMPOS_CONHECIDOS.has(chave)) continue;
    if (chave === "ID") {
      if (atual) blocos.push(atual);
      atual = { id: valor.trim(), campos: {}, areas: [], estados: [], linha: i + 1, arquivo: rel };
      continue;
    }
    if (!atual) {
      if (chave === "DECISAO") viuDecisaoForaDeBloco = true;
      continue;
    }
    if (chave === "AREA_TATICA") {
      atual.areas.push(valor.trim());
      continue;
    }
    if (chave === "ESTADO") atual.estados.push(valor.trim());
    if (atual.campos[chave] === undefined) atual.campos[chave] = valor.trim();
  }
  if (atual) blocos.push(atual);
  if (viuDecisaoForaDeBloco) {
    throw erroUso(rel + ": DECISAO fora de bloco ID: (registro sem identidade — §2)");
  }
  return blocos;
}

function validarSchema(bloco) {
  if (!bloco.id) throw erroUso(bloco.arquivo + ":" + bloco.linha + ": ID vazio");
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (!bloco.campos[campo]) {
      throw erroUso(bloco.arquivo + ":" + bloco.linha + ": campo obrigatorio ausente: " + campo);
    }
  }
  const enums = [
    ["TIPO", TIPOS],
    ["TOMADA_POR", TOMADAS],
    ["ORIGEM", ORIGENS],
    ["VALIDACAO", VALIDACOES],
  ];
  for (const [campo, permitidos] of enums) {
    if (!permitidos.includes(bloco.campos[campo])) {
      throw erroUso(
        bloco.arquivo + ":" + bloco.linha + ": " + campo + "=" + bloco.campos[campo] +
          " fora do enum (" + permitidos.join(" | ") + ")"
      );
    }
  }
  // ESTADO — enum fechado PRESENTE | PLANEJAMENTO; vazio e duplicidade bloqueiam; executora de
  // supersede NUNCA carrega ESTADO (erro de categoria — D2, frame B1). A obrigatoriedade em FR
  // viva e a vedação em deprecada são corpus-level (validarEstadoCorpus, v1.3): dependem do mapa
  // de cassação, que só existe depois de ler o corpus inteiro.
  if (bloco.estados.length > 1) {
    throw erroUso(
      bloco.arquivo + ":" + bloco.linha + ": ESTADO duplicado (" + bloco.estados.join(", ") +
        ") — uma linha de ESTADO por registro"
    );
  }
  if (bloco.campos.ESTADO !== undefined) {
    const estado = bloco.campos.ESTADO;
    if (!estado) {
      throw erroUso(
        bloco.arquivo + ":" + bloco.linha +
          ": ESTADO vazio — quando a linha existe o valor é obrigatório (PRESENTE | PLANEJAMENTO)"
      );
    }
    if (!ESTADOS.includes(estado)) {
      throw erroUso(
        bloco.arquivo + ":" + bloco.linha + ": ESTADO=" + estado +
          " fora do enum (" + ESTADOS.join(" | ") + ") — SUPERSEDED não existe: supersede é e permanece representado por SUPERSEDE"
      );
    }
    if (bloco.campos.SUPERSEDE && bloco.campos.SUPERSEDE !== "NENHUMA") {
      throw erroUso(
        bloco.arquivo + ":" + bloco.linha + ": ESTADO em registro executora de supersede (SUPERSEDE=" +
          bloco.campos.SUPERSEDE + ") — executora é metadado de cassação, não requisito de estado (frame B1)"
      );
    }
  }
  const motivo = bloco.campos.MOTIVO_SUPERSAO;
  if (motivo && !MOTIVOS.includes(motivo)) {
    throw erroUso(
      bloco.arquivo + ":" + bloco.linha + ": MOTIVO_SUPERSAO=" + motivo +
        " fora do enum (" + MOTIVOS.join(" | ") + ")"
    );
  }
}

function carregarRegistros(dir) {
  if (!fs.existsSync(dir)) throw erroUso("diretorio de registros inexistente: " + dir);
  const arquivos = listarArquivos(dir);
  if (arquivos.length === 0) throw erroUso("nenhum registro .md em: " + dir);
  const registros = [];
  const corpus = [];
  for (const abs of arquivos) {
    const conteudo = fs.readFileSync(abs, "utf8");
    const rel = relRepoRaiz(dir, abs);
    corpus.push({ rel, conteudo });
    for (const bloco of parseArquivo(abs, rel)) {
      validarSchema(bloco);
      registros.push({
        id: bloco.id,
        decisao: bloco.campos.DECISAO,
        tipo: bloco.campos.TIPO,
        areas: bloco.areas,
        area: bloco.areas.length >= 1 ? bloco.areas[0] : null,
        tomadaPor: bloco.campos.TOMADA_POR,
        origem: bloco.campos.ORIGEM,
        supersede: bloco.campos.SUPERSEDE,
        validacao: bloco.campos.VALIDACAO,
        // v1.3: ausência de ESTADO só existe em executora/deprecada (isentas por contrato) —
        // nunca representada internamente como PRESENTE.
        estado: bloco.campos.ESTADO !== undefined ? bloco.campos.ESTADO : null,
        motivoSupersao: bloco.campos.MOTIVO_SUPERSAO || null,
        arquivo: bloco.arquivo,
        linha: bloco.linha,
      });
    }
  }
  return { registros, corpus };
}

// ── Gates mecânicos (todos exaustivos, todos bloqueantes) ─────────────────────
function gateG1(registros, slugs) {
  const violacoes = [];
  for (const r of registros) {
    if (r.areas.length === 0) {
      violacoes.push({
        gate: "G1",
        registro: r.id,
        arquivo: r.arquivo,
        detalhe: "AREA_TATICA ausente — obrigatoria em TODO registro (join key do sistema)",
      });
      continue;
    }
    if (r.areas.length > 1) {
      violacoes.push({
        gate: "G1",
        registro: r.id,
        arquivo: r.arquivo,
        detalhe: "AREA_TATICA duplicada (" + r.areas.join(", ") + ") — split obrigatorio na escrita",
      });
      continue;
    }
    if (!slugs.has(r.area)) {
      violacoes.push({
        gate: "G1",
        registro: r.id,
        arquivo: r.arquivo,
        detalhe: "AREA_TATICA=" + r.area + " fora do particionamento do kf-fonte",
      });
    }
  }
  return violacoes;
}

function gateG2(registros) {
  const violacoes = [];
  const porId = new Map();
  for (const r of registros) {
    if (porId.has(r.id)) {
      violacoes.push({ gate: "G2", registro: r.id, arquivo: r.arquivo, detalhe: "ID duplicado no corpus" });
      continue;
    }
    porId.set(r.id, r);
  }
  const alvo = (r) => (r.supersede && r.supersede !== "NENHUMA" ? r.supersede : null);
  for (const r of registros) {
    const t = alvo(r);
    if (t && !porId.has(t)) {
      violacoes.push({
        gate: "G2",
        registro: r.id,
        arquivo: r.arquivo,
        detalhe: "SUPERSEDE aponta para ID inexistente: " + t,
      });
    }
    if (t === r.id) {
      violacoes.push({ gate: "G2", registro: r.id, arquivo: r.arquivo, detalhe: "SUPERSEDE ciclico (auto-referencia)" });
    }
  }
  const concluido = new Set();
  const cicloReportado = new Set();
  const visitar = (id, pilha) => {
    if (concluido.has(id)) return;
    if (pilha.includes(id)) {
      const ciclo = pilha.slice(pilha.indexOf(id)).concat(id);
      for (const membro of ciclo) {
        if (cicloReportado.has(membro)) continue;
        cicloReportado.add(membro);
        const dono = porId.get(membro);
        violacoes.push({
          gate: "G2",
          registro: membro,
          arquivo: dono ? dono.arquivo : "?",
          detalhe: "SUPERSEDE ciclico: " + ciclo.join(" -> "),
        });
      }
      return;
    }
    const r = porId.get(id);
    if (!r) return;
    const t = alvo(r);
    if (t) visitar(t, pilha.concat(id));
    concluido.add(id);
  };
  for (const r of registros) visitar(r.id, []);
  const executores = new Map();
  for (const r of registros) {
    const t = alvo(r);
    if (!t || !porId.has(t)) continue;
    if (!executores.has(t)) executores.set(t, []);
    executores.get(t).push(r);
  }
  for (const [alvoId, execs] of executores) {
    if (execs.length === 0) {
      violacoes.push({ gate: "G2", registro: alvoId, arquivo: "?", detalhe: "decisao deprecada sem executor declarado" });
    }
  }
  return { violacoes, porId, executores };
}

function slugArquivo(slug) {
  return slug.toLowerCase().replace(/[^a-z0-9.-]+/g, "-") + ".md";
}

function slugArquivoMap(slugs) {
  const m = new Map();
  for (const slug of slugs) m.set(slug, slugArquivo(slug));
  return m;
}

// G4 — frescor: hash_fonte gravado no KF existente vs hash da entrada atual (computado).
function gateG4(outDir, slugs, hashAtual) {
  const achados = [];
  if (!fs.existsSync(outDir)) return { achados, kfsComparados: 0 };
  const esperados = new Set(slugArquivoMap(slugs).values());
  let comparados = 0;
  for (const nome of fs.readdirSync(outDir).sort()) {
    if (!esperados.has(nome)) continue;
    const conteudo = normaliza(fs.readFileSync(path.join(outDir, nome), "utf8"));
    const m = conteudo.match(/^\s*hash_fonte:\s*(\S+)\s*$/m);
    if (!m) continue;
    comparados++;
    if (m[1] !== hashAtual) {
      achados.push({
        gate: "G4",
        registro: nome,
        arquivo: path.join(outDir, nome).replace(/\\/g, "/"),
        detalhe:
          "stale — hash_fonte gravado " + m[1].slice(0, 16) + " != hash da entrada atual " + hashAtual.slice(0, 16),
      });
    }
  }
  return { achados, kfsComparados: comparados };
}

// ── Render determinístico do KF-área (FDV-PLAN v7.1 §3) ──────────────────────
function blocoIndentado(texto) {
  if (!texto) return "  (none)";
  return texto
    .split("\n")
    .map((l) => "  " + l)
    .join("\n");
}

function renderKF(kf, dados) {
  const linhas = [];
  linhas.push("# " + kf.slug + " — KF-AREA (compiled projection; never hand-edited)");
  linhas.push("");
  linhas.push("meta:");
  linhas.push("  gerado_em: " + dados.geradoEm);
  linhas.push("  commit_fonte: " + dados.sha);
  linhas.push("  compilador: " + COMPILADOR);
  linhas.push("  hash_fonte: " + dados.hashFonte);
  linhas.push("  fonte: " + dados.fonteRel);
  linhas.push("  origem: " + (kf.origem || "(none)"));
  linhas.push("  eixo: " + (kf.eixo || "(none)"));
  linhas.push("");
  linhas.push("## ESCOPO");
  linhas.push(blocoIndentado(kf.escopo));
  linhas.push("");
  linhas.push("## FRONTEIRAS");
  linhas.push(blocoIndentado(kf.fronteiras));
  linhas.push("");
  linhas.push("## DECISOES VIGENTES");
  if (dados.vigentes.length === 0) linhas.push("  (none)");
  for (const r of dados.vigentes) {
    linhas.push(
      "- " + r.id + " | tipo: " + r.tipo + " | origem: " + r.origem +
        " | tomada_por: " + r.tomadaPor + " | validacao: " + r.validacao
    );
    linhas.push("  " + r.decisao);
  }
  linhas.push("");
  linhas.push("## COMPORTAMENTOS ESPERADOS");
  if (dados.comportamentos.length === 0) linhas.push("  (none)");
  for (const r of dados.comportamentos) {
    linhas.push("- " + r.id + " | origem: " + r.origem + " | tomada_por: " + r.tomadaPor + " | validacao: " + r.validacao);
    linhas.push("  " + r.decisao);
  }
  linhas.push("");
  // PLANEJAMENTO PENDENTE é CONDICIONAL (B1): só existe quando há ≥1 entrada — nunca seção vazia.
  if (dados.planejamentos.length > 0) {
    linhas.push("## PLANEJAMENTO PENDENTE");
    for (const r of dados.planejamentos) {
      linhas.push(
        "- " + r.id + " | tipo: " + r.tipo + " | origem: " + r.origem +
          " | tomada_por: " + r.tomadaPor + " | validacao: " + r.validacao
      );
      linhas.push("  " + r.decisao);
    }
    linhas.push("");
  }
  linhas.push("## DECISOES DEPRECADAS (tombstone)");
  if (dados.deprecadas.length === 0) linhas.push("  (none)");
  for (const d of dados.deprecadas) {
    linhas.push(
      "- " + d.registro.id +
        " | executor: " + d.executor.id +
        " | motivo: " + (d.executor.motivoSupersao || "(nao declarado)") +
        " | origem: " + d.registro.origem +
        " | morreu_em: " + d.executor.arquivo +
        " | superseded_by: " + d.executor.id
    );
    linhas.push("  " + d.registro.decisao);
  }
  linhas.push("");
  linhas.push("## MAPA DE ARQUIVOS");
  if (dados.mapa.length === 0) linhas.push("  (none)");
  for (const m of dados.mapa) {
    linhas.push(
      "  " + m.arquivo + " | registros: " + m.total + " | vigentes: " + m.vigentes + " | deprecadas: " + m.deprecadas + " | planejamentos: " + m.planejamentos
    );
  }
  linhas.push("");
  return linhas.join("\n");
}

// ── CLI / orquestração ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const cfg = { fonte: null, decisoes: null, out: null, check: false, hook: null, ajuda: false };
  const mapa = { "--fonte": "fonte", "--decisoes": "decisoes", "--out": "out", "--gate-semantico-hook": "hook" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") {
      cfg.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      cfg.ajuda = true;
      continue;
    }
    if (mapa[arg]) {
      const valor = argv[i + 1];
      if (!valor || valor.startsWith("--")) throw erroUso("argumento " + arg + " exige valor");
      cfg[mapa[arg]] = valor;
      i++;
      continue;
    }
    throw erroUso("argumento desconhecido: " + arg);
  }
  if (cfg.ajuda) return cfg;
  for (const campo of ["fonte", "out"]) {
    if (!cfg[campo]) throw erroUso("argumento obrigatorio ausente: --" + campo);
  }
  return cfg;
}

const AJUDA = [
  "Uso: node scripts/kf-compiler.cjs --fonte <kf-fonte.yaml> --decisoes <dir> --out <dir> [--check] [--gate-semantico-hook <modulo.cjs>]",
  "  0 = compilado e gates verdes | 1 = falha de gate | 2 = erro de uso/parse",
].join("\n");

function classificar(registros, executores) {
  const deprecadas = [];
  for (const r of registros) {
    const execs = executores.get(r.id);
    if (execs && execs.length) deprecadas.push({ registro: r, executor: execs[0] });
  }
  return deprecadas;
}

// Fail-closed do ESTADO (v1.3 — deliberate event 2026-09-18: Q1=A fail-closed SEM flag de escape;
// Q2=B tombstones sem ESTADO, deprecadas isentas). Roda ANTES dos gates G1-G4: erro de categoria
// (exit 2) precede violação de gate — mesma precedência do conflito executora×ESTADO (D2).
//   - FR viva (não-executora, não cassada) SEM ESTADO  = exit 2
//   - FR deprecada (cassada por executora) COM ESTADO  = exit 2
//   - executora de supersede                           = isenta (validarSchema já veda ESTADO nela)
// Violações agregadas em UMA mensagem determinística (ordem por ID), nomeando arquivo e bloco.
function validarEstadoCorpus(registros) {
  const alvos = new Map();
  for (const r of registros) {
    if (r.supersede && r.supersede !== "NENHUMA") alvos.set(r.supersede, r.id);
  }
  const erros = [];
  for (const r of registros) {
    if (r.supersede && r.supersede !== "NENHUMA") continue; // executora — isenta
    const executor = alvos.get(r.id);
    if (executor && r.estado !== null) {
      erros.push({
        id: r.id,
        mensagem:
          r.arquivo + ":" + r.linha + ": ESTADO em FR deprecada (ID " + r.id + ", cassada por " +
          executor + ") — deprecada é tombstone: isenta e vedada de ESTADO " +
          "(v1.3, deliberate event 2026-09-18)",
      });
      continue;
    }
    if (!executor && r.estado === null) {
      erros.push({
        id: r.id,
        mensagem:
          r.arquivo + ":" + r.linha + ": ESTADO ausente em FR viva (ID " + r.id +
          ") — fail-closed v1.3: toda FR nao-executora e nao-deprecada exige ESTADO " +
          "(PRESENTE | PLANEJAMENTO), sem flag de escape (deliberate event 2026-09-18)",
      });
    }
  }
  if (erros.length) {
    erros.sort((a, b) => a.id.localeCompare(b.id));
    throw erroUso(erros.map((e) => e.mensagem).join("\n"));
  }
}

function mapaArquivos(registros, idsDeprecados, idsPlanejamento) {
  const porArquivo = new Map();
  for (const r of registros) {
    if (!porArquivo.has(r.arquivo)) {
      porArquivo.set(r.arquivo, { arquivo: r.arquivo, total: 0, vigentes: 0, deprecadas: 0, planejamentos: 0 });
    }
    const item = porArquivo.get(r.arquivo);
    item.total++;
    if (idsDeprecados.has(r.id)) item.deprecadas++;
    else if (idsPlanejamento.has(r.id)) item.planejamentos++;
    else item.vigentes++;
  }
  return [...porArquivo.values()].sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

function resumoGates(violacoesG1, violacoesG2, g4) {
  return [
    { gate: "G1", ok: violacoesG1.length === 0, violacoes: violacoesG1.length },
    { gate: "G2", ok: violacoesG2.length === 0, violacoes: violacoesG2.length },
    { gate: "G3", ok: true, nota: "determinismo verificado por recompilacao (suite: 2x -> diff vazio)" },
    { gate: "G4", ok: g4.achados.length === 0, kfs_comparados: g4.kfsComparados, violacoes: g4.achados.length },
  ];
}

function reportarErro(mensagem) {
  process.stdout.write(JSON.stringify({ ok: false, erro: mensagem, exitCode: 2 }, null, 2) + "\n");
  return 2;
}

function montarDadosPorKF(fonte, registros, commit, hashAtual, fonteRel, deprecadas) {
  // v1.1: registros executor de cassacao (SUPERSEDE -> tombstone) saem de VIGENTES/
  // COMPORTAMENTOS - a informacao ja vive na linha do tombstone (executor/superseded_by).
  const idsExecutores = new Set(
    registros.filter((r) => r.supersede && r.supersede !== "NENHUMA").map((r) => r.id)
  );
  const idsDeprecados = new Set(deprecadas.map((d) => d.registro.id));
  // B1: PLANEJAMENTO não entra em vigentes/comportamentos; se for alvo formal de executor,
  // a cadeia de supersede prevalece (vira tombstone) e sai do pendente — nunca duplicado.
  const idsPlanejamento = new Set(
    registros
      .filter((r) => r.estado === "PLANEJAMENTO" && !idsDeprecados.has(r.id) && !idsExecutores.has(r.id))
      .map((r) => r.id)
  );
  const porArea = new Map();
  for (const slug of fonte.slugs) porArea.set(slug, []);
  for (const r of registros) {
    if (!porArea.has(r.area)) continue; // G1 ja reportou o registro
    porArea.get(r.area).push(r);
  }
  const kfs = [];
  for (const kf of fonte.kfs) {
    const meus = porArea.get(kf.slug) || [];
    const dados = {
      geradoEm: commit.geradoEm,
      sha: commit.sha,
      hashFonte: hashAtual,
      fonteRel,
      // v1.3: FR viva sempre tem ESTADO (fail-closed) — o ramo legado `estado === null` morreu.
      vigentes: meus
        .filter(
          (r) => r.tipo !== "comportamento" && !idsDeprecados.has(r.id) && !idsExecutores.has(r.id) &&
            r.estado === "PRESENTE"
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
      comportamentos: meus
        .filter(
          (r) => r.tipo === "comportamento" && !idsDeprecados.has(r.id) && !idsExecutores.has(r.id) &&
            r.estado === "PRESENTE"
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
      planejamentos: meus
        .filter((r) => r.estado === "PLANEJAMENTO" && !idsDeprecados.has(r.id) && !idsExecutores.has(r.id))
        .sort((a, b) => a.id.localeCompare(b.id)),
      deprecadas: deprecadas.filter((d) => d.registro.area === kf.slug).sort((a, b) => a.registro.id.localeCompare(b.registro.id)),
      mapa: mapaArquivos(meus, idsDeprecados, idsPlanejamento),
    };
    kfs.push({ slug: kf.slug, arquivo: slugArquivo(kf.slug), doc: renderKF(kf, dados), dados });
  }
  return kfs;
}

function executarHook(cfg, kfs) {
  if (!cfg.hook) return { ok: true, veredito: "nao-integrado (hook pronto: --gate-semantico-hook <modulo.cjs>)" };
  const mod = require(path.resolve(cfg.hook));
  if (typeof mod.verificar !== "function") {
    throw erroUso("hook sem export verificar({kfs}) — ver contrato §3.6 no header");
  }
  return { ok: true, veredito: mod.verificar({ kfs: kfs.map((k) => ({ slug: k.slug, arquivo: k.arquivo, doc: k.doc })) }) };
}

function main() {
  let cfg;
  try {
    cfg = parseArgs(process.argv.slice(2));
  } catch (e) {
    return reportarErro(e.message);
  }
  if (cfg.ajuda) {
    process.stdout.write(AJUDA + "\n");
    return 0;
  }
  let fonte;
  let registros;
  let corpus;
  let commit;
  try {
    fonte = carregarFonte(path.resolve(cfg.fonte));
    const lidos = carregarRegistros(path.resolve(cfg.decisoes));
    registros = lidos.registros;
    corpus = lidos.corpus;
    commit = commitAtual(process.cwd());
  } catch (e) {
    return reportarErro(e.message);
  }
  // B1: path da fonte relativo à raiz do repositório (não ao cwd de execução).
  const fonteRel = relRepoRaiz(path.dirname(path.resolve(cfg.fonte)), path.resolve(cfg.fonte));
  const hashAtual = hashFonte([
    { rel: fonteRel, conteudo: fs.readFileSync(path.resolve(cfg.fonte), "utf8") },
    ...corpus,
  ]);

  // v1.3: fail-closed do ESTADO roda ANTES dos gates — erro de categoria (exit 2) prevalece sobre
  // violação de gate. Substitui o canal não-bloqueante LEGACY_SEM_ESTADO do B1 (deliberate event
  // 2026-09-18, Q1=A): sem flag de escape.
  try {
    validarEstadoCorpus(registros);
  } catch (e) {
    return reportarErro(e.message);
  }

  const violacoesG1 = gateG1(registros, fonte.slugs);
  const g2 = gateG2(registros);
  const g4 = gateG4(path.resolve(cfg.out), fonte.slugs, hashAtual);
  const deprecadas = classificar(registros, g2.executores);
  const violacoes = violacoesG1.concat(g2.violacoes);
  if (cfg.check) violacoes.push(...g4.achados);

  if (violacoes.length) {
    const rel = {
      ok: false,
      comando: "node scripts/kf-compiler.cjs",
      compilador: COMPILADOR,
      modo: cfg.check ? "check" : "compile",
      hash_fonte: hashAtual,
      gates: resumoGates(violacoesG1, g2.violacoes, g4),
      violacoes,
      exitCode: 1,
    };
    process.stdout.write(JSON.stringify(rel, null, 2) + "\n");
    return 1;
  }

  const kfs = montarDadosPorKF(fonte, registros, commit, hashAtual, fonteRel, deprecadas);

  let gateSemantico;
  try {
    gateSemantico = executarHook(cfg, kfs).veredito;
  } catch (e) {
    return reportarErro(e.message);
  }

  if (!cfg.check) {
    const outDir = path.resolve(cfg.out);
    fs.mkdirSync(outDir, { recursive: true });
    for (const k of kfs) fs.writeFileSync(path.join(outDir, k.arquivo), k.doc, "utf8");
  }

  const rel = {
    ok: true,
    comando: "node scripts/kf-compiler.cjs",
    compilador: COMPILADOR,
    modo: cfg.check ? "check" : "compile",
    hash_fonte: hashAtual,
    gates: resumoGates(violacoesG1, g2.violacoes, g4),
    kfs: kfs.map((k) => ({
      slug: k.slug,
      arquivo: k.arquivo,
      vigentes: k.dados.vigentes.length,
      comportamentos: k.dados.comportamentos.length,
      planejamentos: k.dados.planejamentos.length,
      deprecadas: k.dados.deprecadas.length,
    })),
    gate_semantico: gateSemantico,
    exitCode: 0,
  };
  process.stdout.write(JSON.stringify(rel, null, 2) + "\n");
  return 0;
}

module.exports = {
  carregarFonte,
  carregarRegistros,
  gateG1,
  gateG2,
  gateG4,
  hashFonte,
  renderKF,
  slugArquivo,
  parseArgs,
  classificar,
  normaliza,
};

if (require.main === module) {
  process.exit(main());
}


