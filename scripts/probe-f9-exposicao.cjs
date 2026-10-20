#!/usr/bin/env node
// scripts/probe-f9-exposicao.cjs
// C25-27 / F9 (Ciclo 2 de hardening, sessao `structural/hardening-ciclo2-sessao-b`,
// 2026-09-29) — PROVAS MECANICAS de exposicao de rede que antes so respondiam no
// painel (F9 nivel 1 -> evidencia datada e reproduzivel no repo):
//
//   (i)   TCP NEGATIVO contra o link publico do Postgres
//         (crossover.proxy.rlwy.net:17482) — REMOVIDO por decisao humana em
//         2026-09-28. O probe PASSA quando a conexao NAO acontece
//         (timeout/recusa/DNS inexistente) e FALHA se algum dia voltar a aceitar
//         conexao: "sucesso de conexao" aqui e o pior resultado possivel.
//   (ii)  TLS da API publica (handshake real): cadeia validada
//         (rejectUnauthorized), versao minima TLSv1.2 e certificado dentro da
//         validade.
//   (iii) Config do Railway via API GraphQL com token de PROJETO — CANARY PRIMEIRO
//         (R5, 2026-09-29): se o token nao autentica a consulta, o probe NAO
//         itera as cegas: ele para, marca PENDING-HUMAN e o artefato registra a
//         falha do canary. Nenhum token entra no artefato (nem o valor, nem
//         prefixo/sufixo): so o NOME do arquivo de origem.
//
// Artefatos: JSON datado (--json / --out=<caminho>), mesmo shape dos outros
// gates do repo. Exit: 0 = tudo verde | 1 = achado REAL (gate vermelho) |
// 2 = uso incorreto | 4 = PENDING-HUMAN (canary do token falhou).
//
// Uso:
//   node scripts/probe-f9-exposicao.cjs --todos --json
//   node scripts/probe-f9-exposicao.cjs --tcp
//   node scripts/probe-f9-exposicao.cjs --out=LILA-DEV/validacao/f9-probes-<data>.json

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");
const https = require("node:https");

const RAIZ = path.join(__dirname, "..");

/** Alvo do probe NEGATIVO (i) — link publico DELETADO em 2026-09-28 (D3). */
const TCP_HOST_DELETADO = "crossover.proxy.rlwy.net";
const TCP_PORTA_DELETADA = 17482;
const TCP_TIMEOUT_MS = 8000;

/** Dominio publico da API (probe ii). */
const TLS_HOST = "lila-c137.up.railway.app";
const TLS_PORTA = 443;
const TLS_TIMEOUT_MS = 10000;
const TLS_MINIMO = "TLSv1.2";

/** Token de projeto do Railway (probe iii) — lido de arquivo local do runner. */
const TOKEN_PADRAO = "C:/actions-runner/secrets/railway-api-token.txt";


// ── Nucleo PURO (testado em scripts/__tests__/probe-f9-exposicao.test.cjs) ────

/** Codigos que PROVAM ausencia de servico escutando (resultado aceitavel em i). */
const ERROS_ESPERADOS_TCP = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"];

/**
 * Veredito do probe (i) — CRITERIO ESTREITADO POR DECISAO HUMANA (Igor, 2026-09-29,
 * opcao (a); registrado no E3): o gate mede "nenhum Postgres publicamente
 * alcancavel", NAO "a borda do Railway recusa TCP". A borda aceitar o handshake e
 * derrubar a conexao e comportamento de plataforma fora do nosso controle; exigir
 * recusa TCP deixaria o alarme vermelho para sempre (alarme morto = ruido, nao
 * seguranca). Criterio vigente:
 *   * TCP recusado/timeout/DNS inexistente  -> PASSA (nada alcancavel);
 *   * TCP aceito + ZERO byte de protocolo   -> PASSA (borda aceita e derruba), com
 *     campo INFORMATIVO `tcpAceito` preservado no artefato (deteccao de drift: se o
 *     Railway religar a porta a um servico real, o FAIL de protocolo grita);
 *   * QUALQUER byte de protocolo Postgres   -> FALHA (exposicao ativa).
 */
