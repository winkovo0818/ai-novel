import { prisma } from "@/lib/db";
import { createEmbedding, createEmbeddings } from "@/lib/llm/embeddings";

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
    .filter((p) => p.text.length >= MIN_CHUNK_LENGTH);
}

function mergeShortChunks(paragraphs: IndexedParagraph[]): MergedChunk[] {
  const result: MergedChunk[] = [];
  let current: MergedChunk | null = null;

  for (const p of paragraphs) {
    if (current && current.text.length + p.text.length > MAX_CHUNK_LENGTH && current.text.length >= MIN_CHUNK_LENGTH) {
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

  if (current && current.text.trim().length >= MIN_CHUNK_LENGTH) {
    result.push({ ...current, text: current.text.trim() });
  }

  return result;
}

/**
 * Split chapter content into typed chunks for RAG indexing.
 */
export function chunkChapterContent(content: string): Chunk[] {
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
): Promise<{ chunks: number }> {
  const chunks = chunkChapterContent(content);
  if (chunks.length === 0) return { chunks: 0 };

  const embeddings = await createEmbeddings(chunks.map((c) => c.text)).catch(async (batchErr) => {
    const located: number[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        located.push(await createEmbedding(chunks[i].text));
      } catch (err) {
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
  await prisma.memoryChunk.deleteMany({ where: { chapter_id: chapterId } });

  // Insert using raw SQL since embedding is a vector(1024) column.
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    if (!embedding || embedding.length !== 1024) continue;

    const embeddingStr = `[${embedding.join(",")}]`;
    try {
      await prisma.$executeRawUnsafe(
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
      throw new MemoryChunkIndexError("insert", chunk, i, chunks.length, err);
    }
  }

  return { chunks: chunks.length };
}
