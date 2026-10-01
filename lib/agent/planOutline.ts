import { chatCompletionWithRetry } from "@/lib/llm/client";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { buildOutlinePlanPrompt } from "@/lib/llm/prompts/outlinePlan";
import { ChapterSchema, getAllChapters, getVolumes, type BibleDraft, type NovelProfile, type StoryStateV1 } from "@/lib/validation/schemas";

import type { VolumeArc } from "./volumePlan";

const OUTLINE_PLAN_TIMEOUT_MS = 120_000;
const VOLUME_CHAPTERS = 80;

export interface PlanOutlineInput {
  novelId: string;
  bible: BibleDraft;
  profile: NovelProfile;
  /** End of this bounded planning batch, not necessarily the book ending. */
  targetChapters: number;
  continuous?: boolean;
  storyState?: StoryStateV1;
  recentOutline?: Array<{chapter_index: number; title: string; summary: string}>;
  volumePlans?: VolumeArc[];
  recentProgress?: Array<{chapter_index: number; title: string; excerpt: string}>;
  finalChapter?: number;
  model?: string;
}

export interface PlanOutlineResult {
  /** Bible with the requested outline batch appended across volumes. */
  bible: BibleDraft;
  /** How many new chapters were appended (0 when the outline already covered the target). */
  addedChapters: number;
  cost: { cny: number; tokenIn: number; tokenOut: number };
  /** Model used, or "none" when no LLM call was needed. */
  model: string;
}

type PlannedChapter = { index: number; title: string; summary: string };

/** Plan one bounded batch. The worker persists it before scheduling the next batch.
 * Missing or duplicate existing indices are rejected to keep the writing cursor reliable.
 */
export async function planOutline(input: PlanOutlineInput): Promise<PlanOutlineResult> {
  const { novelId, bible, profile, targetChapters } = input;

  const existing = getAllChapters(bible);
  const ordered = [...existing].sort((a, b) => a.index - b.index);
  if (ordered.some((c, i) => c.index !== i + 1)) throw new Error("planOutline: existing outline has gaps or duplicate indices");
  const maxIndex = existing.reduce((max, c) => Math.max(max, c.index), 0);

  if (maxIndex >= targetChapters) {
    return { bible, addedChapters: 0, cost: { cny: 0, tokenIn: 0, tokenOut: 0 }, model: "none" };
  }
  if (!Number.isInteger(targetChapters) || targetChapters > 2_147_483_647 || targetChapters - maxIndex > 20) {
    throw new Error("planOutline: invalid target or batch exceeds 20 chapters");
  }

  const fromIndex = maxIndex + 1;
  const toIndex = targetChapters;

  const resp = await chatCompletionWithRetry({
    route: "/agent/plan_outline",
    agent: "outline_planner",
    novelId,
    model: input.model,
    messages: buildOutlinePlanPrompt({ profile, bible, fromIndex, toIndex,
      continuous: input.continuous, finalChapter: input.finalChapter, storyState: input.storyState,
      recentOutline: input.recentOutline, volumePlans: input.volumePlans, recentProgress: input.recentProgress }),
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

  const volumes = getVolumes(bible);
  for (const chapter of added) {
    let last = volumes[volumes.length - 1];
    if (last.chapters.length >= VOLUME_CHAPTERS) {
      const arc = input.volumePlans?.find(a => a.volume_index === volumes.length);
      last = { name: arc?.plan.name ?? `第${volumes.length + 1}卷`, theme: arc?.plan.theme ?? "承接前卷，推进尚未解决的冲突", chapter_count_estimate: VOLUME_CHAPTERS, chapters: [] };
      volumes.push(last);
    }
    const extended = { ...last, chapter_count_estimate: Math.max(last.chapter_count_estimate, last.chapters.length + 1),
      chapters: [...last.chapters, chapter] };
    volumes[volumes.length - 1] = extended;
  }
  const updatedBible: BibleDraft = { ...bible, outline: { ...bible.outline,
    volume_1: volumes[0], ...(volumes.length > 1 ? { volumes: volumes.slice(1) } : {}) } };

  return {
    bible: updatedBible,
    addedChapters: added.length,
    cost: { cny: resp.costCny, tokenIn: resp.tokenIn, tokenOut: resp.tokenOut },
    model: resp.model,
  };
}
