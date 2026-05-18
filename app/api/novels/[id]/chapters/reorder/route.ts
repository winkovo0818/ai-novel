import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/http/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ReorderSchema = z.object({
  volumeIndex: z.number().int().min(0),
  chapterOrder: z.array(z.number().int().min(1)),
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const userId = await getRequiredUserId();

  const novel = await prisma.novel.findUnique({ where: { id } });
  if (!novel) return jsonError("NOT_FOUND", "作品不存在", false, 404);
  if (!canAccessOwnerResource(novel.user_id, userId)) return jsonError("FORBIDDEN", "无权操作", false, 403);

  const body = await request.json().catch(() => null);
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION", parsed.error.issues.map((i) => i.message).join("; "), false, 400);
  }

  const { volumeIndex, chapterOrder } = parsed.data;

  const bible = await prisma.bibleDraft.findUnique({ where: { novel_id: id } });
  if (!bible) return jsonError("NO_BIBLE", "作品尚未生成 Bible", false, 400);

  const content = bible.content as Record<string, unknown>;
  const outline = content.outline as Record<string, unknown>;

  let targetChapters: unknown[];
  if (volumeIndex === 0) {
    const v1 = outline.volume_1 as Record<string, unknown>;
    targetChapters = v1.chapters as unknown[];
  } else {
    const volumes = outline.volumes as Record<string, unknown>[];
    if (!volumes || volumeIndex - 1 >= volumes.length) {
      return jsonError("INVALID", "卷索引越界", false, 400);
    }
    targetChapters = volumes[volumeIndex - 1].chapters as unknown[];
  }

  if (chapterOrder.length !== targetChapters.length) {
    return jsonError("INVALID", "章节列表长度不匹配", false, 400);
  }

  const indexSet = new Set((targetChapters as Record<string, unknown>[]).map((c) => c.index));
  for (const idx of chapterOrder) {
    if (!indexSet.has(idx)) {
      return jsonError("INVALID", `章节 index ${idx} 不存在于该卷`, false, 400);
    }
  }

  const chapterMap = new Map<number, Record<string, unknown>>();
  for (const ch of targetChapters as Record<string, unknown>[]) {
    chapterMap.set(ch.index as number, ch);
  }

  const reordered = chapterOrder.map((oldIndex, i) => ({
    ...chapterMap.get(oldIndex)!,
    index: i + 1,
  }));

  const oldToNew = new Map<number, number>();
  chapterOrder.forEach((oldIndex, i) => oldToNew.set(oldIndex, i + 1));

  if (volumeIndex === 0) {
    (outline.volume_1 as Record<string, unknown>).chapters = reordered;
  } else {
    ((outline.volumes as Record<string, unknown>[])[volumeIndex - 1]).chapters = reordered;
  }

  const shiftCount = Array.from(oldToNew.entries()).filter(([o, n]) => o !== n).length;
  if (shiftCount > 0) {
    const oldIndexes = Array.from(oldToNew.keys());
    const chapters = await prisma.chapterDraft.findMany({
      where: { novel_id: id, chapter_index: { in: oldIndexes } },
    });

    await prisma.$transaction(
      chapters.map((ch) =>
        prisma.chapterDraft.update({
          where: { id: ch.id },
          data: { chapter_index: oldToNew.get(ch.chapter_index) ?? ch.chapter_index },
        }),
      ),
    );
  }

  await prisma.bibleDraft.update({
    where: { novel_id: id },
    data: { content: content as object },
  });

  return jsonOk({ reordered: true });
}