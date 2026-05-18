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
import { logInfo, logError } from "@/lib/observability/logger";
import { logUsage } from "@/lib/llm/usage";

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
  const startMs = Date.now();

  let response: Response;
  try {
    response = await fetch(`${cfg.baseUrl}/embeddings`, {
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
  } catch (err) {
    const tookMs = Date.now() - startMs;
    logError("embedding.call_failed", {
      source: cfg.source,
      model: cfg.model,
      input_count: texts.length,
      took_ms: tookMs,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    const tookMs = Date.now() - startMs;
    logError("embedding.http_error", {
      source: cfg.source,
      model: cfg.model,
      input_count: texts.length,
      status: response.status,
      took_ms: tookMs,
      error: body.slice(0, 200),
    });
    throw new Error(`Embedding request failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const embeddings = extractEmbeddings(json);
  if (embeddings.length !== texts.length) {
    logError("embedding.count_mismatch", {
      source: cfg.source,
      model: cfg.model,
      expected: texts.length,
      got: embeddings.length,
    });
    throw new Error(
      `Embedding response count mismatch (model=${cfg.model}, source=${cfg.source}): expected ${texts.length}, got ${embeddings.length}`,
    );
  }

  for (let i = 0; i < embeddings.length; i++) {
    const dim = embeddings[i].length;
    if (dim !== EXPECTED_DIM) {
      logError("embedding.dimension_mismatch", {
        source: cfg.source,
        model: cfg.model,
        index: i,
        expected: EXPECTED_DIM,
        got: dim,
      });
      throw new Error(
        `Embedding dimension mismatch (model=${cfg.model}, source=${cfg.source}): expected ${EXPECTED_DIM}, got ${dim} at index ${i}`,
      );
    }
  }

  const tookMs = Date.now() - startMs;
  logInfo("embedding.call", {
    source: cfg.source,
    model: cfg.model,
    input_count: texts.length,
    dimension: EXPECTED_DIM,
    took_ms: tookMs,
    status: "ok",
  });

  logUsage({
    userId: "system",
    route: "/embedding",
    agent: "retrieval",
    model: cfg.model,
    tokenIn: texts.reduce((sum, t) => sum + t.length, 0),
    tokenOut: texts.length * EXPECTED_DIM,
    costCny: 0,
    status: "ok",
    tookMs,
  }).catch(() => {});

  return embeddings;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const embeddings = await createEmbeddings([text]);
  return embeddings[0];
}
