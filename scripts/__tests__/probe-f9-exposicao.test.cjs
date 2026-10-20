// scripts/__tests__/probe-f9-exposicao.test.cjs
// C25-27 / F9 (Ciclo 2, sessao `structural/hardening-ciclo2-sessao-b`) — testes do
// nucleo PURO dos probes. As provas que importam sao as NEGATIVAS:
//   * probe (i): conexao ACEITA = FALHA do gate (link publico vivo);
//   * probe (iii): canary que nao autentica = PENDING-HUMAN, nunca verde;
//   * artefato: nenhum valor de token entra no JSON (nem prefixo/sufixo).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** IO injetado que ACUMULA a saída em arquivo (sem sequestrar globais do processo). */
function ioArquivo(caminho) {
  return {
    log: (mensagem) => fs.appendFileSync(caminho, `${String(mensagem)}\n`),
    error: (mensagem) => fs.appendFileSync(caminho, `${String(mensagem)}\n`),
  };
}

function tmpDir(prefixo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
}

const {
  CONSULTA_PROJETO,
  classificarTcpProtocolo,
  versaoTlsSuficiente,
  classificarTls,
  avaliarCanaryRailway,
  montarEvidencia,
  sanitizarProbe,
  lerArg,
  principal,
} = require("../probe-f9-exposicao.cjs");

test("(i) TCP: endpoint recusado/inexistente PASSA (nada alcancavel)", () => {
  for (const codigo of ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH"]) {
    const r = classificarTcpProtocolo({ conectou: false, codigo });
    assert.equal(r.ok, true, `codigo ${codigo} deveria passar`);
    assert.equal(r.veredito, "ok-endpoint-inacessivel");
    assert.equal(r.tcpAceito, false);
  }
});

test("(i) TCP: erro NAO classificado nao vira verde (inconclusivo != prova)", () => {
  const r = classificarTcpProtocolo({ conectou: false, codigo: "EPROTO" });
  assert.equal(r.ok, false);
  assert.equal(r.veredito, "falha-erro-inesperado");
});

test("(i) TCP: borda aceita e derruba sem NENHUM byte de protocolo PASSA (criterio estreitado, 2026-09-29)", () => {
  const r = classificarTcpProtocolo({ conectou: true, bytesProtocolo: 0, primeiroByte: null });
  assert.equal(r.ok, true);
  assert.equal(r.veredito, "ok-sem-resposta-postgres");
  // O fato TCP fica INFORMATIVO no artefato (deteccao de drift da borda).
  assert.equal(r.tcpAceito, true);
});

test("(i) TCP: QUALQUER resposta de protocolo REPROVA (Postgres alcancavel = exposicao ativa)", () => {
  // 'S' (0x53) = resposta classica do Postgres ao SSLRequest (TLS aceito).
  const r = classificarTcpProtocolo({ conectou: true, bytesProtocolo: 1, primeiroByte: 0x53 });
  assert.equal(r.ok, false);
  assert.equal(r.veredito, "falha-postgres-respondendo");
  assert.match(r.motivo, /respondeu ao SSLRequest/i);
  assert.equal(r.tcpAceito, true);
});

test("(i) TCP: resposta de erro/valor inesperado tambem REPROVA (nao ha resposta benigna)", () => {
  for (const primeiro of [0x45, 0x4e, 0x00]) {
    const r = classificarTcpProtocolo({ conectou: true, bytesProtocolo: 5, primeiroByte: primeiro });
    assert.equal(r.ok, false);
    assert.equal(r.veredito, "falha-postgres-respondendo");
  }
});

test("(ii) TLS: versao minima exige TLSv1.2 ou superior", () => {
  assert.equal(versaoTlsSuficiente("TLSv1.3"), true);
  assert.equal(versaoTlsSuficiente("TLSv1.2"), true);
  assert.equal(versaoTlsSuficiente("TLSv1.1"), false);
  assert.equal(versaoTlsSuficiente("TLSv1"), false);
  assert.equal(versaoTlsSuficiente(undefined), false);
});