function classificarTcpProtocolo(resultado) {
  if (!resultado.conectou) {
    if (ERROS_ESPERADOS_TCP.includes(resultado.codigo)) {
      return {
        ok: true,
        veredito: "ok-endpoint-inacessivel",
        motivo: `conexao recusada/inexistente (${resultado.codigo})`,
        tcpAceito: false,
      };
    }
    return {
      ok: false,
      veredito: "falha-erro-inesperado",
      motivo: `erro nao classificado (${String(resultado.codigo)}) — resultado inconclusivo nao e prova`,
      tcpAceito: false,
    };
  }
  const bytes = Number(resultado.bytesProtocolo ?? 0);
  if (bytes > 0) {
    return {
      ok: false,
      veredito: "falha-postgres-respondendo",
      motivo: `protocolo Postgres RESPONDEU ao SSLRequest (${String(bytes)} byte(s), primeiro=0x${Number(resultado.primeiroByte ?? 0).toString(16)})`,
      tcpAceito: true,
    };
  }
  return {
    ok: true,
    veredito: "ok-sem-resposta-postgres",
    motivo: "TCP aceito pela borda e conexao encerrada sem resposta de protocolo (nenhum Postgres alcancavel)",
    tcpAceito: true,
  };
}

/** Compara a versao negociada com o minimo exigido (TLSv1.0 < TLSv1.2 < TLSv1.3). */
function versaoTlsSuficiente(protocolo, minimo = TLS_MINIMO) {
  const ranking = { "TLSv1": 1, "TLSv1.1": 2, "TLSv1.2": 3, "TLSv1.3": 4 };
  const obtido = ranking[protocolo] ?? 0;
  const exigido = ranking[minimo] ?? 3;
  return obtido >= exigido;
}

/** Classifica o handshake TLS: cadeia validada + versao minima + certificado valido. */
function classificarTls(resultado) {
  const problemas = [];
  if (resultado.erro) problemas.push(`handshake falhou: ${resultado.erro}`);
  if (!resultado.autorizado) problemas.push("cadeia de certificados NAO validada (rejectUnauthorized)");
  if (resultado.autorizadoError) problemas.push(`erro de validacao: ${resultado.autorizadoError}`);
  if (!resultado.protocolo) problemas.push("protocolo negociado ausente");
  if (resultado.protocolo && !versaoTlsSuficiente(resultado.protocolo)) {
    problemas.push(`versao negociada ${resultado.protocolo} abaixo do minimo ${TLS_MINIMO}`);
  }
  if (resultado.validoAte) {
    const fim = new Date(resultado.validoAte).getTime();
    if (!Number.isFinite(fim) || fim <= Date.now()) problemas.push("certificado vencido");
  } else {
    problemas.push("validade do certificado ausente");
  }
  if (resultado.diasParaVencer !== null && resultado.diasParaVencer !== undefined && resultado.diasParaVencer < 7) {
    problemas.push(`certificado vence em ${String(resultado.diasParaVencer)} dia(s)`);
  }
  return {
    ok: problemas.length === 0,
    veredito: problemas.length === 0 ? "ok-tls-valido" : "falha-tls",
    problemas,
  };
}

/**
 * CANARY do token de projeto (R5): resposta GraphQL com `errors` ou `data`
 * ausente = token nao autentica esta consulta -> PENDING-HUMAN, nunca "verde".
 */
function avaliarCanaryRailway(resposta) {
  const erros = Array.isArray(resposta && resposta.errors) ? resposta.errors : [];
  const temDados = Boolean(resposta && resposta.data);
  if (erros.length > 0 && !temDados) {
    return {
      ok: false,
      pendenteHumano: true,
      veredito: "pendente-humano",
      motivo: `canary nao autenticou (${erros.map((e) => e && e.message).filter(Boolean).join("; ") || "erro sem mensagem"})`,
    };
  }
  if (!temDados) {
    return { ok: false, pendenteHumano: true, veredito: "pendente-humano", motivo: "resposta sem dados (nem erro)" };
  }
  return { ok: true, pendenteHumano: false, veredito: "ok-canary", motivo: "token autentica a consulta" };
}


