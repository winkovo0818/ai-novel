import { z } from "zod";
import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/lib/auth/session";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { jsonError, jsonOk } from "@/lib/http/json";
import { latestDoneChapter, loadStoryMemory } from "@/lib/agent/storyMemory";
import { readVolumeArc } from "@/lib/agent/volumePlanStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await getRequiredUserId(); } catch { return jsonError("UNAUTHORIZED", "Login required", false, 401); }
  const { id } = await context.params;
  const novel = await prisma.novel.findUnique({ where: { id }, include: { bible: true } });
  if (!novel || novel.deleted_at || !canAccessOwnerResource(novel.user_id, userId)) return jsonError("NOT_FOUND", "作品不存在", false, 404);
  if (!novel.bible) return jsonError("NO_BIBLE", "作品尚未生成设定", false, 400);
  const last = await latestDoneChapter(id);
  const requested = new URL(request.url).searchParams.get("chapter_index");
  const parsed = z.coerce.number().int().min(0).max(last).safeParse(requested ?? last);
  if (!parsed.success || requested === "") return jsonError("INVALID_INPUT", "章节范围必须在 0 和最近完成章之间", false, 400);
  const chapter = parsed.data;
  try {
    const arc = await readVolumeArc(id, chapter + 1);
    const memory = await loadStoryMemory(id, novel.bible, chapter, arc?.plan.thread_targets);
    return jsonOk({ chapter_index: chapter, state: memory.state, historical_available: memory.historical_available,
      baseline_chapter: memory.baseline_chapter, stale_records: memory.stale_records,
      records: memory.records.map(r => ({ category: r.category, value: r.value, valid_from_chapter: r.valid_from_chapter,
        valid_to_chapter: r.valid_to_chapter, source_kind: r.source_kind, source_chapter_id: r.source_chapter_id, source_chapter_version: r.source_chapter_version })),
      volume_arc: arc ?? null });
  } catch (error) {
    return jsonError("MEMORY_UNAVAILABLE", error instanceof Error ? error.message : "剧情记忆读取失败", true, 409);
  }
}
