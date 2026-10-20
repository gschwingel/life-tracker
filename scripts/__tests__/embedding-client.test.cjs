/* eslint-disable no-unused-vars */
// scripts/__tests__/embedding-client.test.cjs
// FR-SEM-02: Teste unitário do embedding client (node:test).
// Mocka a OpenRouter API — sem rede, sem key, determinístico.
// Cobre: batch calls, retry em 429, dimensões 1536, key ausente.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { embedBatch, embedQuery, EmbeddingApiError } = require("../lib/embedding-client.cjs");

const REAL_KEY = process.env.OPENROUTER_API_KEY;

function makeVector(dims = 1536) {
  const v = new Array(dims);
  for (let i = 0; i < dims; i++) {
    v[i] = (i % 10) / 10; // valores determinísticos 0..0.9
  }
  return v;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("embedBatch envia batch para OpenRouter e retorna 2 vetores de 1536 dims", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test";
  const v1 = makeVector();
  const v2 = makeVector();
  let calls = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls++;
    assert.equal(url, "https://openrouter.ai/api/v1/embeddings");
    const body = JSON.parse(opts.body);
    assert.equal(body.model, "openai/text-embedding-3-small");
    assert.deepEqual(body.input, ["hello world", "test"]);
    assert.equal(opts.headers.Authorization, "Bearer sk-test");
    return jsonResponse(200, { data: [{ embedding: v1 }, { embedding: v2 }] });
  };

  try {
    const vectors = await embedBatch(["hello world", "test"]);
    assert.equal(calls, 1, "uma única chamada de batch");
    assert.equal(vectors.length, 2);
    assert.equal(vectors[0].length, 1536);
    assert.equal(vectors[1].length, 1536);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedQuery retorna 1 vetor de 1536 dims", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test";
  const v = makeVector();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(200, { data: [{ embedding: v }] });

  try {
    const vector = await embedQuery("retry com backoff");
    assert.equal(vector.length, 1536);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedBatch faz retry exponencial em 429 e completa na 2ª tentativa", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test";
  const v = makeVector();
  let calls = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) {
      return jsonResponse(429, { error: { message: "rate limited" } });
    }
    return jsonResponse(200, { data: [{ embedding: v }] });
  };

  try {
    const vectors = await embedBatch(["sozinho"]);
    assert.equal(calls, 2, "1ª chamada 429 + retry = 2 chamadas");
    assert.equal(vectors.length, 1);
    assert.equal(vectors[0].length, 1536);
  } finally {
    globalThis.fetch = originalFetch;
  }
}, 8000); // timeout: 1s backoff + folga

test("embedBatch esgota retries em 429 persistente e lança EmbeddingApiError RATE_LIMITED", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test";
  let calls = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return jsonResponse(429, { error: { message: "rate limited" } });
  };

  try {
    await assert.rejects(
      () => embedBatch(["x"]),
      (err) => {
        assert.ok(err instanceof EmbeddingApiError);
        assert.equal(err.code, "OPENROUTER_RATE_LIMITED");
        return true;
      },
    );
    assert.equal(calls, 3, "3 tentativas (1 inicial + 2 retries)");
  } finally {
    globalThis.fetch = originalFetch;
  }
}, 8000); // timeout: 1s + 2s backoff + folga

test("embedBatch lança OPENROUTER_KEY_INVALID quando key ausente", async () => {
  const original = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    await assert.rejects(
      () => embedBatch(["x"]),
      (err) => {
        assert.ok(err instanceof EmbeddingApiError);
        assert.equal(err.code, "OPENROUTER_KEY_INVALID");
        return true;
      },
    );
  } finally {
    if (original !== undefined) {
      process.env.OPENROUTER_API_KEY = original;
    }
  }
});

test("embedBatch sem key não faz nenhuma chamada de rede", async () => {
  const original = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  let calls = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return jsonResponse(200, { data: [] });
  };

  try {
    await assert.rejects(() => embedBatch(["x"]));
    assert.equal(calls, 0, "nenhuma chamada HTTP — guard de key antes do fetch");
  } finally {
    globalThis.fetch = originalFetch;
    if (original !== undefined) {
      process.env.OPENROUTER_API_KEY = original;
    }
  }
});