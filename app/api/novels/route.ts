import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }

  const novels = await prisma.novel.findMany({
    where: { user_id: userId },
    include: {
      bible: { select: { id: true } },
      chapters: { select: { id: true, status: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const data = novels.map((novel) => ({
    id: novel.id,
    title: novel.title,
    created_at: novel.created_at.toISOString(),
    chapter_count: novel.chapters.length,
    done_count: novel.chapters.filter((c) => c.status === "done").length,
    has_bible: !!novel.bible,
  }));

  return Response.json({ ok: true, data });
}