/** Consulta de configuracao (iii): servicos do projeto + dominios publicos expostos. */
const CONSULTA_PROJETO =
  "query { projects { edges { node { id name services { edges { node { id name serviceInstances { edges { node { domains { serviceDomains { domain } } } } } } } } } } }";

/**
 * Campos que podem entrar no artefato. LISTA BRANCA por desenho: qualquer campo
 * extra de um probe (inclusive um `token` por acidente) e DESCARTADO — o artefato
 * datado vai para o repo, entao o default tem de ser "nao passa" (E-INV-16).
 */
const CAMPOS_EVIDENCIA = [
  "id",
  "alvo",
  "conectou",
  "codigo",
  "ok",
  "veredito",
  "motivo",
  "problemas",
  "pendenteHumano",
  "origemToken",
  "tokenLido",
  "canaryStatus",
  "servicos",
  "autorizado",
  "autorizadoError",
  "protocolo",
  "validoAte",
  "diasParaVencer",
  "emissor",
  // Criterio estreitado do probe (i) (decisao humana 2026-09-29): o fato "TCP
  // aceito" fica no artefato como INFORMATIVO (deteccao de drift da borda).
  "tcpAceito",
  "bytesProtocolo",
  "primeiroByte",
  "sslRequestEnviado",
];

/** Remove de um probe todo campo fora da lista branca (segredo nunca entra). */
function sanitizarProbe(probe) {
  const limpo = {};
  for (const campo of CAMPOS_EVIDENCIA) {
    if (probe && Object.prototype.hasOwnProperty.call(probe, campo)) limpo[campo] = probe[campo];
  }
  return limpo;
}

/** Monta o artefato datado (nenhum segredo entra — so o NOME do arquivo-fonte). */
function montarEvidencia({ em, probes, origens }) {
  const limpos = probes.map(sanitizarProbe);
  const pendentes = limpos.filter((p) => p.pendenteHumano === true);
  // PENDING-HUMAN nunca conta como achado: e prova BLOQUEADA (inconclusiva), nao
  // exposicao encontrada. Sem essa separacao o canary que falha viraria "achado".
  const achados = limpos.filter((p) => p.ok === false && p.pendenteHumano !== true);
  const veredito = achados.length > 0 ? "achado" : pendentes.length > 0 ? "pendente-humano" : "limpo";
  return {
    schema: "probe-f9-exposicao/v1",
    em,
    origens: origens ?? {},
    probes: limpos,
    veredito,
    exitCode: achados.length > 0 ? 1 : pendentes.length > 0 ? 4 : 0,
  };
}

function probeTcp() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: TCP_HOST_DELETADO, port: TCP_PORTA_DELETADA });
    // SSLRequest do protocolo Postgres (8 bytes: len=8, code=80877103). Nenhuma
    // credencial, nenhum dado: so o probe de PROTOCOLO exigido pelo criterio
    // estreitado (decisao humana 2026-09-29, opcao (a)).
    const sslRequest = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);
    let bytesProtocolo = 0;
    let primeiroByte = null;
    let conectou = false;
    let finalizado = false;

    const terminar = (extra) => {
      if (finalizado) return;
      finalizado = true;
      socket.destroy();
      const classificacao = classificarTcpProtocolo({ conectou, bytesProtocolo, primeiroByte, ...extra });
      resolve({
        id: "f9-i-tcp-negativo",
        alvo: `${TCP_HOST_DELETADO}:${String(TCP_PORTA_DELETADA)}`,
        sslRequestEnviado: conectou,
        conectou,
        bytesProtocolo,
        primeiroByte,
        codigo: extra.codigo ?? null,
        ...classificacao,
      });
    };

    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.on("connect", () => {
      conectou = true;
      socket.write(sslRequest);
    });
    socket.on("data", (dados) => {
      if (bytesProtocolo === 0 && dados.length > 0) primeiroByte = dados[0];
      bytesProtocolo += dados.length;
      // Resposta de protocolo ja e prova suficiente (o FAIL nao precisa esperar timeout).
      terminar({});
    });
    socket.on("end", () => terminar({}));
    socket.on("close", () => terminar({}));
    socket.on("timeout", () => terminar({ codigo: conectou ? null : "ETIMEDOUT" }));
    socket.on("error", (erro) => terminar({ codigo: erro.code ?? erro.message }));
  });
}

