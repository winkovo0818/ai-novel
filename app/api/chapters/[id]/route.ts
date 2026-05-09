import { jsonError } from "@/lib/http/json";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import { UpdateChapterDraftRequestSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Maximum versions retained per chapter. Older rows are pruned on insert. */
const MAX_VERSIONS_PER_CHAPTER = 50;

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateChapterDraftRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid chapter draft update", false, 400);
  }

  const { source = "autosave", ...updateData } = parsed.data;

  try {
    const existing = await prisma.chapterDraft.findUnique({
      where: { id },
      include: { novel: { select: { user_id: true } } },
    });
    if (!existing) {
      return jsonError("CHAPTER_NOT_FOUND", "Chapter draft not found", false, 404);
    }

    let userId: string;
    try {
      userId = await getRequiredUserId();
    } catch {
      return jsonError("UNAUTHORIZED", "Login required", false, 401);
    }
    if (!canAccessOwnerResource(existing.novel.user_id, userId)) {
      return jsonError("CHAPTER_NOT_FOUND", "Chapter draft not found", false, 404);
    }

    // Moderate content when marking as done (publishing) or on manual saves with content.
    const isPublishing = updateData.status === "done" && existing.status !== "done";
    const hasContent = (updateData.content ?? existing.content).trim().length > 0;
    if ((isPublishing || source === "manual") && hasContent) {
      const text = stringifyForModeration({
        title: updateData.title ?? existing.title,
        content: updateData.content ?? existing.content,
      });
      const moderation = await moderateContent({ route: "/api/chapters/:id", text });
      if (!moderation.allowed) {
        return jsonError(
          moderation.code ?? "MODERATION_BLOCKED",
          moderation.reason ?? "Content blocked by moderation",
          false,
          400,
        );
      }
    }

    const chapter = await prisma.chapterDraft.update({ where: { id }, data: updateData });

    // Decide whether this PATCH should create a ChapterVersion.
    // - source=autosave by default does NOT create a version.
    // - manual / ai / status_change always create a version.
    // - autosave still creates a version when the status changed (e.g. mark done),
    //   so users never lose the boundary between draft and done.
    const statusChanged =
      updateData.status !== undefined && updateData.status !== existing.status;
    const shouldCreateVersion = source !== "autosave" || statusChanged;

    if (shouldCreateVersion) {
      const versionContent = existing.content;
      const versionHash = hashContent(versionContent);
      // Skip when the most recent version for this chapter already matches.
      const last = await prisma.chapterVersion.findFirst({
        where: { chapter_id: id },
        orderBy: { created_at: "desc" },
        select: { content_hash: true },
      });
      if (last?.content_hash !== versionHash) {
        await prisma.chapterVersion.create({
          data: {
            chapter_id: id,
            title: existing.title,
            content: versionContent,
            content_hash: versionHash,
            status: existing.status,
            source: statusChanged && source === "autosave" ? "status_change" : source,
          },
        });
        // Prune to MAX_VERSIONS_PER_CHAPTER newest entries.
        const overflow = await prisma.chapterVersion.findMany({
          where: { chapter_id: id },
          orderBy: { created_at: "desc" },
          skip: MAX_VERSIONS_PER_CHAPTER,
          select: { id: true },
        });
        if (overflow.length > 0) {
          await prisma.chapterVersion.deleteMany({
            where: { id: { in: overflow.map((v) => v.id) } },
          });
        }
      }
    }

    return Response.json({ ok: true, data: chapter });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const existing = await prisma.chapterDraft.findUnique({
      where: { id },
      include: { novel: { select: { user_id: true } } },
    });
    if (!existing) {
      return jsonError("CHAPTER_NOT_FOUND", "Chapter draft not found", false, 404);
    }

    let userId: string;
    try {
      userId = await getRequiredUserId();
    } catch {
      return jsonError("UNAUTHORIZED", "Login required", false, 401);
    }
    if (!canAccessOwnerResource(existing.novel.user_id, userId)) {
      return jsonError("CHAPTER_NOT_FOUND", "Chapter draft not found", false, 404);
    }

    await prisma.chapterDraft.delete({ where: { id } });

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}