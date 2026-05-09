/**
 * EdgeFn.net embedding client (BAAI/bge-m3).
 *
 * Environment:
 *   EDGEFN_API_KEY — required
 *   EDGEFN_BASE_URL — optional, defaults to https://api.edgefn.net/v1
 *
 * Model: BAAI/bge-m3 produces 1024-dimensional vectors.
 * These are stored as vector(1024) via pgvector for similarity search.
 */

const BASE_URL = process.env.EDGEFN_BASE_URL?.replace(/\/$/, "") || "https://api.edgefn.net/v1";
const API_KEY = process.env.EDGEFN_API_KEY;
const MODEL = "BAAI/bge-m3";
const EMBEDDING_DIM = 1024;

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (!API_KEY) {
    throw new Error("EDGEFN_API_KEY is not configured");
  }

  const response = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    throw new Error(`Embedding request failed: ${response.status} ${body}`);
  }

  const json = (await response.json()) as EmbeddingResult;
  for (let i = 0; i < json.embeddings.length; i++) {
    const dim = json.embeddings[i].length;
    if (dim !== EMBEDDING_DIM) {
      throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${dim} at index ${i}`);
    }
  }
  return json.embeddings;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const embeddings = await createEmbeddings([text]);
  return embeddings[0];
}
