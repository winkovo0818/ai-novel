import { chatCompletionWithRetry } from "@/lib/llm/client";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { buildOutlinePlanPrompt } from "@/lib/llm/prompts/outlinePlan";
import { ChapterSchema, getAllChapters, type BibleDraft, type NovelProfile } from "@/lib/validation/schemas";

const OUTLINE_PLAN_TIMEOUT_MS = 120_000;
// volume_1.chapters tops out at 80 in BibleDraftSchema; multi-volume planning
// (splitting beyond a single volume) is out of scope for this milestone.
const MAX_VOLUME_1_CHAPTERS = 80;

export interface PlanOutlineInput {
  novelId: string;
  bible: BibleDraft;
  profile: NovelProfile;
  /** Total chapters the finished novel should have. */
  targetChapters: number;
}

export interface PlanOutlineResult {
  /** Bible with outline.volume_1.chapters filled up to targetChapters. */
  bible: BibleDraft;
  /** How many new chapters were appended (0 when the outline already covered the target). */
  addedChapters: number;
  cost: { cny: number; tokenIn: number; tokenOut: number };
  /** Model used, or "none" when no LLM call was needed. */
  model: string;
}

type PlannedChapter = { index: number; title: string; summary: string };

/**
 * Front-load the full outline before the per-chapter generation loop. If the
 * seed outline (e.g. 8 chapters) is shorter than the target (e.g. 40), ask the
 * planner for real title + summary for every missing chapter and append them to
 * volume_1 so `buildChapterContext` finds a real outline entry instead of
 * falling back to「第 N 章」(the spike's continuity-loss root cause).
 *
 * Headless and DB-free so it can be unit-tested with a mocked LLM; the caller
 * (CLI launcher) persists the returned Bible. Requires the model to cover the
 * *entire* missing range — a gap would reintroduce title loss, so a missing
 * chapter throws rather than silently leaving a hole.
 */
export async function planOutline(input: PlanOutlineInput): Promise<PlanOutlineResult> {
  const { novelId, bible, profile, targetChapters } = input;

  const existing = getAllChapters(bible);
  const maxIndex = existing.reduce((max, c) => Math.max(max, c.index), 0);

  if (maxIndex >= targetChapters) {
    return { bible, addedChapters: 0, cost: { cny: 0, tokenIn: 0, tokenOut: 0 }, model: "none" };
  }
  if (targetChapters > MAX_VOLUME_1_CHAPTERS) {
    throw new Error(
      `planOutline: targetChapters ${targetChapters} exceeds the single-volume cap ${MAX_VOLUME_1_CHAPTERS}; multi-volume planning is not yet supported`,
    );
  }

  const fromIndex = maxIndex + 1;
  const toIndex = targetChapters;

  const resp = await chatCompletionWithRetry({
    route: "/agent/plan_outline",
    agent: "outline_planner",
    novelId,
    messages: buildOutlinePlanPrompt({ profile, bible, fromIndex, toIndex }),
    responseFormat: "json_object",
    temperature: 0.7,
    timeoutMs: OUTLINE_PLAN_TIMEOUT_MS,
  });

  const parsed = parseFirstJsonObject<{ chapters?: unknown[] }>(resp.content);
  const rawChapters = Array.isArray(parsed?.chapters) ? parsed.chapters : [];

  // Keep only schema-valid chapters inside the requested range, first-wins on
  // duplicate indices. Anything out of range or malformed is dropped here and
  // surfaces below as a missing-index error.
  const byIndex = new Map<number, PlannedChapter>();
  for (const raw of rawChapters) {
    const chapter = ChapterSchema.safeParse(raw);
    if (!chapter.success) continue;
    const { index } = chapter.data;
    if (index < fromIndex || index > toIndex) continue;
    if (!byIndex.has(index)) byIndex.set(index, chapter.data);
  }

  const added: PlannedChapter[] = [];
  for (let index = fromIndex; index <= toIndex; index += 1) {
    const chapter = byIndex.get(index);
    if (!chapter) {
      throw new Error(
        `planOutline: model returned no valid chapter for index ${index} (got ${byIndex.size}/${toIndex - fromIndex + 1} of the requested range)`,
      );
    }
    added.push(chapter);
  }

  const updatedBible: BibleDraft = {
    ...bible,
    outline: {
      ...bible.outline,
      volume_1: {
        ...bible.outline.volume_1,
        chapter_count_estimate: Math.max(bible.outline.volume_1.chapter_count_estimate, targetChapters),
        chapters: [...bible.outline.volume_1.chapters, ...added].sort((a, b) => a.index - b.index),
      },
    },
  };

  return {
    bible: updatedBible,
    addedChapters: added.length,
    cost: { cny: resp.costCny, tokenIn: resp.tokenIn, tokenOut: resp.tokenOut },
    model: resp.model,
  };
}
