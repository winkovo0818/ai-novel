import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { indexChapter } from "@/lib/agent/chunking";
import { getRequiredUserId } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const chapter = await prisma.chapterDraft.findUnique({
    where: { id },
    include: { novel: { select: { user_id: true } } },
  });

  if (!chapter) {
    return jsonError("CHAPTER_NOT_FOUND", "Chapter not found", false, 404);
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  if (!canAccessOwnerResource(chapter.novel.user_id, userId)) {
    return jsonError("CHAPTER_NOT_FOUND", "Chapter not found", false, 404);
  }

  if (!chapter.content.trim()) {
    return jsonError("EMPTY_CONTENT", "Chapter has no content to index", false, 400);
  }

  try {
    const result = await indexChapter(chapter.novel_id, chapter.id, chapter.content);
    return Response.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    return jsonError("INTERNAL", message, true, 500);
  }
}