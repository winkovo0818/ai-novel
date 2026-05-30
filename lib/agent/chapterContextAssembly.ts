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
 * Resolve which volume a chapter belongs to and return that volume's summary.
 * Walks volumes accumulating chapter counts until the target index falls inside
 * one — the same logic the draft route used inline before extraction.
 */
function findVolumeSummary(
  bible: BibleDraft,
  chapterIndex: number,
  volumeSummaries?: ReadonlyArray<{ volume_index: number; summary: string }>,
): string | undefined {
  if (!volumeSummaries || volumeSummaries.length === 0) return undefined;
  const volumes = getVolumes(bible);
  let currentVolumeIndex = 0;
  let chaptersSeen = 0;
  for (let i = 0; i < volumes.length; i += 1) {
    chaptersSeen += volumes[i].chapters.length;
    if (chapterIndex <= chaptersSeen) {
      currentVolumeIndex = i;
      break;
    }
  }
  return volumeSummaries.find((vs) => vs.volume_index === currentVolumeIndex)?.summary;
}

export interface AssembleChapterContextInput {
  novelId: string;
  bible: BibleDraft;
  chapters: Array<ChapterDraftView & { summary?: { summary: string } | null }>;
  chapterIndex: number;
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
  const volumeSummary = findVolumeSummary(input.bible, input.chapterIndex, input.volumeSummaries);

  const retrieval = input.skipRetrieval
    ? { status: "empty" as RetrievalStatus, memories: [] }
    : normalizeRetrievalResult(
        await retrieveMemories(input.novelId, input.bible, input.chapterIndex, input.retrievalTopK ?? 5),
      );

  const context = buildChapterContext(input.bible, input.chapters, input.chapterIndex, {
    novelSummary: input.novelSummary,
    volumeSummary,
    retrievedMemories: retrieval.memories,
    retrievalStatus: retrieval.status,
    beatSheet: input.beatSheet,
  });

  return { context, retrieval };
}
