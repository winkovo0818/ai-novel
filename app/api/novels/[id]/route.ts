import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" } },
    },
  });

  if (!novel) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOVEL_NOT_FOUND",
          message: "Novel not found",
          retryable: false,
        },
      },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, data: novel });
}
