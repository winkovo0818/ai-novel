import { prisma } from "@/lib/db";
import { createEmbedding } from "@/lib/llm/embeddings";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { RetrievalResult } from "@/lib/agent/contracts";

export type { RetrievalStatus } from "@/lib/agent/contracts";

function buildQueryKeywords(bible: BibleDraft, chapterIndex: number): string[] {
  const keywords: string[] = [];

  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  if (protagonist) keywords.push(protagonist.name);

  bible.characters.forEach((c) => keywords.push(c.name));

  bible.world.factions.forEach((f) => keywords.push(f.name));
  keywords.push(...bible.world.geography);

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
 * Retrieve relevant memory chunks for a chapter using pgvector cosine similarity.
 *
 * Strategy:
 * 1. Generate query embedding via EdgeFn (bge-m3, 1024-dim).
 * 2. Use SQL-side cosine similarity (`<=>` operator) powered by HNSW index.
 * 3. Optional keyword pre-filter for hybrid quality.
 * 4. Return top K with source attribution and status.
 */
export async function retrieveMemories(
  novelId: string,
  bible: BibleDraft,
  chapterIndex: number,
  topK = 5,
): Promise<RetrievalResult> {
  try {
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
    if (!queryText) {
      return { status: "empty", memories: [] };
    }

    const queryEmbedding = await createEmbedding(queryText);

    // Use SQL-side cosine similarity via pgvector
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const keywords = buildQueryKeywords(bible, chapterIndex);

    // Hybrid: first get more candidates via vector search, then keyword-filter
    // If no keywords, just use pure vector similarity
    const candidateLimit = keywords.length > 0 ? topK * 4 : topK;

    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; text: string; chunk_type: string; chapter_id: string | null; similarity: number }>
    >(
      `SELECT id, text, chunk_type, chapter_id,
              1 - (embedding <=> $1::vector) AS similarity
       FROM "MemoryChunk"
       WHERE novel_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      embeddingStr,
      novelId,
      candidateLimit,
    );

    if (rows.length === 0) {
      return { status: "empty", memories: [] };
    }

    let scored: Array<{
      source: string;
      text: string;
      reason: string;
      score: number;
    }>;

    if (keywords.length > 0) {
      // Keyword pre-filter, then re-rank by similarity
      const lowerKeywords = keywords.map((k) => k.toLowerCase());
      const filtered = rows.filter((row) =>
        lowerKeywords.some((k) => row.text.toLowerCase().includes(k)),
      );
      scored = filtered.map((row) => ({
        source: row.chapter_id ? `chapter:${row.chapter_id}` : "novel",
        text: row.text,
        reason: `类型：${row.chunk_type}，相似度：${(row.similarity * 100).toFixed(1)}%`,
        score: row.similarity,
      }));
    } else {
      scored = rows.map((row) => ({
        source: row.chapter_id ? `chapter:${row.chapter_id}` : "novel",
        text: row.text,
        reason: `类型：${row.chunk_type}，相似度：${(row.similarity * 100).toFixed(1)}%`,
        score: row.similarity,
      }));
    }

    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (results.length === 0) {
      return { status: "empty", memories: [] };
    }

    return { status: "success", memories: results };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[retrieval] failed for novel=${novelId} chapter=${chapterIndex}: ${message}`);
    return { status: "error", memories: [], errorMessage: message };
  }
}