test("(ii) TLS: handshake completo e valido PASSA", () => {
  const futuro = new Date(Date.now() + 60 * 86_400_000).toISOString();
  const r = classificarTls({
    autorizado: true,
    autorizadoError: null,
    protocolo: "TLSv1.3",
    validoAte: futuro,
    diasParaVencer: 60,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problemas, []);
});

test("(ii) TLS: cadeia invalida, versao antiga e cert vencido reprovam com motivo", () => {
  const passado = new Date(Date.now() - 86_400_000).toISOString();
  const r = classificarTls({
    autorizado: false,
    autorizadoError: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    protocolo: "TLSv1.1",
    validoAte: passado,
    diasParaVencer: -1,
  });
  assert.equal(r.ok, false);
  assert.equal(r.veredito, "falha-tls");
  assert.equal(r.problemas.length >= 4, true);
});

test("(ii) TLS: erro de handshake reprova (nao ha verde sem handshake)", () => {
  const r = classificarTls({ erro: "ECONNRESET" });
  assert.equal(r.ok, false);
  assert.match(r.problemas.join(" | "), /handshake falhou/);
});

test("(iii) canary: erro GraphQL sem dados = PENDING-HUMAN (nunca verde)", () => {
  const r = avaliarCanaryRailway({ errors: [{ message: "Not Authorized" }], data: null });
  assert.equal(r.ok, false);
  assert.equal(r.pendenteHumano, true);
  assert.equal(r.veredito, "pendente-humano");
});

test("(iii) canary: dados presentes autentica a consulta", () => {
  const r = avaliarCanaryRailway({ data: { me: { name: "x" } } });
  assert.equal(r.ok, true);
  assert.equal(r.pendenteHumano, false);
});

test("(iii) canary: resposta vazia/ilegivel continua pendente-humano", () => {
  assert.equal(avaliarCanaryRailway(null).pendenteHumano, true);
  assert.equal(avaliarCanaryRailway({}).pendenteHumano, true);
});

test("artefato: veredito e exit code derivam dos probes (achado > pendente > limpo)", () => {
  const agora = "2026-09-29T00:00:00.000Z";
  const limpo = montarEvidencia({ em: agora, probes: [{ ok: true }, { ok: true }] });
  assert.equal(limpo.veredito, "limpo");
  assert.equal(limpo.exitCode, 0);
  assert.equal(limpo.schema, "probe-f9-exposicao/v1");

  const pendente = montarEvidencia({ em: agora, probes: [{ ok: true }, { ok: false, pendenteHumano: true }] });
  assert.equal(pendente.veredito, "pendente-humano");
  assert.equal(pendente.exitCode, 4);

  const achado = montarEvidencia({ em: agora, probes: [{ ok: false, pendenteHumano: true }, { ok: false }] });
  assert.equal(achado.veredito, "achado");
  assert.equal(achado.exitCode, 1);
});

test("artefato: nenhum valor de token entra na evidencia (so o NOME do arquivo)", async () => {
  const SEGREDO = "tok_super_secreto_nao_pode_vazar";
  const destino = path.join(tmpDir("probe-f9-artefato-"), "saida.txt");
  const evidencia = await principal(
    ["--todos", "--json"],
    {
      tcp: async () => ({ id: "f9-i-tcp-negativo", ok: true, veredito: "ok-endpoint-inacessivel", motivo: "x" }),
      tls: async () => ({ id: "f9-ii-tls-api", ok: true, veredito: "ok-tls-valido", problemas: [] }),
      railway: async () => ({
        id: "f9-iii-config-railway",
        origemToken: path.basename("C:/actions-runner/secrets/railway-api-token.txt"),
        tokenLido: true,
        ok: false,
        pendenteHumano: true,
        veredito: "pendente-humano",
        motivo: "canary nao autenticou",
        token: SEGREDO,
      }),
    },
    ioArquivo(destino),
  );
  const serializado = JSON.stringify(evidencia);
  assert.equal(serializado.includes(SEGREDO), false, "campo fora da lista branca nao pode entrar no artefato");
  assert.equal(evidencia.veredito, "pendente-humano");
  assert.equal(evidencia.exitCode, 4);
  assert.equal(evidencia.probes[2].origemToken, "railway-api-token.txt");
  assert.equal(evidencia.probes[2].token, undefined);
  assert.ok(fs.readFileSync(destino, "utf8").includes("pendente-humano"), "evidencia JSON tambem impressa na saida");
});

test("artefato: campos fora da lista branca nao passam (sanitizacao)", () => {
  const limpo = sanitizarProbe({ id: "x", ok: true, tcpAceito: true, token: "segredo", authorization: "Bearer x" });
  assert.deepEqual(Object.keys(limpo).sort(), ["id", "ok", "tcpAceito"]);
});

test("CLI: --out e --token-file sao lidos por prefixo; ausencia usa default", () => {
  assert.equal(lerArg(["--out=a/b.json"], "--out="), "a/b.json");
  assert.equal(lerArg(["--tcp"], "--out="), null);
  assert.equal(lerArg(["--token-file=X:/t.txt"], "--token-file="), "X:/t.txt");
  assert.match(CONSULTA_PROJETO, /serviceDomains/);
});
