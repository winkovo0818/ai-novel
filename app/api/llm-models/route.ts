import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const models = await prisma.llmModel.findMany({
    orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
  });

  return Response.json({ ok: true, data: models });
}

export async function POST(request: Request) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const { name, provider, base_url, api_key, model } = body ?? {};

  if (!name || !provider || !base_url || !api_key || !model) {
    return Response.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Missing required fields", retryable: false } },
      { status: 400 },
    );
  }

  // If setting as default, unset others
  if (body.is_default) {
    await prisma.llmModel.updateMany({
      where: { provider },
      data: { is_default: false },
    });
  }

  const llmModel = await prisma.llmModel.create({
    data: { name, provider, base_url, api_key, model, is_default: body.is_default ?? false },
  });

  return Response.json({ ok: true, data: llmModel });
}
