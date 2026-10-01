import { JobDeferredError } from "@/lib/jobs/deferred";
import { prisma } from "@/lib/db";
import { createEmbedding, createEmbeddings } from "@/lib/llm/embeddings";
import type { Prisma } from "@prisma/client";
import { getLlmCallContext } from "@/lib/llm/callContext";

export type ChunkType = "scene" | "dialogue" | "character_fact" | "world_rule" | "plot_thread" | "summary";

export interface Chunk {
  chunk_type: ChunkType;
  text: string;
  metadata: ChunkMetadata;
}

interface ChunkMetadata {
  length: number;
  chunk_index: number;
  paragraph_start: number;
  paragraph_end: number;
}

interface IndexedParagraph {
  text: string;
  paragraphIndex: number;
}

interface MergedChunk {
  text: string;
  paragraphStart: number;
  paragraphEnd: number;
}

class MemoryChunkIndexError extends Error {
  constructor(
    stage: "embedding" | "insert",
    chunk: Chunk,
    chunkIndex: number,
    totalChunks: number,
    cause: unknown,
  ) {
    const paragraphs =
      chunk.metadata.paragraph_start === chunk.metadata.paragraph_end
        ? String(chunk.metadata.paragraph_start)
        : `${chunk.metadata.paragraph_start}-${chunk.metadata.paragraph_end}`;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const preview = chunk.text.slice(0, 80).replace(/\s+/g, " ");
    super(
      [
        `MEMORY_CHUNK_INDEX_FAILED chunk=${chunkIndex + 1}/${totalChunks}`,
        `paragraphs=${paragraphs}`,
        `stage=${stage}`,
        `preview="${preview}"`,
        `cause="${causeMessage.slice(0, 300)}"`,
      ].join(" "),
    );
    this.name = "MemoryChunkIndexError";
  }
}

const MAX_CHUNK_LENGTH = 800;
const MIN_CHUNK_LENGTH = 80;

/**
 * Heuristic chunk classifier.
 */
function classifyChunk(text: string): ChunkType {
  const t = text.trim();
  if (t.startsWith("【") && t.includes("】")) return "character_fact";
  if (/^世界规则|法则|设定/.test(t)) return "world_rule";
  if (/^[「"""].*[」"""]/.test(t) && t.length < 300) return "dialogue";
  if (/伏笔|线索|谜团|悬念/.test(t)) return "plot_thread";
  return "scene";
}

function estimateChunkImportance(chunk: Chunk): number {
  const text = chunk.text;
  let score = 1;
  if (chunk.chunk_type === "plot_thread") score += 0.35;
  if (chunk.chunk_type === "character_fact" || chunk.chunk_type === "world_rule") score += 0.2;
  if (/伏笔|线索|秘密|真相|死亡|背叛|约定|誓言|命运/.test(text)) score += 0.25;
  if (text.length > 500) score += 0.1;
  return Math.min(2, Number(score.toFixed(2)));
}

function splitByParagraphs(content: string): IndexedParagraph[] {
  return content
    .split(/\n{2,}/)
    .map((p, index) => ({ text: p.trim(), paragraphIndex: index + 1 }))
    .filter((p) => p.text.length > 0)
    .flatMap(p => Array.from({ length: Math.ceil(p.text.length / MAX_CHUNK_LENGTH) }, (_, i) => ({
      ...p, text: p.text.slice(i * MAX_CHUNK_LENGTH, (i + 1) * MAX_CHUNK_LENGTH),
    })));
}

function mergeShortChunks(paragraphs: IndexedParagraph[]): MergedChunk[] {
  const result: MergedChunk[] = [];
  let current: MergedChunk | null = null;

  for (const p of paragraphs) {
    if (current && current.text.length + 2 + p.text.length > MAX_CHUNK_LENGTH) {
      result.push({ ...current, text: current.text.trim() });
      current = {
        text: p.text,
        paragraphStart: p.paragraphIndex,
        paragraphEnd: p.paragraphIndex,
      };
    } else {
      current = current
        ? {
            text: `${current.text}\n\n${p.text}`,
            paragraphStart: current.paragraphStart,
            paragraphEnd: p.paragraphIndex,
          }
        : {
            text: p.text,
            paragraphStart: p.paragraphIndex,
            paragraphEnd: p.paragraphIndex,
          };
    }
  }

  if (current && current.text.trim()) {
    result.push({ ...current, text: current.text.trim() });
  }

  return result;
}

/**
 * Split chapter content into typed chunks for RAG indexing.
 */
export function chunkChapterContent(content: string): Chunk[] {
  if (content.trim().length < MIN_CHUNK_LENGTH) return [];
  const paragraphs = splitByParagraphs(content);
  const merged = mergeShortChunks(paragraphs);

  return merged.map((chunk, index) => ({
    chunk_type: classifyChunk(chunk.text),
    text: chunk.text,
    metadata: {
      length: chunk.text.length,
      chunk_index: index + 1,
      paragraph_start: chunk.paragraphStart,
      paragraph_end: chunk.paragraphEnd,
    },
  }));
}

/**
 * Index a chapter: chunk it, embed it, and persist to MemoryChunk.
 * Uses raw SQL for vector column since Prisma doesn't support pgvector types natively.
 */
export async function indexChapter(
  novelId: string,
  chapterId: string,
  content: string,
  beforeWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<{ chunks: number }> {
  const chunks = chunkChapterContent(content);

  const embeddings = chunks.length === 0 ? [] : await createEmbeddings(chunks.map((c) => c.text)).catch(async (batchErr) => {
    if (batchErr instanceof JobDeferredError) throw batchErr;
    getLlmCallContext()?.signal?.throwIfAborted();
    const located: number[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        located.push(await createEmbedding(chunks[i].text));
      } catch (err) {
        if (err instanceof JobDeferredError) throw err;
        throw new MemoryChunkIndexError("embedding", chunks[i], i, chunks.length, err);
      }
    }
    return located.length === chunks.length
      ? located
      : Promise.reject(new MemoryChunkIndexError("embedding", chunks[0], 0, chunks.length, batchErr));
  });

  // Delete existing chunks for this chapter only after embeddings succeed.
  // If the provider rejects one paragraph, old chunks remain queryable and
  // the failure still points at the exact source paragraph.
  await prisma.$transaction(async tx => {
    getLlmCallContext()?.signal?.throwIfAborted();
    await beforeWrite?.(tx);
    await tx.memoryChunk.deleteMany({ where: { chapter_id: chapterId } });

    // Insert using raw SQL since embedding is a vector(1024) column.
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      if (!embedding || embedding.length !== 1024 || embedding.some(n => !Number.isFinite(n))) {
        throw new MemoryChunkIndexError("embedding", chunk, i, chunks.length, new Error("Expected 1024 finite vector coordinates"));
      }

      const embeddingStr = `[${embedding.join(",")}]`;
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO "MemoryChunk" (id, novel_id, chapter_id, chunk_type, text, embedding, metadata, importance, source_kind)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, $6, $7, $8)`,
          novelId,
          chapterId,
          chunk.chunk_type as string,
          chunk.text,
          embeddingStr,
          chunk.metadata,
          estimateChunkImportance(chunk),
          "chapter",
        );
      } catch (err) {
        if (err instanceof JobDeferredError) throw err;
        throw new MemoryChunkIndexError("insert", chunk, i, chunks.length, err);
      }
    }
    getLlmCallContext()?.signal?.throwIfAborted();
  });

  return { chunks: chunks.length };
}
