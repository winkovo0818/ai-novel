import { prisma } from "@/lib/db";
import { UpdateChapterDraftRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateChapterDraftRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid chapter draft update", false, 400);
  }

  try {
    const chapter = await prisma.chapterDraft.update({
      where: { id },
      data: parsed.data,
    });

    return Response.json({ ok: true, data: chapter });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const notFound = message.includes("Record to update not found");
    return jsonError(
      notFound ? "CHAPTER_NOT_FOUND" : "INTERNAL",
      notFound ? "Chapter draft not found" : message,
      !notFound,
      notFound ? 404 : 500,
    );
  }
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
