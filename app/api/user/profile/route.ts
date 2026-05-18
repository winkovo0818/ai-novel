import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/http/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  image: z.string().url().max(500).optional().or(z.literal("")),
});

export async function GET() {
  const userId = await getRequiredUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, created_at: true },
  });
  if (!user) return jsonError("NOT_FOUND", "用户不存在", false, 404);
  return jsonOk(user);
}

export async function PATCH(request: Request) {
  const userId = await getRequiredUserId();
  const body = await request.json();
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION", parsed.error.issues.map((i) => i.message).join("; "), false, 400);
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.image !== undefined) data.image = parsed.data.image || null;

  if (Object.keys(data).length === 0) {
    return jsonError("VALIDATION", "没有可更新的字段", false, 400);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, image: true },
  });

  return jsonOk(updated);
}