import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BibleDraftSchema, StateDiffSchema } from "@/lib/validation/schemas";
import { applyStateDiff, validateStateDiff } from "@/lib/validation/stateDiffMerge";
import { syncStoryMemory } from "@/lib/agent/storyMemory";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { withLlmCallContext } from "@/lib/llm/callContext";
import { generationCallContext } from "@/lib/agent/generationExecution";
import type { JobExecution } from "./execution";

export interface BackfillStatePayload {
  novel_id: string;
}
export function isBackfillStatePayload(p: unknown): p is BackfillStatePayload {
  return typeof p === "object" && p !== null && typeof (p as { novel_id?: unknown }).novel_id === "string";
}

/** 覆盖多章事件积累的合法上限（F3 校准：单章常态 17–24 条，批准滞后按序补齐时上限放宽到 schema 最大值）。 */
const MAX_STATE_CHANGES = 40;

/**
 * F1（2026-10 真实跑批 + 通读发现）：质量门拦下的章节保存为 draft 时不应用
 * state-diff，人工批准（PATCH → done）后状态层滞后；滞后累积会让下一次 diff
 * 覆盖多章事件而超过防回灌上限止链（第 8 章实测 26 条/4 章）。本任务为
 * checkpoint 之后的已定稿章节按序补跑 state-diff，批准路径不再丢状态。
 *
 * 无 checkpoint（从未自动连载）或无滞后时静默空转，因此可以放心在每次
 * 章节 draft→done 时入队。间隙章节始终在 checkpoint 尾部（run 停在第一个
 * gate 失败处），syncStoryMemory 的升序推进约束天然满足。
 */
export async function handleBackfillState(payload: Prisma.JsonValue, execution?: JobExecution): Promise<void> {
  if (!isBackfillStatePayload(payload)) throw new Error("Invalid backfill_state payload");
  const novel = await prisma.novel.findUnique({ where: { id: payload.novel_id },
    include: { bible: true, chapters: { where: { status: "done" }, orderBy: { chapter_index: "asc" } } } });
  if (!novel || novel.deleted_at || !novel.bible) return;
  const checkpoint = await prisma.storyMemoryCheckpoint.findUnique({ where: { novel_id: novel.id } });
  if (!checkpoint) return; // 从未走过自动连载的作品没有状态层，无事可补
  const gaps = novel.chapters.filter(c => c.chapter_index > checkpoint.latest_chapter && c.content.trim());
  if (gaps.length === 0) return;

  let bible = BibleDraftSchema.parse(novel.bible.content);
  let bibleUpdatedAt = novel.bible.updated_at;
  await withLlmCallContext(generationCallContext({ novelId: novel.id, userId: novel.user_id ?? undefined,
    phase: "postprocessing", execution }), async () => {
    for (const chapter of gaps) {
      execution?.signal?.throwIfAborted();
      const request = {
        route: "/jobs/backfill_state/state-diff", agent: "state_updater", novelId: novel.id,
        messages: buildStateDiffPrompt({ bible, storyState: bible.story_state,
          chapterIndex: chapter.chapter_index, chapterTitle: chapter.title, chapterContent: chapter.content }),
        responseFormat: "json_object" as const, temperature: 0, timeoutMs: 90_000,
      };
      // 与 generate_chapter 的 F7 修复一致：解析失败重试第二个样本。
      let diff = StateDiffSchema.safeParse(parseFirstJsonObject((await chatCompletionWithRetry(request)).content));
      if (!diff.success) {
        diff = StateDiffSchema.safeParse(parseFirstJsonObject((await chatCompletionWithRetry(request)).content));
        if (!diff.success) throw new Error(`第 ${chapter.chapter_index} 章 state-diff 连续两次无法解析`);
      }
      const issues = validateStateDiff(bible, diff.data, chapter.content, { maxStateChanges: MAX_STATE_CHANGES });
      if (issues.length) throw new Error(`第 ${chapter.chapter_index} 章状态校验失败：${issues.map(i => i.message).join("；")}`);
      bible = applyStateDiff(bible, diff.data, chapter.chapter_index);
      const row = await prisma.$transaction(async tx => {
        await execution?.assertActive(tx);
        const updated = await tx.bibleDraft.update({
          where: { novel_id: novel.id, updated_at: bibleUpdatedAt },
          data: { content: bible as never },
        });
        await syncStoryMemory(tx, novel.id, bible, updated.updated_at,
          { kind: "generated_chapter", chapterIndex: chapter.chapter_index, chapterId: chapter.id, chapterVersion: chapter.version });
        execution?.signal?.throwIfAborted();
        return updated;
      });
      bibleUpdatedAt = row.updated_at; // 串行推进乐观锁水位
    }
  });
}
