import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, checks: { db: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json(
      { ok: false, checks: { db: false }, error: message },
      { status: 503 },
    );
  }
}
