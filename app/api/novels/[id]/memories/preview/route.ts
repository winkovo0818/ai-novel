import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { retrieveMemories } from "@/lib/agent/retrieval";
import { BibleDraftSchema } from "@/lib/validation/schemas";
import { errorMessage, logError } from "@/lib/observability/logger";
import { buildMemoryLibraryPreview, normalizeMemoryLibraryQuery } from "@/lib/agent/memoryLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type NovelForAccess = { id: string; user_id: string | null };

async function authorizeNovel(id: string): Promise<NovelForAccess | Response> {
  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
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

  return novel;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorizeNovel(id);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const data = await buildMemoryLibraryPreview(prisma, id, normalizeMemoryLibraryQuery({
    page: Number(url.searchParams.get("page") ?? undefined),
    pageSize: Number(url.searchParams.get("page_size") ?? undefined),
    chapterIndex: Number(url.searchParams.get("chapter_index") ?? undefined),
    type: url.searchParams.get("type") ?? undefined,
  }));

  return jsonOk(data);
}

/**
 * POST /api/novels/:id/memories/preview
 *
 * Runs vector retrieval for a chapter WITHOUT starting generation.
 * Returns the top-K memory chunks so the user can review what context
 * the AI will see before committing to a draft.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const chapterIndex =
    typeof body?.chapter_index === "number" &&
    Number.isFinite(body.chapter_index) &&
    body.chapter_index >= 1
      ? body.chapter_index
      : 1;

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: { bible: true },
  });
  if (!novel || !novel.bible) {
    return jsonError("NOVEL_NOT_FOUND", "Novel or Bible not found", false, 404);
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
    return jsonError("INVALID_BIBLE", "Bible is invalid", false, 400);
  }

  try {
    const result = await retrieveMemories(id, bible.data, chapterIndex, 5);
    return jsonOk({
      status: result.status,
      memories: result.memories.map((m) => ({
        id: m.id,
        source: m.source,
        text: m.text,
        reason: m.reason,
        score: m.score,
      })),
      errorMessage: result.errorMessage,
    });
  } catch (err) {
    logError("memories.preview_failed", {
      novel_id: id,
      chapter_index: chapterIndex,
      error: errorMessage(err),
    });
    return jsonError("INTERNAL", "Memory retrieval failed", true, 500);
  }
}
