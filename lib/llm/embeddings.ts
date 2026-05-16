/**
 * Embedding client.
 *
 * Resolution order (PHASE-B-EMBEDDINGS-CONTEXT §B-D-04):
 *   1. EmbeddingModel DB row where is_default=true AND is_enabled=true
 *   2. EDGEFN_API_KEY / EDGEFN_BASE_URL env vars (permanent escape hatch)
 *
 * Dimension is locked to 1024 to match `MemoryChunk.embedding vector(1024)`
 * (PHASE-B §B-D-02). Other dimensions need a separate migration + chunk
 * re-embedding flow.
 */

import { prisma } from "@/lib/db";
import { decryptApiKey } from "@/lib/llm/encryption";

const EXPECTED_DIM = 1024;

interface ResolvedEmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  source: "db" | "env";
}

async function resolveConfig(): Promise<ResolvedEmbeddingConfig> {
  try {
    const row = await prisma.embeddingModel.findFirst({
      where: { is_default: true, is_enabled: true },
    });
    if (row) {
      return {
        baseUrl: row.base_url.replace(/\/$/, ""),
        apiKey: decryptApiKey(row.api_key),
        model: row.model,
        source: "db",
      };
    }
  } catch {
    // DB unreachable / table missing — fall through to env. The env
    // fallback is the documented escape hatch (B-D-04), never hard-fail here.
  }

  const apiKey = process.env.EDGEFN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No embedding configuration: no enabled default in EmbeddingModel and EDGEFN_API_KEY is not set",
    );
  }
  return {
    baseUrl: (process.env.EDGEFN_BASE_URL ?? "https://api.edgefn.net/v1").replace(/\/$/, ""),
    apiKey,
    model: "BAAI/bge-m3",
    source: "env",
  };
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
}

interface OpenAIEmbeddingResult {
  data?: Array<{ embedding?: number[] }>;
  model?: string;
}

function extractEmbeddings(json: unknown): number[][] {
  const direct = json as Partial<EmbeddingResult>;
  if (Array.isArray(direct.embeddings)) {
    return direct.embeddings;
  }

  const openAi = json as OpenAIEmbeddingResult;
  if (Array.isArray(openAi.data)) {
    return openAi.data.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item));
  }

  throw new Error("Embedding response shape is invalid: expected `embeddings` or OpenAI-compatible `data[].embedding`");
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  const cfg = await resolveConfig();

  const response = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    throw new Error(`Embedding request failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const embeddings = extractEmbeddings(json);
  if (embeddings.length !== texts.length) {
    throw new Error(
      `Embedding response count mismatch (model=${cfg.model}, source=${cfg.source}): expected ${texts.length}, got ${embeddings.length}`,
    );
  }

  for (let i = 0; i < embeddings.length; i++) {
    const dim = embeddings[i].length;
    if (dim !== EXPECTED_DIM) {
      throw new Error(
        `Embedding dimension mismatch (model=${cfg.model}, source=${cfg.source}): expected ${EXPECTED_DIM}, got ${dim} at index ${i}`,
      );
    }
  }
  return embeddings;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const embeddings = await createEmbeddings([text]);
  return embeddings[0];
}