function probeTls() {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: TLS_HOST, port: TLS_PORTA, servername: TLS_HOST, timeout: TLS_TIMEOUT_MS });
    let finalizado = false;
    const terminar = (resultado) => {
      if (finalizado) return;
      finalizado = true;
      socket.destroy();
      const classificacao = classificarTls(resultado);
      resolve({ id: "f9-ii-tls-api", alvo: `${TLS_HOST}:${String(TLS_PORTA)}`, ...resultado, ...classificacao });
    };
    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const validoAte = cert && cert.valid_to ? cert.valid_to : null;
      const dias = validoAte ? Math.floor((new Date(validoAte).getTime() - Date.now()) / 86_400_000) : null;
      terminar({
        autorizado: socket.authorized === true,
        autorizadoError: socket.authorizationError ? String(socket.authorizationError) : null,
        protocolo: socket.getProtocol(),
        validoAte,
        diasParaVencer: dias,
        emissor: cert && cert.issuer ? cert.issuer.O ?? cert.issuer.CN ?? null : null,
      });
    });
    socket.on("timeout", () => terminar({ erro: "timeout" }));
    socket.on("error", (erro) => terminar({ erro: erro.code ?? erro.message }));
  });
}

function postGraphql(token, consulta) {
  return new Promise((resolve) => {
    const corpo = JSON.stringify({ query: consulta });
    const req = https.request(
      {
        hostname: "backboard.railway.com",
        path: "/graphql/v2",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Length": Buffer.byteLength(corpo),
        },
        timeout: 20_000,
      },
      (resposta) => {
        let texto = "";
        resposta.on("data", (c) => (texto += c));
        resposta.on("end", () => {
          try {
            resolve({ status: resposta.statusCode, json: JSON.parse(texto) });
          } catch {
            resolve({ status: resposta.statusCode, json: null });
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, json: null, erro: "timeout" });
    });
    req.on("error", (erro) => resolve({ status: 0, json: null, erro: erro.code ?? erro.message }));
    req.write(corpo);
    req.end();
  });
}

/** Probe (iii): canary + leitura da config; token lido de arquivo local. */
async function probeRailway(tokenArquivo) {
  const base = { id: "f9-iii-config-railway", origemToken: path.basename(tokenArquivo), tokenLido: false };
  if (!fs.existsSync(tokenArquivo)) {
    return { ...base, ok: false, pendenteHumano: true, veredito: "pendente-humano", motivo: `token ausente (${path.basename(tokenArquivo)})` };
  }
  const token = fs.readFileSync(tokenArquivo, "utf8").trim();
  if (!token) {
    return { ...base, ok: false, pendenteHumano: true, veredito: "pendente-humano", motivo: "arquivo de token vazio" };
  }

  // CANARY PRIMEIRO (R5): valida a capacidade do token antes de interpretar config.
  const canary = await postGraphql(token, "query { me { name } }");
  const avaliacao = avaliarCanaryRailway(canary.json ?? {});
  if (canary.erro) {
    return { ...base, tokenLido: true, ok: false, pendenteHumano: true, veredito: "pendente-humano", motivo: `canary sem resposta (${canary.erro})` };
  }
  if (!avaliacao.ok) {
    return { ...base, tokenLido: true, ok: false, pendenteHumano: avaliacao.pendenteHumano, veredito: avaliacao.veredito, motivo: avaliacao.motivo, canaryStatus: canary.status ?? null };
  }

  const config = await postGraphql(token, CONSULTA_PROJETO);
  const projetos = config.json && config.json.data && config.json.data.projects ? config.json.data.projects.edges ?? [] : [];
  const servicos = [];
  for (const projeto of projetos) {
    const nosServico = projeto?.node?.services?.edges ?? [];
    for (const servico of nosServico) {
      const instancias = servico?.node?.serviceInstances?.edges ?? [];
      const dominios = [];
      for (const instancia of instancias) {
        const serviceDomains = instancia?.node?.domains?.serviceDomains ?? [];
        for (const d of serviceDomains) if (d && d.domain) dominios.push(d.domain);
      }
      servicos.push({ nome: servico?.node?.name ?? null, dominiosPublicos: dominios });
    }
  }
  const postgres = servicos.find((s) => (s.nome ?? "").toLowerCase().includes("postgres"));
  const exposicao = postgres ? postgres.dominiosPublicos : null;
  const ok = exposicao !== null && exposicao.length === 0;
  return {
    ...base,
    tokenLido: true,
    ok,
    pendenteHumano: false,
    veredito: ok ? "ok-sem-public-networking" : "falha-exposicao-config",
    motivo: postgres
      ? `servico Postgres com ${String((exposicao ?? []).length)} dominio(s) publico(s)`
      : "servico Postgres nao localizado na resposta (resultado inconclusivo)",
    servicos: servicos.map((s) => ({ nome: s.nome, dominios: s.dominiosPublicos.length })),
  };
}

