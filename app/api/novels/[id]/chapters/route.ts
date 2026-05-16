import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { BibleDraftSchema, CreateChapterDraftRequestSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/lib/auth/session";
import { getChapterStatusesForNovel } from "@/lib/agent/chapterStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function authorizeOwner(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { id: true, user_id: true, bible: { select: { id: true, content: true } } },
  });
  if (!novel) return { ok: false as const, response: jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404) };

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return { ok: false as const, response: jsonError("UNAUTHORIZED", "Login required", false, 401) };
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return { ok: false as const, response: jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404) };
  }
  return { ok: true as const, novel };
}

/**
 * GET /api/novels/:id/chapters — chapter management list. Distinct from the
 * editor hydration endpoint (`GET /api/novels/:id`) in that it returns the
 * chapter rows alongside per-chapter freshness flags (summary / index /
 * latest job status) so the chapter management page can render badges
 * without N+1 fetches.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorizeOwner(id);
  if (!auth.ok) return auth.response;

  const [chapters, statuses] = await Promise.all([
    prisma.chapterDraft.findMany({
      where: { novel_id: id },
      orderBy: { chapter_index: "asc" },
      select: {
        id: true,
        chapter_index: true,
        title: true,
        status: true,
        target_words: true,
        content: true,
        updated_at: true,
      },
    }),
    getChapterStatusesForNovel(id),
  ]);

  const statusByChapter = new Map(statuses.map((s) => [s.chapterId, s]));
  const data = chapters.map((c) => {
    const wordCount = c.content.replace(/\s/g, "").length;
    const status = statusByChapter.get(c.id);
    return {
      id: c.id,
      chapter_index: c.chapter_index,
      title: c.title,
      status: c.status,
      target_words: c.target_words,
      word_count: wordCount,
      updated_at: c.updated_at.toISOString(),
      summary_state: status?.summary ?? "missing",
      index_state: status?.index ?? "missing",
      last_job_status: status?.lastJobStatus,
      last_job_type: status?.lastJobType,
      last_job_error: status?.lastJobError,
    };
  });

  return jsonOk(data);
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