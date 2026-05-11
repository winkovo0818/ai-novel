import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import {
  dismissDraftSession,
  getResumableDraftSession,
} from "@/lib/agent/draftSession";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/novels/:id/chapters/draft/resume?chapter_index=N
 *
 * Returns whatever the most-recent /draft attempt for this slot managed to
 * buffer before the client disconnected. If the row is still status=streaming
 * the user reconnected while the server was mid-generation — the buffer they
 * see is partial, and they should poll again. If status=completed the LLM
 * call finished without an attached reader; the buffer is the full result.
 * If status=failed the row carries error_code / error_message.
 *
 * 404 when no session exists for that slot (no draft was ever attempted, or
 * it was already dismissed).
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const indexParam = url.searchParams.get("chapter_index");
  const chapterIndex = indexParam ? Number(indexParam) : NaN;
  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    return jsonError(
      "INVALID_INPUT",
      "chapter_index query parameter is required and must be a positive integer",
      false,
      400,
    );
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  // Ownership: even though DraftSession itself carries user_id, also verify
  // the novel belongs to this caller so a leaked sessionId from one tenant
  // can never be probed by another.
  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { user_id: true },
  });
  if (!novel || !canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const draft = await getResumableDraftSession(userId, id, chapterIndex);
  if (!draft) {
    return jsonError("NO_DRAFT_SESSION", "No resumable draft session for this chapter", false, 404);
  }

  return jsonOk({
    id: draft.id,
    status: draft.status,
    buffer: draft.buffer,
    error_code: draft.errorCode,
    error_message: draft.errorMessage,
    retrieval: draft.retrieval,
    chapter_index: draft.chapterIndex,
    updated_at: draft.updatedAt.toISOString(),
  });
}

/**
 * DELETE /api/novels/:id/chapters/draft/resume?chapter_index=N
 *
 * Drop the resumable session for this slot once the user has either applied
 * or discarded the candidate. Keeps the (user, novel, chapter) unique slot
 * clear so a fresh /draft POST starts from scratch.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const indexParam = url.searchParams.get("chapter_index");
  const chapterIndex = indexParam ? Number(indexParam) : NaN;
  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    return jsonError(
      "INVALID_INPUT",
      "chapter_index query parameter is required and must be a positive integer",
      false,
      400,
    );
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { user_id: true },
  });
  if (!novel || !canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  await dismissDraftSession(userId, id, chapterIndex);
  return jsonOk({ dismissed: true });
}
