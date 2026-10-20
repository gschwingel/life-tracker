#!/usr/bin/env node
/**
 * scripts/gerar-indice-smart.cjs
 * Proposito: orquestrador de regeneracao inteligente de indices (D3 do Evento
 * Deliberado PATCH-OTIMIZACAO 2026-08-25) — roda apenas os geradores cujo indice
 * esta stale. Deteccao de staleness: verificar-frescor-indices.cjs (mtime x git)
 * para os 3 indices estruturais + verificar-frescor-indice-vetorial.cjs (fileHash)
 * para o vetorial. Independentes rodam em paralelo (reverso faz scan-direto — nao
 * deriva de indice-semantico.json); vetorial regenera de forma incremental
 * (re-embed apenas chunks alterados).
 * Entrada: arvore git + indices no disco
 * Saida:   relatorio de regeneracao (stdout) + exit code
 * Erros:   exit 1 se um gerador stale falhar, ou se o vetorial falhar sem
 *          --vetorial-best-effort (Opcao B do fluxo PATCH — PROTOCOLO-TRANSVERSAL §2.1)
 * Flags:
 *   --verbose               exibe logs de progresso (padrao: silencioso)
 *   --vetorial-best-effort  falha do vetorial (key ausente/API/rede) vira aviso ⚠️
 *                           com exit 0 — o fluxo PATCH registra a divida e libera o commit
 *   --skip-vetorial         nao regenera o indice vetorial (mantem o existente)
 */
const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');
const VETORIAL_BEST_EFFORT = process.argv.includes('--vetorial-best-effort');
const SKIP_VETORIAL = process.argv.includes('--skip-vetorial');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Uso: node scripts/gerar-indice-smart.cjs [--verbose] [--vetorial-best-effort] [--skip-vetorial]');
  console.log('  --verbose               exibe logs de progresso (padrao: silencioso)');
  console.log('  --vetorial-best-effort  falha do vetorial vira aviso com exit 0 (Opcao B PATCH)');
  console.log('  --skip-vetorial         nao regenera o indice vetorial');
  process.exit(0);
}

const REPO_ROOT = path.resolve(__dirname, '..');

function log(msg) {
  if (VERBOSE) console.log(msg);
}

// Mapa indice -> { gerador, dirs (staleness mtime x git) }. Espelha a tabela de
// scripts/verificar-frescor-indices.cjs (mesmos diretorios cobertos por indice).
// REANC-L4 / I1+I3+I4 (2026-09-20): reverso, matriz e inventario de testes
// sairam da superficie ativa — resta a rastreabilidade.
const ESTRUTURAIS = [
  { caminho: 'LILA-DEV/indice-rastreabilidade.json', gerador: 'gerar-indice-rastreabilidade.cjs', dirs: ['LILA-DEV/planejamento', 'LILA-DEV/execucao'] },
];

function gitLogTimestampDiretorios(dirs) {
  try {
    const out = execSync(`git log -1 --format=%ct -- ${dirs.join(' ')}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? parseInt(out, 10) * 1000 : 0; // segundos → ms
  } catch {
    return null; // sem git ou erro
  }
}

// Staleness estrutural (mtime do indice x ultimo commit nos dirs cobertos).
// git indisponivel = regenera (PIPELINE_FRESCOR: sem git -> regeneracao direta).
function estaStale(idx) {
  if (!fs.existsSync(path.join(REPO_ROOT, idx.caminho))) return true;
  const mtimeIdx = fs.statSync(path.join(REPO_ROOT, idx.caminho)).mtimeMs;
  const gitTs = gitLogTimestampDiretorios(idx.dirs);
  if (gitTs === null) return true;
  return gitTs > mtimeIdx;
}

// Staleness do vetorial — delega ao verificador fileHash (nunca le o .bin).
function vetorialStale() {
  const { verificar } = require('./verificar-frescor-indice-vetorial.cjs');
  return verificar() !== 0;
}

function runGerador(gerador) {
  log(`  ▶ node scripts/${gerador}`);
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', gerador)],
      { cwd: REPO_ROOT, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`scripts/${gerador} falhou: ${(stderr || stdout || err.message).trim()}`));
        else resolve(stdout.trim());
      },
    );
    if (VERBOSE && child.stdout) child.stdout.pipe(process.stdout);
  });
}

async function main() {
  // 1. Detecta stale dos estruturais
  const staleEstruturais = [];
  const frescos = [];
  for (const idx of ESTRUTURAIS) {
    if (estaStale(idx)) staleEstruturais.push(idx);
    else frescos.push(idx.caminho);
  }

  // 2. Vetorial (fileHash via verificador especifico)
  let vetorialEstado = 'fresco';
  if (SKIP_VETORIAL) {
    vetorialEstado = 'pulado (--skip-vetorial)';
  } else if (vetorialStale()) {
    vetorialEstado = 'stale';
  }

  if (staleEstruturais.length === 0 && vetorialEstado === 'fresco') {
    console.log('✅ indices:smart — todos os indices estao frescos, nada a regenerar.');
    return 0;
  }

  console.log(
    `⚠️  indices:smart — ${staleEstruturais.length} estruturais stale + vetorial ${vetorialEstado}`,
  );

  // 3. Wave 1 (paralelo): todos os estruturais são independentes — o reverso faz
  //    scan-direto (não deriva do semântico). Rastreabilidade/cobertura.
  const wave1 = staleEstruturais;
  const regenerados = [];
  const falhas = [];

  if (wave1.length > 0) {
    log('Wave 1 (paralelo): ' + wave1.map((i) => i.gerador).join(', '));
    const results = await Promise.allSettled(wave1.map((i) => runGerador(i.gerador)));
    results.forEach((r, k) => {
      if (r.status === 'fulfilled') regenerados.push(wave1[k].caminho);
      else falhas.push(r.reason.message);
    });
  }

  // 4. Wave 2: vetorial incremental (best-effort no PATCH — Opcao B)
  if (vetorialEstado === 'stale') {
    try {
      await runGerador('gerar-indice-vetorial.cjs');
      regenerados.push('indice-vetorial.json + .bin');
      vetorialEstado = 'regenerado';
    } catch (e) {
      if (VETORIAL_BEST_EFFORT) {
        console.log(`⚠️  VETORIAL ADIADO (Opcao B PATCH): ${e.message}`);
        console.log('   → registre a divida (tipo vetorial) no log E3 + LILA-DEV/execucao/patch-debt.json — CI regenera (gate bloqueante).');
        vetorialEstado = 'adiado ⚠️ (best-effort)';
      } else {
        falhas.push(e.message);
      }
    }
  }

  // 6. Relatorio
  console.log('');
  console.log('📊 Resumo indices:smart');
  console.log(`  ✅ Regenerados: ${regenerados.length > 0 ? regenerados.join(', ') : 'nenhum'}`);
  console.log(`  🟢 Frescos (mantidos): ${frescos.length > 0 ? frescos.join(', ') : 'nenhum'}`);
  console.log(`  🧠 Vetorial: ${vetorialEstado}`);
  if (SKIP_VETORIAL) console.log('  (--skip-vetorial ativo: frescor do vetorial fica a cargo de indices:vetorial / CI)');

  if (falhas.length > 0) {
    console.error('');
    console.error('🔴 Falhas na regeneracao:');
    for (const f of falhas) console.error(`  - ${f}`);
    console.error('Correcao: rode npm run indices para regeneracao completa e diagnostique o gerador falho.');
    return 1;
  }

  console.log('✅ indices:smart concluido — valide com npm run indices:check + npm run indices:status.');
  return 0;
}

main().then((code) => process.exit(code));
