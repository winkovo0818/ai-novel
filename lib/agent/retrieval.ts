import { prisma } from "@/lib/db";
import { createEmbedding } from "@/lib/llm/embeddings";
import type { BibleDraft } from "@/lib/validation/schemas";

export interface RetrievedMemory {
  source: string;
  text: string;
  reason: string;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function keywordFilter(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function buildQueryKeywords(bible: BibleDraft, chapterIndex: number): string[] {
  const keywords: string[] = [];

  // Add protagonist name
  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  if (protagonist) keywords.push(protagonist.name);

  // Add character names
  bible.characters.forEach((c) => keywords.push(c.name));

  // Add world keywords
  bible.world.factions.forEach((f) => keywords.push(f.name));
  keywords.push(...bible.world.geography);

  // Add outline title for current chapter
  const allChapters = [
    ...bible.outline.volume_1.chapters,
    ...(bible.outline.volumes?.flatMap((v) => v.chapters) ?? []),
  ];
  const current = allChapters.find((c) => c.index === chapterIndex);
  if (current) {
    keywords.push(current.title);
  }

  return [...new Set(keywords)];
}

/**
 * Retrieve relevant memory chunks for a chapter.
 *
 * Strategy:
 * 1. Keyword pre-filter from all chunks of this novel.
 * 2. Vector cosine similarity ranking.
 * 3. Return top K with source attribution.
 */
export async function retrieveMemories(
  novelId: string,
  bible: BibleDraft,
  chapterIndex: number,
  topK = 5,
): Promise<RetrievedMemory[]> {
  // Build query from chapter context
  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  const allChapters = [
    ...bible.outline.volume_1.chapters,
    ...(bible.outline.volumes?.flatMap((v) => v.chapters) ?? []),
  ];
  const current = allChapters.find((c) => c.index === chapterIndex);

  const queryParts: string[] = [];
  if (current) {
    queryParts.push(current.title, current.summary ?? "");
  }
  if (protagonist) {
    queryParts.push(protagonist.name, protagonist.personality, protagonist.motivation);
  }

  const queryText = queryParts.join(" ").trim();
  if (!queryText) return [];

  const queryEmbedding = await createEmbedding(queryText);
  const keywords = buildQueryKeywords(bible, chapterIndex);

  // Load all chunks for this novel (filter by keyword if keywords exist)
  const chunks = await prisma.memoryChunk.findMany({
    where: { novel_id: novelId },
    select: { id: true, text: true, chunk_type: true, embedding: true, chapter_id: true },
  });

  if (chunks.length === 0) return [];

  // Score and rank
  const scored = chunks
    .filter((chunk) => {
      if (keywords.length === 0) return true;
      return keywordFilter(chunk.text, keywords);
    })
    .map((chunk) => {
      const sim = chunk.embedding.length > 0
        ? cosineSimilarity(queryEmbedding, chunk.embedding)
        : 0;
      return {
        source: chunk.chapter_id ? `chapter:${chunk.chapter_id}` : "novel",
        text: chunk.text,
        reason: `类型：${chunk.chunk_type}，相似度：${(sim * 100).toFixed(1)}%`,
        score: sim,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
