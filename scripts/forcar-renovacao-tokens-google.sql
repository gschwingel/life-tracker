-- ============================================================
-- FORÇAR RENOVAÇÃO DE TOKENS GOOGLE — Opção 2
-- Revoga todas as sessões + apaga todos os tokens Google.
-- Próximo login de cada usuário passa pelo fluxo OAuth completo
-- (prompt=consent) e gera refresh token novo.
--
-- Executar no banco de PRODUÇÃO (Railway Postgres):
--   railway run psql "$DATABASE_URL" -f scripts/forcar-renovacao-tokens-google.sql
-- ou via painel Railway → Postgres → Query.
--
-- ⚠️  IDEMPOTENTE: pode ser executado mais de uma vez.
-- ⚠️  Efeito: todos os usuários são deslogados; calendário/drive
--     ficam indisponíveis até o próximo login.
-- ============================================================

BEGIN;

-- 1) Revoga todas as sessões ativas (JWT no DB fica inválido)
UPDATE sessions
SET revoked_at = NOW()
WHERE revoked_at IS NULL;

-- 2) Apaga todos os tokens Google armazenados (access + refresh)
DELETE FROM user_tokens;

-- 3) (Opcional) Limpa chaves idempotência pendentes antigas
DELETE FROM idempotency_keys
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '7 days';

COMMIT;

-- ============================================================
-- VERIFICAÇÃO PÓS-EXECUÇÃO
-- ============================================================
-- SELECT 'sessions ativas restantes' AS check, COUNT(*) FROM sessions WHERE revoked_at IS NULL;
-- SELECT 'tokens google restantes' AS check, COUNT(*) FROM user_tokens;
-- Esperado: 0 em ambos.
</｜｜DSML｜｜>