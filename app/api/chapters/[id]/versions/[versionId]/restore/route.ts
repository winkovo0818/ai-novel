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
 * 1. Snapshot the current draft body as a new "manual" version *before*
 *    applying the restore, so the user can roll the restore back out.
 * 2. Then copy the target version's title / content / status onto the
 *    draft. We don't delete the target version row — it stays in history.
 *
 * Both steps run inside a single transaction.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { id: chapterId, versionId } = await context.params;

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

  const targetVersion = await prisma.chapterVersion.findUnique({
    where: { id: versionId },
  });
  if (!targetVersion || targetVersion.chapter_id !== chapterId) {
    return jsonError("VERSION_NOT_FOUND", "Version does not belong to this chapter", false, 404);
  }

  try {
    const restored = await prisma.$transaction(async (tx) => {
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

      return tx.chapterDraft.update({
        where: { id: chapterId },
        data: {
          title: targetVersion.title,
          content: targetVersion.content,
          status: targetVersion.status,
          version: { increment: 1 },
        },
      });
    });

    return jsonOk(restored);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}
