// RAG memory retrieval with pgvector.
//
// Strategy:
//   1. Query expansion: embed 3 complementary queries (main, characters, theme)
//      and merge results with score summation for duplicates.
//   2. Time decay: boost chunks from nearby chapters via smooth exponential decay
//      so recent context outweighs distant early-chapter facts.
//   3. Keyword pre-filter as tiebreaker when hybrid quality matters.

import { prisma } from "@/lib/db";
import { createEmbeddings } from "@/lib/llm/embeddings";
import { getLlmMockScenario, isLlmMockEnabled } from "@/lib/llm/mock";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { RetrievalResult } from "@/lib/agent/contracts";
import { errorMessage, logError } from "@/lib/observability/logger";

export type { RetrievalStatus } from "@/lib/agent/contracts";

interface ScoredChunk {
  id: string;
  source: string;
  text: string;
  reason: string;
  score: number;
  chapterIndex: number;
  importance: number;
  chunkType: string;
  matchedKeywords: string[];
}

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
  if (current) keywords.push(current.title);

  return [...new Set(keywords)];
}

/**
 * Time-decay factor: smooth exponential decay so chunks from nearby
 * chapters get boosted relative to distant ones.
 *
 *   decay(distance) = 1 / (1 + 0.1 * distance)
 *
 *   distance 0  -> 1.000
 *   distance 1  -> 0.909
 *   distance 5  -> 0.667
 *   distance 10 -> 0.500
 */
function timeDecay(distance: number): number {
  return 1 / (1 + 0.1 * distance);
}

function matchingKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

/**
 * Run a single vector-similarity search and return scored chunks with
 * their chapter_index attached (via LEFT JOIN).
 */
