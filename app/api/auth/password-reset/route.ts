import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return jsonError("INVALID_EMAIL", "Email is invalid", false, 400);
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 30);

  if (user) {
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    await prisma.verificationToken.create({ data: { identifier: email, token, expires } });
  }

  const origin = new URL(request.url).origin;
  const resetUrl = `${origin}/update-password?token=${token}&email=${encodeURIComponent(email)}`;
  if (user && process.env.NODE_ENV !== "production") {
    return jsonOk({ sent: true, resetUrl });
  }

  return jsonOk({ sent: true });
}
