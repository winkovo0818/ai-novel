import { z } from "zod";
import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/http/json";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let userId: string;
  try { userId = await getRequiredUserId(); } catch { return jsonError("UNAUTHORIZED", "Login required", false, 401); }
  const novels = await prisma.novel.findMany({ where: { user_id: userId, deleted_at: null }, select: { id: true, title: true } });
  const alerts = await prisma.novelGenerationAlert.findMany({
    where: { resolved_at: null, read_at: null, run: { user_id: userId, novel_id: { in: novels.map(n => n.id) } } },
    orderBy: { created_at: "desc" }, take: 50, include: { run: { select: { novel_id: true } } },
  });
  const titles = new Map(novels.map(n => [n.id, n.title]));
  return jsonOk(alerts.map(a => ({ id: a.id, kind: a.kind, message: a.message, novel_id: a.run.novel_id,
    novel_title: titles.get(a.run.novel_id), created_at: a.created_at.toISOString() })));
}

export async function PATCH(request: Request) {
  let userId: string;
  try { userId = await getRequiredUserId(); } catch { return jsonError("UNAUTHORIZED", "Login required", false, 401); }
  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("INVALID_INPUT", "请选择需要确认的连载提醒", false, 400);
  const changed = await prisma.novelGenerationAlert.updateMany({ where: { id: { in: parsed.data.ids }, run: { user_id: userId }, read_at: null }, data: { read_at: new Date() } });
  return jsonOk({ acknowledged: changed.count });
}
