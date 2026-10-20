// scripts/lib/embedding-client.cjs
// FR-SEM-02: Cliente HTTP para OpenRouter embeddings API.
// Contrato espelhado no backend TS (FR-SEM-05): mesmo endpoint ${OPENROUTER_BASE}/embeddings,
// mesmo modelo openai/text-embedding-3-small, mesmos códigos de erro OPENROUTER_*.
// Batch com rate limit + retry exponencial em 429/5xx (até 3 tentativas).

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const DEFAULT_BATCH_SIZE = 64;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_MS = 1000;

/**
 * Erro estruturado da API de embeddings. code segue o contrato OPENROUTER_*
 * do backend (FR-SEM-05): OPENROUTER_KEY_INVALID, OPENROUTER_RATE_LIMITED,
 * OPENROUTER_SERVER_ERROR.
 */
class EmbeddingApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "EmbeddingApiError";
    this.code = code;
    this.status = status;
  }
}

function apiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new EmbeddingApiError(
      "OPENROUTER_API_KEY ausente no ambiente (embedding-client.cjs)",
      "OPENROUTER_KEY_INVALID",
      401,
    );
  }
  return key;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envia um lote de textos para OpenRouter embeddings. Retries em 429/5xx
 * com backoff exponencial (base 1000ms) até MAX_ATTEMPTS tentativas.
 *
 * @param {string[]} texts
 * @param {number} attempt
 * @returns {Promise<number[][]>} vetores de 1536 dimensões, um por texto
 */
async function embedOneBatch(texts, attempt = 1) {
  const key = apiKey();

  let response;
  try {
    response = await fetch(`${OPENROUTER_BASE}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
  } catch (err) {
    // Falha de rede — retry com backoff (tratada fora do status HTTP)
    if (attempt >= MAX_ATTEMPTS) {
      throw new EmbeddingApiError(
        `Falha de rede ao chamar embeddings: ${err.message}`,
        "OPENROUTER_NETWORK_ERROR",
        0,
      );
    }
    await sleep(BASE_RETRY_MS * 2 ** (attempt - 1));
    return embedOneBatch(texts, attempt + 1);
  }

  if (response.ok) {
    const data = await response.json();
    return data.data.map((entry) => entry.embedding);
  }

  const status = response.status;
  let code = "OPENROUTER_SERVER_ERROR";
  if (status === 401 || status === 403) {
    code = "OPENROUTER_KEY_INVALID";
  } else if (status === 429) {
    code = "OPENROUTER_RATE_LIMITED";
  }

  if ((status === 429 || status >= 500) && attempt < MAX_ATTEMPTS) {
    await sleep(BASE_RETRY_MS * 2 ** (attempt - 1));
    return embedOneBatch(texts, attempt + 1);
  }

  throw new EmbeddingApiError(
    `OpenRouter embeddings falhou (HTTP ${status})`,
    code,
    status,
  );
}

/**
 * Embedda um batch de textos. Divide em lotes de DEFAULT_BATCH_SIZE (64)
 * para respeitar rate limit da API.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += DEFAULT_BATCH_SIZE) {
    const slice = texts.slice(i, i + DEFAULT_BATCH_SIZE);
    const vectors = await embedOneBatch(slice);
    results.push(...vectors);
  }
  return results;
}

/**
 * Embedda uma query singular (runtime).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedQuery(text) {
  const [vector] = await embedOneBatch([text]);
  return vector;
}

module.exports = { embedBatch, embedQuery, EmbeddingApiError };