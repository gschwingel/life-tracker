#!/usr/bin/env node
/**
 * scripts/verificar-pontos-cegos.cjs
 * Proposito: VARREDURA DIARIA dos pontos cegos que o padrao de PR nao pega.
 *
 * O padrao de PR (~50/dia) cobre frescor de indices/manifest/docs, grafo,
 * vivacidade de crons e gate semantico de KFs (pr-gate, gates-grafo, crons do
 * repo). O que nenhum gate per-PR ve:
 *   (1) verificadores de LILA-DEV orfaos de automacao (nada os dispara);
 *   (2) pin_rule do charter (.zcode/charter vs heads dos FDVs) — zero automacao;
 *   (3) integridade referencial docs->codigo e docs->docs (links/paths mortos);
 *   (4) rot de scripts (script sem chamador E sem self-test apodrece em silencio).
 * Drift cumulativo entre PRs pequenos e individualmente "limpos" e o alvo.
 *
 * Natureza: SOMENTE LEITURA (mesmo contrato do verificar-5s). Nenhuma correcao.
 * O veredito semantico e do humano/ciclo de patch. Este script agrega — nao
 * duplica — os verificadores existentes.
 *
 * Secoes:
 *   A. Verificadores orfaos (spawn read-only):
 *      A1 verificar-sintese.cjs            (todas as areas)
 *      A2 verificar-divida-patch.cjs       (idade > 30 dias = vermelho)
 *      A3 verificar-alinhamento-vetorial.cjs --so-estrutural (offline, sem custo)
 *      A4 verificar-contratos.cjs          — PULADO por desenho: sem --files e
 *        consulta vazia (exit 0 sempre); e gate de patch, nao de varredura.
 *   B. pin_rule do charter: derived_from (v2.x mais recente, ignora superseded)
 *      vs versao declarada no head de cada FDV citado.
 *   C. Integridade referencial: paths backtickados enraizados no repo + links
 *      .md relativos, em docs/** e LILA-DEV/**. Areas append-only/historicas
 *      (historico, planejamento, logs, evidencias, registry) citam o passado
 *      por design — ref morta ali e AVISO, nao vermelho.
 *   D. Rot de scripts: sem referencia em package.json/.github/scripts/docs E
 *      sem self-test -> aviso (falso positivo admissivel: ferramenta ad-hoc).
 *   E. Gramatica AI-IAIA (COBRANCA DURA desde 2026-09-29): meta line na linha 1
 *      + chaves fixas + paridade meta↔header + prosa >2 frases nos docs
 *      AI-facing com gravacao governada (docs/AI-IAIA-GRAMMAR.md §2/§4.1/§5).
 *      Desvio = vermelho (§6: "gates prove structure, not conception" — o
 *      veredito semantico fica com humano/ciclo estrutural).
 *
 * Saida:  relatorio por secao + sumario de severidades (stdout)
 * Erros:  exit 1 se houver VERMELHO (acao de patch necessaria)
 *         exit 0 se limpo ou somente avisos
 * Flags:  --verbose   inclui caudas de output dos verificadores e itens aviso
 *         --help      uso
 * Testes: scripts/__tests__/verificar-pontos-cegos.test.cjs (node --test)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Uso: node scripts/verificar-pontos-cegos.cjs [--verbose]');
  console.log('  Varredura read-only dos pontos cegos fora do padrao de PR:');
  console.log('  A) verificadores orfaos | B) pin_rule charter vs FDVs |');
  console.log('  C) refs mortas docs/LILA-DEV | D) rot de scripts');
  console.log('Exit: 0 = limpo/so avisos | 1 = vermelho (patch necessario)');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers puros (exportados para testes)
// ---------------------------------------------------------------------------

/** Deriva pins "FDV-<nome> v<N>" da linha derived_from do charter. */
function parsePinsCharter(texto) {
  const linha = (texto || '')
    .split(/\r?\n/)
    .find((l) => l.startsWith('derived_from:'));
  if (!linha) return { pins: [], erro: 'linha derived_from ausente' };
  const pins = [];
  for (const parte of linha.replace(/^derived_from:\s*/, '').split('|')) {
    const m = /FDV-([A-Za-z0-9-]+)\s+v(\d+)/.exec(parte);
    if (m) pins.push({ nome: m[1], versao: Number(m[2]) });
  }
  if (pins.length === 0) return { pins: [], erro: 'nenhum pin FDV-<nome> v<N> na linha' };
  return { pins, erro: null };
}

