// scripts/rotate-encryption-key.cjs
// ONDA-D-F22-2026-08-28 (F2.2) — rotação transacional da ENCRYPTION_KEY.
//
// Re-cifra com a chave NOVA (hex-64 obrigatório) todos os dados cifrados que
// ainda usam a chave ANTIGA (pré-Onda D — hex-64 direto ou string raw derivada
// via scryptSync com salt fixo "lila-c137-salt"):
//   - users.openrouter_key_encrypted/iv/tag (OpenRouter key do usuário)
//   - user_tokens.access_token_encrypted/iv/tag + refresh_token_encrypted/iv/tag
//     (Google/GitHub OAuth tokens)
//
// SEGURANCA: opera em dry-run por padrão; o modo destrutivo exige --apply APÓS
// um --dry-run aprovado (proibido operar sem isso). Transação única com
// rollback automático em falha + guard de integridade (cripto ida-e-volta por
// linha). Idempotente: linhas já cifradas com a chave nova são detectadas e
// puladas.
//
// Uso:
//   ENCRYPTION_KEY_OLD=... ENCRYPTION_KEY_NEW=... DATABASE_URL=... node scripts/rotate-encryption-key.cjs            # dry-run
//   ... --apply                                                                                                      # executa
//   node scripts/rotate-encryption-key.cjs --check --url postgres://... --old-key ... --new-key ...
//   node scripts/rotate-encryption-key.cjs --help
//
// Flags:
//   --check     valida pré-requisitos (URL, OLD, NEW hex-64, pacote postgres, SELECT 1) — exit 0/1
//   --dry-run   conta/reporta linhas a rotacionar SEM escrever (default)
//   --apply     executa a re-criptografia transacional (destrutivo — requer dry-run aprovado)
//   --url       override da DATABASE_URL
//   --old-key   override da ENCRYPTION_KEY_OLD
//   --new-key   override da ENCRYPTION_KEY_NEW
//
// Exit codes: 0 sucesso (incl. dry-run) · 1 falha (pré-requisito, validação,
// DB, rollback acionado, guard de integridade) · 2 uso inválido.

"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const LEGACY_SALT = "lila-c137-salt";
const HEX64_RE = /^[0-9a-fA-F]{64}$/;

function parseArgs(argv) {
  const opts = { check: false, apply: false, help: false, url: null, oldKey: null, newKey: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") opts.check = true;
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--url") opts.url = argv[++i] ?? null;
    else if (arg === "--old-key") opts.oldKey = argv[++i] ?? null;
    else if (arg === "--new-key") opts.newKey = argv[++i] ?? null;
  }
  return opts;
}

function maskUrl(url) {
  if (!url) return "";
  return url.replace(/\/\/([^@]+)@/, (_, creds) => {
    const user = (creds.split(":")[0]) ?? "";
    return `//${user}:****@`;
  });
}

/** Chave AES-256-GCM (32 bytes) a partir de um valor de env (hex-64 direto | raw via scrypt legado). */
function keyFromValue(value) {
  if (HEX64_RE.test(value)) return Buffer.from(value, "hex");
  return crypto.scryptSync(value, LEGACY_SALT, 32);
}

