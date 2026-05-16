import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { jsonError, jsonOk } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return jsonError("INVALID_EMAIL", "Email is invalid", false, 400);
  }
  if (password.length < 6) {
    return jsonError("INVALID_PASSWORD", "Password must be at least 6 characters", false, 400);
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return jsonError("EMAIL_EXISTS", "Email is already registered", false, 409);
  }

  const user = await prisma.user.create({
    data: {
      email,
      password_hash: await hashPassword(password),
      emailVerified: new Date(),
    },
    select: { id: true, email: true },
  });

  return jsonOk({ user });
}