async function singleSearch(
  embedding: number[],
  novelId: string,
  limit: number,
): Promise<ScoredChunk[]> {
  const embeddingStr = "[" + embedding.join(",") + "]";
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      text: string;
      chunk_type: string;
      chapter_id: string | null;
      importance: number | null;
      similarity: number;
      chapter_index: number | null;
    }>
  >`
    SELECT mc.id, mc.text, mc.chunk_type, mc.chapter_id, mc.importance,
      1 - (mc.embedding <=> ${embeddingStr}::vector) AS similarity,
      cd.chapter_index
    FROM "MemoryChunk" mc
    LEFT JOIN "ChapterDraft" cd ON mc.chapter_id = cd.id
    WHERE mc.novel_id = ${novelId} AND mc.embedding IS NOT NULL
    ORDER BY mc.embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    source: row.chapter_id ? "chapter:" + row.chapter_id : "novel",
    text: row.text,
    reason: "\u7c7b\u578b\uff1a" + row.chunk_type + "\uff0c\u76f8\u4f3c\u5ea6\uff1a" + (row.similarity * 100).toFixed(1) + "%",
    score: row.similarity,
    chapterIndex: row.chapter_index ?? 0,
    importance: row.importance ?? 1,
    chunkType: row.chunk_type,
    matchedKeywords: [],
  }));
}

async function markRetrievedChunksUsed(chunkIds: string[]): Promise<void> {
  const ids = [...new Set(chunkIds)].filter(Boolean);
  if (ids.length === 0) return;
  await prisma.memoryChunk.updateMany({
    where: { id: { in: ids } },
    data: { last_used_at: new Date() },
  });
}

export async function retrieveMemories(
  novelId: string,
  bible: BibleDraft,
  chapterIndex: number,
  topK = 5,
): Promise<RetrievalResult> {
  if (isLlmMockEnabled() && getLlmMockScenario() === "retrieval-error") {
    const message = "Mock retrieval failure requested by LLM_MOCK_SCENARIO.";
    logError("retrieval.failed", {
      novel_id: novelId,
      chapter_index: chapterIndex,
      error: message,
    });
    return { status: "error", memories: [], errorMessage: message };
  }

  try {
    const protagonist = bible.characters.find((c) => c.role === "protagonist");
    const allChapters = [
      ...bible.outline.volume_1.chapters,
      ...(bible.outline.volumes?.flatMap((v) => v.chapters) ?? []),
    ];
    const current = allChapters.find((c) => c.index === chapterIndex);

    // --- 1. Build 3 complementary queries for expansion ---
    const queryTexts: string[] = [];

    // Main query: chapter outline + protagonist
    const mainParts: string[] = [];
    if (current) {
      mainParts.push(current.title, current.summary ?? "");
    }
    if (protagonist) {
      mainParts.push(protagonist.name, protagonist.personality, protagonist.motivation);
    }
    const mainText = mainParts.join(" ").trim();
    if (mainText) queryTexts.push(mainText);

    // Character query: all character names
    const charNames = bible.characters.map((c) => c.name).join(" ");
    if (charNames.trim()) queryTexts.push(charNames);

    // Theme query: world setting + rules
    const themeParts: string[] = [bible.world.setting_summary];
    themeParts.push(...bible.world.rules);
    const themeText = themeParts.join(" ").trim();
    if (themeText) queryTexts.push(themeText);

    if (queryTexts.length === 0) {
      return { status: "empty", memories: [], explanation: { queryTexts: [], keywordFilters: [] } };
    }

    // --- 2. Batch-embed all queries in one API call ---
    const embeddings = await createEmbeddings(queryTexts);
    const keywords = buildQueryKeywords(bible, chapterIndex);
    const retrievalExplanation = { queryTexts, keywordFilters: keywords };
    const candidateLimit = Math.max(topK * 3, 15);

    // --- 3. Run searches in parallel, then merge ---
    const allHits = await Promise.all(
      embeddings.map((emb) => singleSearch(emb, novelId, candidateLimit)),
    );

    // Merge: deduplicate by text prefix, sum scores
    const merged = new Map<string, ScoredChunk>();
    for (const hits of allHits) {
      for (const hit of hits) {
        const key = hit.text.slice(0, 100);
        const existing = merged.get(key);
        if (existing) {
          existing.score += hit.score;
          existing.matchedKeywords = [
            ...new Set([...existing.matchedKeywords, ...matchingKeywords(hit.text, keywords)]),
          ];
          if (
            Math.abs(hit.chapterIndex - chapterIndex) <
            Math.abs(existing.chapterIndex - chapterIndex)
          ) {
            existing.chapterIndex = hit.chapterIndex;
          }
        } else {
          merged.set(key, { ...hit, matchedKeywords: matchingKeywords(hit.text, keywords) });
        }
      }
    }

    let scored = [...merged.values()];

    if (scored.length === 0) {
      return { status: "empty", memories: [], explanation: retrievalExplanation };
    }

    // --- 4. Optional keyword pre-filter ---
    if (keywords.length > 0) {
      const lowerKeywords = keywords.map((k) => k.toLowerCase());
      const filtered = scored.filter((row) =>
        lowerKeywords.some((k) => row.text.toLowerCase().includes(k)),
      );
      if (filtered.length > 0) scored = filtered;
    }

    // --- 5. Time-decay re-ranking ---
    const decayed = scored.map((row) => {
      const distance = Math.abs(row.chapterIndex - chapterIndex);
      const decay = timeDecay(distance);
      return {
        id: row.id,
        source: row.source,
        text: row.text,
        reason: row.reason + "\uff0c\u8ddd\u79bb\uff1a" + distance + " \u7ae0\uff0c\u8870\u51cf\uff1a" + (decay * 100).toFixed(0) + "%",
        score: row.score * decay * row.importance,
        explanation: {
          chunkType: row.chunkType,
          similarity: row.score,
          chapterDistance: distance,
          timeDecay: decay,
          importance: row.importance,
          matchedKeywords: row.matchedKeywords,
        },
      };
    });

    const results = decayed
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (results.length === 0) {
      return { status: "empty", memories: [], explanation: retrievalExplanation };
    }

    await markRetrievedChunksUsed(results.map((row) => row.id));

    return {
      status: "success",
      memories: results.map((row) => ({
        id: row.id,
        source: row.source,
        text: row.text,
        reason: row.reason,
        score: row.score,
        explanation: row.explanation,
      })),
      explanation: retrievalExplanation,
    };
  } catch (err) {
    const message = errorMessage(err);
    logError("retrieval.failed", {
      novel_id: novelId,
      chapter_index: chapterIndex,
      error: message,
    });
    return { status: "error", memories: [], errorMessage: message };
  }
}
