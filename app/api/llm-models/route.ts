import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getRequiredUserId();
  } catch {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }

  const models = await prisma.llmModel.findMany({
    orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
  });

  return Response.json({ ok: true, data: models });
}

export async function POST(request: Request) {
  try {
    await getRequiredUserId();
  } catch {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }

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
