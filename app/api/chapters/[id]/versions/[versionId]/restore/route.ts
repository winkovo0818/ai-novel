import { createHash } from "node:crypto";

import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>;
}

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

/**
 * POST /api/chapters/:id/versions/:versionId/restore
 *
 * Restores a previous ChapterVersion onto the live ChapterDraft. To make
 * this safe / undoable:
 *
 * 1. Lock the matching draft version by restoring under expected_version.
 * 2. Snapshot its previous body as a "manual" version in the same transaction,
 *    so the restore remains undoable. The target version stays in history.
 *
 * Both steps run inside a single transaction.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id: chapterId, versionId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!Number.isInteger(body?.expected_version) || body.expected_version < 0) {
    return jsonError("INVALID_INPUT", "expected_version is required", false, 400);
  }

  const chapter = await prisma.chapterDraft.findUnique({
    where: { id: chapterId },
    include: { novel: { select: { user_id: true } } },
  });
  if (!chapter) return jsonError("CHAPTER_NOT_FOUND", "Chapter not found", false, 404);

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }
  if (!canAccessOwnerResource(chapter.novel.user_id, userId)) {
    return jsonError("CHAPTER_NOT_FOUND", "Chapter not found", false, 404);
  }
  if (chapter.version !== body.expected_version) {
    return jsonError("CHAPTER_VERSION_CONFLICT", "章节已被另一处修改，请重新加载后恢复", false, 409);
  }

  const targetVersion = await prisma.chapterVersion.findUnique({
    where: { id: versionId },
  });
  if (!targetVersion || targetVersion.chapter_id !== chapterId) {
    return jsonError("VERSION_NOT_FOUND", "Version does not belong to this chapter", false, 404);
  }

  try {
    const restored = await prisma.$transaction(async (tx) => {
      const restoredChapter = await tx.chapterDraft.update({
        where: { id: chapterId, version: body.expected_version },
        data: { title: targetVersion.title, content: targetVersion.content, status: targetVersion.status,
          version: { increment: 1 }, summary_dirty: true, index_dirty: true },
      });
      // Snapshot current state as a "manual" version (skip when identical).
      const currentHash = hashContent(chapter.content);
      const last = await tx.chapterVersion.findFirst({
        where: { chapter_id: chapterId },
        orderBy: { created_at: "desc" },
        select: { content_hash: true },
      });
      if (last?.content_hash !== currentHash) {
        await tx.chapterVersion.create({
          data: {
            chapter_id: chapterId,
            title: chapter.title,
            content: chapter.content,
            content_hash: currentHash,
            status: chapter.status,
            source: "manual",
          },
        });
      }

      return restoredChapter;
    });

    return jsonOk(restored);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2025") {
      return jsonError("CHAPTER_VERSION_CONFLICT", "章节已被另一处修改，请重新加载后恢复", false, 409);
    }
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}
