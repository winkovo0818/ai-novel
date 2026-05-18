import { jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/novels/:id/stats
 *
 * Lightweight writing statistics for the novel detail page.
 * No auth guard — public read of aggregate stats is harmless and
 * the page already gates ownership.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const chapters = await prisma.chapterDraft.findMany({
    where: { novel_id: id },
    select: {
      content: true,
      status: true,
      updated_at: true,
      created_at: true,
    },
    orderBy: { updated_at: "asc" },
  });

  const totalWords = chapters.reduce(
    (sum, c) => sum + c.content.replace(/\s/g, "").length,
    0,
  );
  const doneCount = chapters.filter((c) => c.status === "done").length;

  // Daily average: total words / days since first chapter was created
  const firstCreated = chapters[0]?.created_at;
  const daysSinceStart = firstCreated
    ? Math.max(1, Math.ceil((Date.now() - new Date(firstCreated).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  const dailyAvg = Math.round(totalWords / daysSinceStart);

  // Writing streak: consecutive days (looking back from today) with at
  // least one chapter update.  We bucket by date string then walk
  // backwards.
  const dateSet = new Set(
    chapters
      .filter((c) => c.content.trim())
      .map((c) => new Date(c.updated_at).toISOString().slice(0, 10)),
  );
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dateSet.has(key)) {
      streak += 1;
    } else if (i === 0) {
      // Today has no updates yet — skip and start counting from yesterday.
      continue;
    } else {
      break;
    }
  }

  return jsonOk({
    total_words: totalWords,
    total_chapters: chapters.length,
    done_chapters: doneCount,
    daily_avg: dailyAvg,
    streak_days: streak,
    days_since_start: daysSinceStart,
  });
}