/** Versao declarada no head do FDV (padrao "# FDV-E v32" / "# FDV-Principal v33"). */
function extrairVersaoFdv(texto, nome) {
  const head = (texto || '').split(/\r?\n/).slice(0, 30).join('\n');
  const m = new RegExp(`FDV-${nome}\\s+v(\\d+)`).exec(head);
  return m ? Number(m[1]) : null;
}

/** Remove blocos de codigo cercados (``` ... ```), preservando o resto. */
function stripFences(texto) {
  return (texto || '').replace(/^```[\s\S]*?^```/gm, '');
}

const PREFIXOS_REPO = ['src/', 'scripts/', 'docs/', 'backend/', '.github/', 'LILA-DEV/', '.zcode/', 'public/'];
const EXTensoes = /\.(cjs|mjs|js|jsx|ts|tsx|json|md|ya?ml|sh|ps1|sql|html|css)$/;

/** Refs backtickadas que parecem caminhos enraizados no repo (candidatas a
 *  verificacao de existencia). Whitelist de prefixo corta falso positivo. */
function extrairRefsRepo(texto) {
  const refs = [];
  const spans = stripFences(texto).match(/`([^`\n]+)`/g) || [];
  for (const span of spans) {
    const ref = span.slice(1, -1).trim();
    if (ref.length === 0 || ref.length > 200) continue;
    if (/\s/.test(ref) || ref.includes('..')) continue;
    // Globs e placeholders ("FDV-*.md", "fix-{alvo}-{acao}.cjs") nao sao caminhos.
    if (/[*{}<>]/.test(ref)) continue;
    if (!EXTensoes.test(ref) || !ref.includes('/')) continue;
    if (!PREFIXOS_REPO.some((p) => ref.startsWith(p))) continue;
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

/** Links .md relativos em markdown: [texto](./caminho.md) — retorna os alvos
 *  crus (resolucao relativa ao dir do arquivo fica a cargo do chamador). */
function extrairLinksMd(texto) {
  const alvos = [];
  const matches = stripFences(texto).match(/\]\(([^)#\s]+\.md)(#[^)\s]*)?\)/g) || [];
  for (const m of matches) {
    const alvo = m.slice(2, -1).split('#')[0].trim();
    if (/^[a-z]+:/i.test(alvo) || alvo.includes('..')) continue; // url absoluta/escapada
    if (!alvos.includes(alvo)) alvos.push(alvo);
  }
  return alvos;
}

/** D (rot): vivo = referenciado em algum lugar; orfao-testado = sem chamador
 *  mas com self-test; orfao-sem-teste = nada garante que ainda roda. */
function classificarRot({ referenciado, temTeste }) {
  if (referenciado) return 'vivo';
  return temTeste ? 'orfao-testado' : 'orfao-sem-teste';
}

// ---------------------------------------------------------------------------
// Seletores de estado (leitura)
// ---------------------------------------------------------------------------

function charterMaisRecente() {
  const dir = path.join(REPO_ROOT, '.zcode', 'charter');
  const arquivos = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const candidatos = [];
  for (const a of arquivos) {
    if (/superseded/i.test(a)) continue;
    const m = /ZCODE-BRACO-CHARTER-v(\d+)\.(\d+)\.md$/.exec(a);
    if (m) candidatos.push({ arquivo: a, maior: Number(m[1]), menor: Number(m[2]) });
  }
  if (candidatos.length === 0) return null;
  candidatos.sort((x, y) => y.maior - x.maior || y.menor - x.menor);
  return path.join(dir, candidatos[0].arquivo);
}

/** Arquivos markdown escaneaveis: docs/** e LILA-DEV/** (md apenas). */
function arquivosMarkdown() {
  const raizes = ['docs', 'LILA-DEV'];
  const fora = [];
  function caminhar(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const cheio = path.join(dir, entrada.name);
      const rel = path.relative(REPO_ROOT, cheio).replace(/\\/g, '/');
      if (entrada.isDirectory()) {
        if (/node_modules|\.git$/.test(entrada.name)) continue;
        caminhar(cheio);
      } else if (/\.md$/i.test(entrada.name)) {
        fora.push(rel);
      }
    }
  }
  for (const r of raizes) {
    const cheio = path.join(REPO_ROOT, r);
    if (fs.existsSync(cheio)) caminhar(cheio);
  }
  return fora;
}

/** Areas append-only/historicas: ref morta ali e esperada (citam o passado). */
function eAreaHistorica(relPath) {
  return (
    /LILA-DEV\/historico\//.test(relPath) ||
    /LILA-DEV\/planejamento\//.test(relPath) ||
    /LILA-DEV\/execucao\/logs/.test(relPath) ||
    /LILA-DEV\/execucao\/evidencias\//.test(relPath) ||
    /LILA-DEV\/execucao\/auditorias\//.test(relPath) || // registros de auditoria = histórico point-in-time por design (decisão Igor 2026-09-26)
    /LILA-DEV\/auditorias\//.test(relPath) || // idem — auditorias T0 read-only transcrevem ponteiros mortos como evidencia do achado (PATCH-REMEDIACAO-HOMEOSTASE-20261016; reescrever = falsificar historia)
    // D3 do item 4.7 (PATCH-REMEDIACAO-HOMEOSTASE-20261016, decisao aplicada 2026-10-16): LILA-DEV/validacao/
    // e area LOCAL gitignored (.gitignore:30) — evidencias gate-lote-*.json + rascunhos de PR body. O scanner
    // anda no FILESYSTEM (nao respeita .gitignore), entao num checkout limpo do CI a area nem existe e o gate
    // da C=0; na maquina do operador ela existe e gerava 23 refs "mortas" (rascunhos citando arquivos ja
    // removidos do repo). Vermelho que so existe na maquina de quem roda = falso positivo por construcao —
    // mesma classe do HB-060. Ref morta aqui e informativa, nunca vermelha.
    /LILA-DEV\/validacao\//.test(relPath) ||
    /registry/i.test(path.basename(relPath))
  );
}

// ---------------------------------------------------------------------------
// Secoes
// ---------------------------------------------------------------------------

function rodarVerificador(script, args, timeoutMs) {
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', script), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const saida = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status === null) return { estado: 'nao-verificado', saida };
  // Exit 3 = guarda "NÃO-VERIFICADO" do verificador (ex.: pointer LFS não materializado).
  if (r.status === 3) return { estado: 'nao-verificado', saida };
  if (r.status !== 0) return { estado: 'vermelho', saida };
  return { estado: 'ok', saida };
}

function secaoA(resultado) {
  console.log('\n== A. Verificadores orfaos de automacao ==');
  const alvos = [
    { nome: 'verificar-sintese.cjs', args: [], timeoutMs: 60000 },
    { nome: 'verificar-divida-patch.cjs', args: [], timeoutMs: 60000 },
    { nome: 'verificar-alinhamento-vetorial.cjs', args: ['--so-estrutural'], timeoutMs: 120000 },
  ];
  for (const alvo of alvos) {
    const r = rodarVerificador(alvo.nome, alvo.args, alvo.timeoutMs);
    const icone = r.estado === 'ok' ? '✅' : r.estado === 'vermelho' ? '🔴' : '⚠️ ';
    console.log(`${icone} A · ${alvo.nome} ${alvo.args.join(' ')} → ${r.estado}`);
    if (r.estado !== 'ok' && (VERBOSE || r.estado === 'vermelho')) {
      const cauda = r.saida.split(/\r?\n/).slice(-12).join('\n');
      if (cauda) console.log('   | ' + cauda.split('\n').join('\n   | '));
    }
    resultado.secoes.push({ secao: 'A', alvo: alvo.nome, estado: r.estado });
  }
  console.log('   (A5 verificar-contratos pulado por desenho — gate de patch, precisa --files)');
}

function secaoB(resultado) {
  console.log('\n== B. pin_rule do charter vs FDVs ==');
  const charterPath = charterMaisRecente();
  if (!charterPath) {
    console.log('⚠️  B · nenhum ZCODE-BRACO-CHARTER-v*.md em .zcode/charter/');
    resultado.secoes.push({ secao: 'B', estado: 'aviso', detalhe: 'charter ausente' });
    return;
  }
  const charter = fs.readFileSync(charterPath, 'utf8');
  const { pins, erro } = parsePinsCharter(charter);
  if (erro) {
    console.log(`🔴 B · charter ${path.basename(charterPath)}: ${erro}`);
    resultado.secoes.push({ secao: 'B', estado: 'vermelho', detalhe: erro });
    return;
  }
  for (const pin of pins) {
    const fdvPath = path.join(REPO_ROOT, 'src', 'prompts', 'Canonical', `FDV-${pin.nome}.md`);
    if (!fs.existsSync(fdvPath)) {
      console.log(`🔴 B · FDV-${pin.nome}.md AUSENTE (pin declara v${pin.versao})`);
      resultado.secoes.push({ secao: 'B', estado: 'vermelho', detalhe: `${pin.nome}: arquivo ausente` });
      continue;
    }
    const declarada = extrairVersaoFdv(fs.readFileSync(fdvPath, 'utf8'), pin.nome);
    if (declarada === null) {
      console.log(`⚠️  B · FDV-${pin.nome}: pin v${pin.versao}, mas versao nao declarada no head`);
      resultado.secoes.push({ secao: 'B', estado: 'aviso', detalhe: `${pin.nome}: versao nao declarada` });
    } else if (declarada !== pin.versao) {
      console.log(`🔴 B · FDV-${pin.nome}: pin v${pin.versao} ≠ declarada v${declarada} — charter stale`);
      resultado.secoes.push({ secao: 'B', estado: 'vermelho', detalhe: `${pin.nome}: pin v${pin.versao} ≠ v${declarada}` });
    } else {
      console.log(`✅ B · FDV-${pin.nome} v${declarada} = pin`);
    }
  }
}

function secaoC(resultado) {
  console.log('\n== C. Integridade referencial docs/LILA-DEV → repo ==');
  const vermelhos = [];
  const avisos = [];
  for (const rel of arquivosMarkdown()) {
    let texto;
    try {
      texto = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    const historica = eAreaHistorica(rel);
    for (const ref of extrairRefsRepo(texto)) {
      if (!fs.existsSync(path.join(REPO_ROOT, ref))) {
        (historica ? avisos : vermelhos).push({ arquivo: rel, tipo: 'path', ref });
      }
    }
    const dir = path.dirname(path.join(REPO_ROOT, rel));
    for (const alvo of extrairLinksMd(texto)) {
      if (!fs.existsSync(path.resolve(dir, alvo))) {
        (historica ? avisos : vermelhos).push({ arquivo: rel, tipo: 'link', ref: alvo });
      }
    }
  }
  console.log(`🔴 C · ${vermelhos.length} ref(s) morta(s) em area presente` + (vermelhos.length === 0 ? ' (nenhuma)' : ''));
  for (const v of vermelhos.slice(0, VERBOSE ? vermelhos.length : 20)) {
    console.log(`   [${v.tipo}] ${v.arquivo} → ${v.ref}`);
  }
  if (!VERBOSE && vermelhos.length > 20) console.log(`   ... +${vermelhos.length - 20} (use --verbose)`);
  console.log(`⚠️  C · ${avisos.length} ref(s) morta(s) em area append-only/historica (informativo)`);
  if (VERBOSE) for (const a of avisos) console.log(`   [${a.tipo}] ${a.arquivo} → ${a.ref}`);
  resultado.secoes.push({ secao: 'C', vermelhos: vermelhos.length, avisos: avisos.length });
}

function secaoD(resultado) {
  console.log('\n== D. Rot de scripts (sem chamador E sem self-test) ==');
  // Allowlist — ad-hoc intencional, curadoria Igor 2026-09-26 (decisão por script,
  // Sessão de Metacognição 2026-09-26): mantidos sem chamador/self-test por design.
  // Poda FRAME-PURGA-INATIVOS-20261006 (mandato Igor 2026-10-06: aposentar
  // inativos): saíram da allowlist E do disco — auditar-reasoning-efforts,
  // buscar-modelo, buscar-qi, enriquecer-codigo, inspect-model, inspect-qi,
  // limpeza-l2-snapshots-camara (one-off já aplicado).
  const ROT_IGNORAR = new Set([
    'kf-nos-area-estado.cjs',
    'rotate-encryption-key.cjs',
    // gerador do corpus de calibração da sonda semântica (#909) — re-runda na
    // próxima calibração (curadoria Igor 2026-10-01, lote painel vital P5).
    'gera-fixtures-calibracao.cjs',
  ]);
  const dirScripts = path.join(REPO_ROOT, 'scripts');
  const scripts = fs
    .readdirSync(dirScripts)
    .filter((f) => /\.(cjs|mjs|js)$/.test(f));
  const pkg = fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8');
  let conteudoRef = pkg;
  const wfDir = path.join(REPO_ROOT, '.github', 'workflows');
  if (fs.existsSync(wfDir)) {
    for (const w of fs.readdirSync(wfDir)) conteudoRef += fs.readFileSync(path.join(wfDir, w), 'utf8');
  }
  for (const s of scripts) {
    if (s === path.basename(__filename)) continue;
    try {
      conteudoRef += fs.readFileSync(path.join(dirScripts, s), 'utf8');
    } catch {
      /* ilegivel: tratado como nao-referenciado */
    }
  }
  const rotos = [];
  for (const s of scripts) {
    if (ROT_IGNORAR.has(s)) continue;
    const base = path.basename(s, path.extname(s));
    const nome = path.basename(s);
    const testes = fs.existsSync(path.join(dirScripts, '__tests__'))
      ? fs.readdirSync(path.join(dirScripts, '__tests__'))
      : [];
    const temTeste = testes.some((t) => t.startsWith(`${base}.test.`));
    // Auto-referencia no proprio header nao conta como chamador.
    const corpo = fs.readFileSync(path.join(dirScripts, s), 'utf8');
    const outrosRef = conteudoRef.replace(corpo, '').includes(nome);
    const classe = classificarRot({ referenciado: outrosRef, temTeste });
    if (classe === 'orfao-sem-teste') rotos.push(nome);
  }
  if (rotos.length === 0) {
    console.log('✅ D · nenhum script orfao sem self-test');
  } else {
    console.log(`⚠️  D · ${rotos.length} script(s) sem chamador e sem self-test (revisar se ainda vive):`);
    for (const r of rotos) console.log(`   - ${r}`);
  }
  resultado.secoes.push({ secao: 'D', rotos: rotos.length });
}

// Secao E — conformidade estrutural da gramatica AI-IAIA (COBRANCA DURA, flip 2026-09-29)
// v2.0 (FR-AIFIRST-GRAMMAR-V2-N01): lista hardcoded de 9 docs substituida pela regra
// geral — escopo governado (grammar §7) menos lista de isencao; marcador
// audience=human = leitura humana (isento do teto de prosa; header segue obrigatorio).

const META_CHAVES_FIXAS = ['format', 'audience', 'human_readable', 'density', 'prose', 'version', 'last_update', 'status', 'path'];

/** Chaves da meta line em ordem, cobrindo tambem key=value com espacos. */
function chavesMeta(linha) {
  const corpo = linha.replace(/^meta:\s*/, '');
  const chaves = [];
  for (const parte of corpo.split('|')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(parte);
    if (m) chaves.push(m[1]);
  }
  return chaves;
}

/**
 * Isencoes da grammar §7 (v2.1.0): constituição human-auditada PT (SP-D3), gerados
 * (SP-D4) e o índice do MANIFEST. Os 11 docs/ humanos provisionais saíram da lista
 * em FR-AIFIRST-DOCS-CLASS-N01 — reclassificados com meta line explícita
 * (audience=human × audience=AI).
 * Entrada exata (arquivo) ou prefixo de diretorio (termina em "/").
 */
const ISENCOES_IAIA = [
  'docs/AI-PROJECT-MANIFEST-INDEX.md',
  'docs/README.md',
  'LILA-DEV/FDV-DEV.md',
  'LILA-DEV/FDV-EXEC.md',
  'LILA-DEV/FDV-PATCH.md',
  'LILA-DEV/FDV-PLAN.md',
  'LILA-DEV/INDICES.md',
  'LILA-DEV/PROTOCOLO-CANONICAL.md',
  'LILA-DEV/PROTOCOLO-INDICES.md',
  'LILA-DEV/PROTOCOLO-TRANSVERSAL.md',
  'LILA-DEV/README-DEV-AI.md',
  'LILA-DEV/Canonical/',
  'LILA-DEV/kfs/',
];

/** Teste de isencao (puro): caminho relativo ao repo, separadores normalizados p/ "/". */
function eIsentoIAIA(caminhoRel) {
  const norm = caminhoRel.split(path.sep).join('/');
  return ISENCOES_IAIA.some((e) => (e.endsWith('/') ? norm.startsWith(e) : norm === e));
}

/** Arquivos do escopo governado (§7): docs/*.md + LILA-DEV/*.md (raiz) + LILA-DEV/kfs/*.md. */
function listarEscopo() {
  const rels = [];
  for (const dir of ['docs', path.join('LILA-DEV', 'kfs')]) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.md')) rels.push(path.join(dir, f));
    }
  }
  const absRaiz = path.join(REPO_ROOT, 'LILA-DEV');
  if (fs.existsSync(absRaiz)) {
    for (const f of fs.readdirSync(absRaiz)) {
      if (f.endsWith('.md')) rels.push(path.join('LILA-DEV', f));
    }
  }
  return rels.map((r) => r.split(path.sep).join('/')).sort();
}

/** Escopo governado menos isencoes (§7) — a populacao sob a regua da secao E. */
function arquivosGovernados() {
  return listarEscopo().filter((r) => !eIsentoIAIA(r));
}

/** Avaliacao da meta line linha 1 (puro): {temMeta, faltando, audienceHuman}. */
function avaliarMetaLinha(texto) {
  const primeira = texto.split(/\r?\n/)[0] ?? '';
  if (!/^meta:\s/.test(primeira)) return { temMeta: false, faltando: [...META_CHAVES_FIXAS], audienceHuman: false };
  const chaves = chavesMeta(primeira);
  const parteAudience = /(^|\|)\s*audience\s*=\s*([^|]*)/.exec(primeira);
  const parteVersion = /(^|\|)\s*version\s*=\s*([^|]*)/.exec(primeira);
  const parteDensity = /(^|\|)\s*density\s*=\s*([^|]*)/.exec(primeira);
  return {
    temMeta: true,
    faltando: META_CHAVES_FIXAS.filter((k) => !chaves.includes(k)),
    audienceHuman: !!parteAudience && parteAudience[2].trim() === 'human',
    version: parteVersion ? parteVersion[2].trim() : null,
    density: parteDensity ? parteDensity[2].trim() : null,
  };
}

/** Version declarada no header de corpo ("**Version:** x.y.z") — campo irmão da
 *  meta line (docs/ A2). Ausente = null (só se compara quando ambos existem). */
function extrairHeaderVersion(texto) {
  const m = /\*\*Version:\*\*\s*([^\s|]+)/.exec(texto) || /\*\*Version\*\*:\s*([^\s|]+)/.exec(texto);
  return m ? m[1] : null;
}

/** Blocos de prosa em nivel de secao (fora de fences, headings, bullets, quote, tabela). */
function blocosProsa(texto) {
  const blocos = [];
  let emFence = false;
  let atual = [];
  let inicio = 0;
  const fechar = () => {
    if (atual.length > 0) blocos.push({ texto: atual.join(' ').trim(), linha: inicio });
    atual = [];
  };
  texto.split(/\r?\n/).forEach((linha, i) => {
    if (/^\s*```/.test(linha)) {
      fechar();
      emFence = !emFence;
      return;
    }
    if (emFence) return;
    const vazia = !linha.trim();
    // Linha com 3+ pipes = continuacao de tabela/registro (nao e prosa).
    const ehTabela = (linha.match(/\|/g) ?? []).length >= 3;
    const ehEstrutural =
      ehTabela || /^\s*(#|[-*+]\s|\d+\.\s|>|\||meta:|derived_from:|scope:|tie_break:)/.test(linha) || vazia;
    if (ehEstrutural) {
      fechar();
      inicio = i + 2;
      return;
    }
    if (atual.length === 0) inicio = i + 1;
    atual.push(linha.trim());
  });
  fechar();
  return blocos;
}

