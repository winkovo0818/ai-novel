import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { BibleDraftSchema, CreateChapterDraftRequestSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = CreateChapterDraftRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid chapter draft request", false, 400);
  }

  const novel = await prisma.novel.findUnique({ where: { id }, include: { bible: true } });
  if (!novel || !novel.bible) {
    return jsonError("NOVEL_NOT_FOUND", "Novel or Bible draft not found", false, 404);
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) {
    return jsonError("INVALID_INPUT", "Novel Bible is invalid", false, 400);
  }
  if (!bible.data.outline.volume_1.chapters.some((chapter) => chapter.index === parsed.data.chapter_index)) {
    return jsonError("INVALID_INPUT", "Chapter index is not in the Bible outline", false, 400);
  }

  try {
    const chapter = await prisma.chapterDraft.upsert({
      where: {
        novel_id_chapter_index: {
          novel_id: id,
          chapter_index: parsed.data.chapter_index,
        },
      },
      create: {
        novel_id: id,
        chapter_index: parsed.data.chapter_index,
        title: parsed.data.title,
        content: parsed.data.content,
        status: parsed.data.status,
      },
      update: {
        title: parsed.data.title,
        content: parsed.data.content,
        status: parsed.data.status,
      },
    });

    return Response.json({ ok: true, data: chapter });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