function lerArg(argv, prefixo) {
  const achado = argv.find((a) => a.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : null;
}

/**
 * `io` é INJETÁVEL (default `console`): os testes provam o fluxo SEM sequestrar os
 * globais do processo (patch de `console.log`/`process.stdout` vaza para testes
 * vizinhos quando a suíte roda concorrente — lição medida no CI, 2026-09-29).
 */
async function principal(argv = process.argv.slice(2), gerarProbes = null, io = console) {
  const json = argv.includes("--json");
  const out = lerArg(argv, "--out=");
  const alvoTcp = argv.includes("--tcp");
  const alvoTls = argv.includes("--tls");
  const alvoRailway = argv.includes("--railway");
  const todos = argv.includes("--todos") || (!alvoTcp && !alvoTls && !alvoRailway);
  const tokenArquivo = lerArg(argv, "--token-file=") ?? TOKEN_PADRAO;

  const probes = [];
  const padrao = gerarProbes ?? {
    tcp: probeTcp,
    tls: probeTls,
    railway: () => probeRailway(tokenArquivo),
  };
  if (todos || alvoTcp) probes.push(await padrao.tcp());
  if (todos || alvoTls) probes.push(await padrao.tls());
  if (todos || alvoRailway) probes.push(await padrao.railway());

  const evidencia = montarEvidencia({ em: new Date().toISOString(), probes });
  if (out) {
    const destino = path.resolve(RAIZ, out);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(evidencia, null, 2) + "\n");
  }
  if (json) io.log(JSON.stringify(evidencia, null, 2));
  else {
    for (const p of probes) {
      const marca = p.ok ? "OK  " : p.pendenteHumano ? "PEND" : "FALHA";
      const detalhe = p.motivo ?? (Array.isArray(p.problemas) && p.problemas.length > 0 ? p.problemas.join(" | ") : "sem ressalvas");
      io.log(`[f9] ${marca} ${p.id}: ${p.veredito} — ${detalhe}`);
    }
    io.log(`[f9] veredito=${evidencia.veredito} exit=${String(evidencia.exitCode)}${out ? ` artefato=${out}` : ""}`);
  }
  return evidencia;
}

module.exports = {
  TCP_HOST_DELETADO,
  TCP_PORTA_DELETADA,
  TLS_HOST,
  TLS_MINIMO,
  CONSULTA_PROJETO,
  ERROS_ESPERADOS_TCP,
  classificarTcpProtocolo,
  versaoTlsSuficiente,
  classificarTls,
  avaliarCanaryRailway,
  montarEvidencia,
  sanitizarProbe,
  lerArg,
  principal,
};

if (require.main === module) {
  principal()
    .then((evidencia) => process.exit(evidencia.exitCode))
    .catch((erro) => {
      console.error("[f9] erro inesperado:", erro instanceof Error ? erro.message : erro);
      process.exit(2);
    });
}

