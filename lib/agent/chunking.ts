import { prisma } from "@/lib/db";
import { createEmbeddings } from "@/lib/llm/embeddings";

export type ChunkType = "scene" | "dialogue" | "character_fact" | "world_rule" | "plot_thread" | "summary";

export interface Chunk {
  chunk_type: ChunkType;
  text: string;
  metadata?: Record<string, unknown>;
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

function splitByParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MIN_CHUNK_LENGTH);
}

function mergeShortChunks(paragraphs: string[]): string[] {
  const result: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if (current.length + p.length > MAX_CHUNK_LENGTH && current.length >= MIN_CHUNK_LENGTH) {
      result.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }

  if (current.trim().length >= MIN_CHUNK_LENGTH) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Split chapter content into typed chunks for RAG indexing.
 */
export function chunkChapterContent(content: string): Chunk[] {
  const paragraphs = splitByParagraphs(content);
  const merged = mergeShortChunks(paragraphs);

  return merged.map((text) => ({
    chunk_type: classifyChunk(text),
    text,
    metadata: { length: text.length },
  }));
}

/**
 * Index a chapter: chunk it, embed it, and persist to MemoryChunk.
 */
export async function indexChapter(
  novelId: string,
  chapterId: string,
  content: string,
): Promise<{ chunks: number }> {
  const chunks = chunkChapterContent(content);
  if (chunks.length === 0) return { chunks: 0 };

  // Delete existing chunks for this chapter to avoid duplicates
  await prisma.memoryChunk.deleteMany({ where: { chapter_id: chapterId } });

  const embeddings = await createEmbeddings(chunks.map((c) => c.text));

  await prisma.memoryChunk.createMany({
    data: chunks.map((chunk, i) => ({
      novel_id: novelId,
      chapter_id: chapterId,
      chunk_type: chunk.chunk_type as string,
      text: chunk.text,
      embedding: embeddings[i] ?? [],
      metadata: (chunk.metadata ?? {}) as object,
    })),
  });

  return { chunks: chunks.length };
}
