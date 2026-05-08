import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const chapter = await prisma.chapterDraft.findUnique({
    where: { id },
    include: { novel: { select: { user_id: true } } },
  });

  if (!chapter) {
    return Response.json(
      { ok: false, error: { code: "CHAPTER_NOT_FOUND", message: "Chapter not found", retryable: false } },
      { status: 404 },
    );
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }

  if (!canAccessOwnerResource(chapter.novel.user_id, userId)) {
    return Response.json(
      { ok: false, error: { code: "CHAPTER_NOT_FOUND", message: "Chapter not found", retryable: false } },
      { status: 404 },
    );
  }

  const versions = await prisma.chapterVersion.findMany({
    where: { chapter_id: id },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  return Response.json({ ok: true, data: versions });
}