function encryptWith(plaintext, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { encrypted, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

function decryptWith(encrypted, ivHex, tagHex, key) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Tenta re-cifrar uma célula cifrada com a chave antiga para a nova.
 * Já rotacionada (decrypt antigo falha, novo OK) → { fresh: null, already: true }.
 * Ambos falham → erro (dados corrompidos ou chaves erradas).
 * Retorna { fresh, plaintext, already } — fresh = nova cifra pronta para UPDATE.
 */
function tryRotate(cipher, keyOld, keyNew) {
  if (!cipher || !cipher.encrypted) return { fresh: null, already: false };
  let plaintext;
  try {
    plaintext = decryptWith(cipher.encrypted, cipher.iv, cipher.tag, keyOld);
  } catch {
    try {
      decryptWith(cipher.encrypted, cipher.iv, cipher.tag, keyNew);
      return { fresh: null, already: true };
    } catch {
      throw new Error("ciphertext indecifravel com a chave antiga E a nova — dados corrompidos ou chaves erradas");
    }
  }
  const fresh = encryptWith(plaintext, keyNew);
  const verify = decryptWith(fresh.encrypted, fresh.iv, fresh.tag, keyNew);
  if (verify !== plaintext) throw new Error("round-trip guard falhou (verify != plaintext)");
  return { fresh, already: false };
}

function resolvePostgres() {
  return require(require.resolve("postgres", { paths: [path.join(__dirname, "..", "backend")] }));
}

function postgresVersion() {
  try {
    return require(path.join(__dirname, "..", "backend", "node_modules", "postgres", "package.json")).version ?? "";
  } catch {
    return "";
  }
}

function printHelp() {
  console.log(`rotate-encryption-key.cjs — rotação da ENCRYPTION_KEY (ONDA-D-F22-2026-08-28)
Uso:
  ENCRYPTION_KEY_OLD=... ENCRYPTION_KEY_NEW=... DATABASE_URL=... node scripts/rotate-encryption-key.cjs   # dry-run
  ... --apply                                                                                             # executa
Flags:
  --check     valida pré-requisitos (URL, OLD, NEW hex-64, postgres, SELECT 1) — exit 0/1
  --dry-run   reporta linhas a rotacionar SEM escrever (default)
  --apply     executa a re-criptografia transacional (destrutivo)
  --url       override da DATABASE_URL
  --old-key   override da ENCRYPTION_KEY_OLD
  --new-key   override da ENCRYPTION_KEY_NEW
Exit: 0 sucesso · 1 falha · 2 uso inválido.`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }
  if (opts.check && opts.apply) {
    console.error("[rotate] --check e --apply sao mutuamente exclusivos.");
    process.exit(2);
  }

  const dbUrl = opts.url ?? process.env.DATABASE_URL;
  const oldKey = opts.oldKey ?? process.env.ENCRYPTION_KEY_OLD;
  const newKey = opts.newKey ?? process.env.ENCRYPTION_KEY_NEW;

  if (!dbUrl || !oldKey || !newKey) {
    console.error("[rotate] pre-requisitos ausentes: DATABASE_URL, ENCRYPTION_KEY_OLD e ENCRYPTION_KEY_NEW sao obrigatorios (ou --url/--old-key/--new-key).");
    process.exit(2);
  }
  if (!HEX64_RE.test(newKey)) {
    console.error("[rotate] ENCRYPTION_KEY_NEW deve ser hex de exatamente 64 caracteres (ex: openssl rand -hex 32).");
    process.exit(1);
  }

  const keyOld = keyFromValue(oldKey);
  const keyNew = Buffer.from(newKey, "hex");
  const postgres = resolvePostgres();
  const sql = postgres(dbUrl, { max: 2 });

  (async () => {
    try {
      await sql`SELECT 1`;
      if (opts.check) {
        console.log(`[rotate] OK — DATABASE_URL presente; NEW hex-64 valido; postgres ${postgresVersion()}; conexao OK (${maskUrl(dbUrl)})`);
        return 0;
      }

      const users = await sql`SELECT id, openrouter_key_encrypted, openrouter_key_iv, openrouter_key_tag FROM users WHERE openrouter_key_encrypted IS NOT NULL`;
      const tokens = await sql`SELECT id, access_token_encrypted, access_token_iv, access_token_tag, refresh_token_encrypted, refresh_token_iv, refresh_token_tag FROM user_tokens WHERE access_token_encrypted IS NOT NULL`;

      // Planeja as atualizações (sem escrever nada ainda).
      const updates = [];
      const stats = { toRotate: 0, already: 0, errors: 0 };
      for (const u of users) {
        const r = tryRotate({ encrypted: u.openrouter_key_encrypted, iv: u.openrouter_key_iv, tag: u.openrouter_key_tag }, keyOld, keyNew);
        if (r.already) { stats.already += 1; continue; }
        if (!r.fresh) continue;
        updates.push({ table: "users", id: u.id, set: { openrouter_key_encrypted: r.fresh.encrypted, openrouter_key_iv: r.fresh.iv, openrouter_key_tag: r.fresh.tag } });
        stats.toRotate += 1;
      }
      for (const t of tokens) {
        const acc = tryRotate({ encrypted: t.access_token_encrypted, iv: t.access_token_iv, tag: t.access_token_tag }, keyOld, keyNew);
        const ref = t.refresh_token_encrypted
          ? tryRotate({ encrypted: t.refresh_token_encrypted, iv: t.refresh_token_iv, tag: t.refresh_token_tag }, keyOld, keyNew)
          : { fresh: null, already: false };
        if (acc.already && ref.already) { stats.already += 1; continue; }
        if (!acc.fresh && !ref.fresh) continue;
        updates.push({
          table: "user_tokens",
          id: t.id,
          set: {
            access_token_encrypted: acc.fresh ? acc.fresh.encrypted : t.access_token_encrypted,
            access_token_iv: acc.fresh ? acc.fresh.iv : t.access_token_iv,
            access_token_tag: acc.fresh ? acc.fresh.tag : t.access_token_tag,
            refresh_token_encrypted: ref.fresh ? ref.fresh.encrypted : t.refresh_token_encrypted,
            refresh_token_iv: ref.fresh ? ref.fresh.iv : t.refresh_token_iv,
            refresh_token_tag: ref.fresh ? ref.fresh.tag : t.refresh_token_tag,
          },
        });
        stats.toRotate += 1;
      }

      if (!opts.apply) {
        console.log(`[rotate] DRY-RUN — ${maskUrl(dbUrl)}`);
        console.log(`[rotate]   users.openrouter_key_*  a rotacionar: ${stats.toRotate} linha(s) de ${users.length}`);
        console.log(`[rotate]   user_tokens.*           a rotacionar: ${tokens.length} linha(s)`);
        console.log(`[rotate]   ja na chave nova: ${stats.already} | erros de integridade: ${stats.errors}`);
        console.log(`[rotate]   NENHUMA escrita feita. Aprove o dry-run e execute com --apply para re-cifrar.`);
        return stats.errors > 0 ? 1 : 0;
      }

      if (stats.toRotate === 0) {
        console.log("[rotate] nenhuma linha para rotacionar (tudo ja na chave nova). Nada a fazer.");
        return 0;
      }

      console.log(`[rotate] APPLY — re-cifrando ${updates.length} UPDATEs em transacao unica (${maskUrl(dbUrl)})`);
      await sql.begin(async (tx) => {
        for (const u of updates) {
          if (u.table === "users") {
            await tx`UPDATE users SET openrouter_key_encrypted=${u.set.openrouter_key_encrypted}, openrouter_key_iv=${u.set.openrouter_key_iv}, openrouter_key_tag=${u.set.openrouter_key_tag}, updated_at=now() WHERE id=${u.id}`;
          } else {
            await tx`UPDATE user_tokens SET access_token_encrypted=${u.set.access_token_encrypted}, access_token_iv=${u.set.access_token_iv}, access_token_tag=${u.set.access_token_tag}, refresh_token_encrypted=${u.set.refresh_token_encrypted}, refresh_token_iv=${u.set.refresh_token_iv}, refresh_token_tag=${u.set.refresh_token_tag}, updated_at=now() WHERE id=${u.id}`;
          }
        }
      });

      // Guard de integridade pós-commit: tudo precisa decifrar com a chave NOVA.
      let failures = 0;
      for (const u of users) {
        const row = (await sql`SELECT openrouter_key_encrypted, openrouter_key_iv, openrouter_key_tag FROM users WHERE id=${u.id}`)[0];
        if (!row || !row.openrouter_key_encrypted) continue;
        try { decryptWith(row.openrouter_key_encrypted, row.openrouter_key_iv, row.openrouter_key_tag, keyNew); }
        catch { failures += 1; console.error(`[rotate] post-verify FALHOU em users.${u.id}`); }
      }
      for (const t of tokens) {
        const row = (await sql`SELECT access_token_encrypted, access_token_iv, access_token_tag FROM user_tokens WHERE id=${t.id}`)[0];
        if (!row) continue;
        try { decryptWith(row.access_token_encrypted, row.access_token_iv, row.access_token_tag, keyNew); }
        catch { failures += 1; console.error(`[rotate] post-verify FALHOU em user_tokens.${t.id}`); }
      }

      if (failures > 0) {
        console.error(`[rotate] X post-verify: ${failures} linha(s) nao decifram com a chave nova.`);
        return 1;
      }
      console.log(`[rotate] OK — ${stats.toRotate} linha(s) re-cifrada(s); post-verify com a chave nova 100% OK.`);
      console.log(`[rotate] PROXIMO PASSO (humano): deploy com ENCRYPTION_KEY=<nova> e remova ENCRYPTION_KEY_LEGACY do ambiente.`);
      return 0;
    } catch (err) {
      console.error(`[rotate] X ${String(err && err.message ? err.message : err)}`);
      return 1;
    } finally {
      await sql.end();
    }
  })().then((code) => { process.exit(code); });
}

module.exports = { parseArgs, maskUrl, keyFromValue, encryptWith, decryptWith, tryRotate, main };

if (require.main === module) {
  main();
}
