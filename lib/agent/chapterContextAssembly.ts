import type { VolumeArc } from "./volumePlan";
import { buildChapterContext, type ChapterContext, type ChapterDraftView } from "@/lib/agent/chapterContext";
import { retrieveMemories } from "@/lib/agent/retrieval";
import type { BeatSheet, RetrievalResult, RetrievalStatus } from "@/lib/agent/contracts";
import { getVolumes, type BibleDraft } from "@/lib/validation/schemas";

const RETRIEVAL_STATUSES = new Set<RetrievalStatus>(["success", "empty", "error"]);

function normalizeRetrievalResult(result: Partial<RetrievalResult> | null | undefined): RetrievalResult {
  const status = typeof result?.status === "string" && RETRIEVAL_STATUSES.has(result.status as RetrievalStatus)
    ? (result.status as RetrievalStatus)
    : "empty";
  const memories = Array.isArray(result?.memories) ? result.memories : [];
  return {
    status,
    memories,
    errorMessage: typeof result?.errorMessage === "string" ? result.errorMessage : undefined,
    explanation: result?.explanation,
  };
}

/**
 * 定位 chapterIndex 所在卷的 0-based 索引。走卷累加章数直到目标落入某卷。
 */
function findCurrentVolumeIndex(bible: BibleDraft, chapterIndex: number): number {
  const volumes = getVolumes(bible);
  let chaptersSeen = 0;
  for (let i = 0; i < volumes.length; i += 1) {
    chaptersSeen += volumes[i].chapters.length;
    if (chapterIndex <= chaptersSeen) return i;
  }
  return 0;
}

/**
 * Resolve which volume a chapter belongs to and return that volume's summary.
 */
function findVolumeSummary(
  bible: BibleDraft,
  chapterIndex: number,
  volumeSummaries?: ReadonlyArray<{ volume_index: number; summary: string }>,
): string | undefined {
  if (!volumeSummaries || volumeSummaries.length === 0) return undefined;
  return volumeSummaries.find((vs) => vs.volume_index === findCurrentVolumeIndex(bible, chapterIndex))?.summary;
}

/**
 * 收集除当前卷外、已生成摘要的各卷摘要（按卷序拼接）。让 writer/critic 在长篇中能看到
 * 前序卷的核心推进，而非只靠全书梗概一句话——防 40+ 章远端失锚。当前卷由 volumeSummary
 * 单独注入，故这里排除，避免冗余。
 */
function collectPriorVolumeSummaries(
  bible: BibleDraft,
  chapterIndex: number,
  volumeSummaries?: ReadonlyArray<{ volume_index: number; summary: string }>,
): string | undefined {
  if (!volumeSummaries || volumeSummaries.length === 0) return undefined;
  const currentIdx = findCurrentVolumeIndex(bible, chapterIndex);
  const prior = volumeSummaries
    .filter((vs) => vs.volume_index < currentIdx)
    .sort((a, b) => a.volume_index - b.volume_index)
    .map((vs) => `【卷${vs.volume_index + 1}】${vs.summary}`)
    .join("\n");
  return prior || undefined;
}

export interface AssembleChapterContextInput {
  novelId: string;
  bible: BibleDraft;
  chapters: Array<ChapterDraftView & { summary?: { summary: string } | null }>;
  chapterIndex: number;
  volumeArc?: VolumeArc;
  novelSummary?: string;
  volumeSummaries?: ReadonlyArray<{ volume_index: number; summary: string }>;
  beatSheet?: BeatSheet;
  /** RAG topK; default 5. */
  retrievalTopK?: number;
  /** Skip retrieval entirely (headless eval without pgvector). Default false. */
  skipRetrieval?: boolean;
}

export interface AssembledChapterContext {
  context: ChapterContext;
  retrieval: RetrievalResult;
}

/**
 * Shared chapter-context assembly: volume location + RAG retrieval +
 * buildChapterContext. Extracted from the draft route so the headless
 * auto-pilot pipeline runs the exact same context wiring the interactive
 * editor does.
 */
export async function assembleChapterContext(
  input: AssembleChapterContextInput,
): Promise<AssembledChapterContext> {
  // Aggregate summaries do not record their historical snapshot. When rewriting
  // an earlier chapter, omit summaries that may already include later events.
  const hasLaterContent = input.chapters.some(c => c.chapter_index >= input.chapterIndex && c.content.trim());
  const volumeSummary = hasLaterContent ? undefined : findVolumeSummary(input.bible, input.chapterIndex, input.volumeSummaries);
  const priorVolumeSummaries = collectPriorVolumeSummaries(input.bible, input.chapterIndex, input.volumeSummaries);

  const retrieval = input.skipRetrieval
    ? { status: "empty" as RetrievalStatus, memories: [] }
    : normalizeRetrievalResult(
        await retrieveMemories(input.novelId, input.bible, input.chapterIndex, input.retrievalTopK ?? 5),
      );

  const context = buildChapterContext(input.bible, input.chapters, input.chapterIndex, {
    volumeArc: input.volumeArc,
    novelSummary: hasLaterContent ? undefined : input.novelSummary,
    volumeSummary,
    priorVolumeSummaries,
    retrievedMemories: retrieval.memories,
    retrievalStatus: retrieval.status,
    beatSheet: input.beatSheet,
  });

  return { context, retrieval };
}