/** Frases do bloco com mascaramento de code spans e numeros decimais. */
function frasesDoBloco(bloco) {
  const comSpans = bloco.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  const semDecimais = comSpans.replace(/\d\.\d/g, (m) => ' '.repeat(m.length));
  const frases = semDecimais.split(/[.!?]\s+(?=[A-Z(])/).map((f) => f.trim()).filter(Boolean);
  return frases.length;
}

// FRAME-MOCKS-TEST-UTILS-20261007 M3 — régua anti-regressão: vi.mock inline de
// services/db.js fora do test-utils volta a multiplicar o quarteto copiado.
// WARN-only (somente leitura, mesmo contrato das demais seções).
function secaoF(resultado) {
  console.log('\n== F. Régua de mocks (vi.mock inline de services/db fora de test-utils) ==');
  const raizTestes = path.join(REPO_ROOT, 'backend', 'src');
  const achados = [];
  const varrer = (dir) => {
    const abs = path.join(raizTestes, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === '__tests__' && dir === '.') continue;
        varrer(path.join(dir, e.name));
        continue;
      }
      if (!/\.test\.ts$/.test(e.name)) continue;
      const rel = path.join(dir, e.name);
      const conteudo = fs.readFileSync(path.join(raizTestes, rel), 'utf8');
      const mockDb = conteudo.match(/vi\.mock\((['"])(\.\.?\/)+services\/db\.js\1,\s*\(\)\s*=>\s*([^\n]*)/);
      // fábrica que já delega ao test-utils (dbJsMock) não é inline
      if (mockDb && !/dbJsMock/.test(mockDb[3]) && !rel.includes('test-utils')) {
        achados.push(rel);
      }
    }
  };
  varrer('.');
  if (achados.length) {
    for (const a of achados) console.log(`  WARN [mock-db-inline] ${a} — use createDbJsMock (backend/src/__tests__/test-utils/db-mocks.ts)`);
    resultado.warns.push(`régua de mocks: ${achados.length} suíte(s) com vi.mock inline de services/db fora de test-utils`);
    resultado.secoes.push({ secao: 'F', avisos: achados.length, detalhe: `F(${achados.length} suíte(s) com vi.mock inline de services/db)` });
  } else {
    console.log('  OK — nenhum vi.mock inline de services/db fora do test-utils');
  }
}

function secaoE(resultado) {
  console.log('\n== E. Gramatica AI-IAIA (COBRANCA DURA — desvio = vermelho) ==');
  const achados = [];
  const todos = listarEscopo();
  const governados = arquivosGovernados();
  console.log(`   escopo governado: ${todos.length} .md | isentos (§7): ${todos.length - governados.length} | sob a regua: ${governados.length}`);
  for (const rel of governados) {
    const texto = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const meta = avaliarMetaLinha(texto);
    if (!meta.temMeta) {
      achados.push(`${rel} — meta line ausente na linha 1 (grammar §2)`);
      continue;
    }
    if (meta.faltando.length > 0) {
      achados.push(`${rel} — meta sem chave(s) fixa(s): ${meta.faltando.join(', ')} (grammar §2)`);
    }
    if (meta.audienceHuman) {
      achados.push(`${rel} — audience=human proibido em docs/ (grammar §2 v3.0.0: camada AI-only)`);
      continue;
    }
    if (meta.density && !/^(max|high)$/.test(meta.density)) {
      achados.push(`${rel} — density=${meta.density} invalido em docs/ (grammar §4.1 v3.0.0: max|high)`);
    }
    // Paridade meta↔header (grammar §5 lifecycle; PATCH-GRAMMAR-PARIDADE-20261002):
    // o incidente de 2026-10-02 (meta 2.3.0 vs header 2.2.0 no próprio GRAMMAR)
    // era invisível ao scanner, que só lia a meta. Compara só quando ambos existem.
    const headerVersion = extrairHeaderVersion(texto);
    if (meta.version && headerVersion && meta.version !== headerVersion) {
      achados.push(`${rel} — version da meta (${meta.version}) != header (**Version:** ${headerVersion}) — paridade meta↔header (grammar §5)`);
    }
    const prosa = blocosProsa(texto).filter((b) => frasesDoBloco(b.texto) > 2);
    for (const p of prosa) {
      const amostra = p.texto.length > 60 ? `${p.texto.slice(0, 60)}…` : p.texto;
      achados.push(`${rel}:${p.linha} — prosa com >2 frases (grammar §4.1): "${amostra}"`);
    }
  }
  if (achados.length === 0) {
    console.log('✅ E · nenhum desvio mecanico detectado no escopo governado');
  } else {
    console.log(`🔴 E · ${achados.length} desvio(s) mecanico(s) — COBRANCA DURA (flip aprovado por Igor 2026-09-29; debt PATCH-IAIA-META-LINHA1-20260928 paga):`);
    for (const a of achados.slice(0, 20)) console.log(`   - ${a}`);
    if (achados.length > 20) console.log(`   ... (+${achados.length - 20})`);
  }
  // COBRANCA DURA (flip 2026-09-29): desvios da gramatica viram vermelho — exit 1.
  resultado.secoes.push({ secao: 'E', achados: achados.length, vermelhos: achados.length });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('🔍 verificar-pontos-cegos — varredura read-only de pontos cegos fora do padrao de PR');
  const resultado = { secoes: [], warns: [] };
  secaoA(resultado);
  secaoB(resultado);
  secaoC(resultado);
  secaoD(resultado);
  secaoF(resultado);
  secaoE(resultado);

  const vermelhos = resultado.secoes.filter((s) => s.estado === 'vermelho' || s.vermelhos > 0);
  const avisos = resultado.secoes.filter((s) => (s.estado === 'aviso' || s.avisos > 0 || s.rotos > 0) && !s.sombra);
  console.log('\n== Sumario ==');
  console.log(`🔴 vermelho(s): ${vermelhos.length > 0 ? vermelhos.map(descrever).join(', ') : 'nenhum'}`);
  console.log(`⚠️  aviso(s):   ${avisos.length > 0 ? avisos.map(descrever).join(', ') : 'nenhum'}`);
  console.log(vermelhos.length > 0 ? '\nEXIT 1 — drift fora do alcance do padrao de PR; patch necessario.' : '\nEXIT 0 — nenhum vermelho.');
  return vermelhos.length > 0 ? 1 : 0;
}

function descrever(s) {
  if (s.secao === 'E' && (s.estado === 'vermelho' || s.vermelhos > 0)) return `E(${s.vermelhos} desvios gramatica)`;
  if (s.vermelhos > 0) return `C(${s.vermelhos} refs mortas)`;
  if (s.estado === 'vermelho') return s.detalhe || s.alvo || s.secao;
  if (s.avisos > 0) return s.detalhe || `C-aviso(${s.avisos})`;
  if (s.rotos > 0) return `D(${s.rotos})`;
  return s.detalhe || s.alvo || s.secao;
}

module.exports = {
  parsePinsCharter,
  extrairVersaoFdv,
  extrairRefsRepo,
  extrairLinksMd,
  classificarRot,
  stripFences,
  eAreaHistorica,
  chavesMeta,
  extrairHeaderVersion,
  blocosProsa,
  frasesDoBloco,
  eIsentoIAIA,
  listarEscopo,
  arquivosGovernados,
  avaliarMetaLinha,
  secaoE,
  main,
};

if (require.main === module) process.exit(main());
