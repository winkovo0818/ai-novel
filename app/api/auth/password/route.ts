import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { jsonError, jsonOk } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 6) {
    return jsonError("INVALID_PASSWORD", "Password must be at least 6 characters", false, 400);
  }

  const token = typeof body?.token === "string" ? body.token : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (token && email) {
    const record = await prisma.verificationToken.findUnique({
      where: { identifier_token: { identifier: email, token } },
    });
    if (!record || record.expires < new Date()) {
      return jsonError("INVALID_TOKEN", "Password reset token is invalid or expired", false, 400);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { email },
        data: { password_hash: await hashPassword(password) },
      }),
      prisma.verificationToken.delete({
        where: { identifier_token: { identifier: email, token } },
      }),
    ]);
    return jsonOk({ updated: true });
  }

  const user = await getCurrentUser();
  if (!user) {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password_hash: await hashPassword(password) },
  });
  return jsonOk({ updated: true });
}
