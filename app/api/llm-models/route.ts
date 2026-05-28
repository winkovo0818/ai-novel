import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { LlmModelInputSchema } from "@/lib/validation/llmModel";
import { encryptApiKey, maskApiKey } from "@/lib/llm/encryption";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAdminAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const models = await prisma.llmModel.findMany({
    orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
  });

  // Mask api_key before returning to the client.
  const masked = models.map((m) => ({
    ...m,
    api_key: maskApiKey(m.api_key),
  }));

  return Response.json({ ok: true, data: masked });
}

export async function POST(request: Request) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parse = LlmModelInputSchema.safeParse(body ?? {});
  if (!parse.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: parse.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const { name, provider, base_url, api_key, model, is_default, is_enabled } = parse.data;

  // If setting as default, unset others
  if (is_default) {
    await prisma.llmModel.updateMany({
      where: { provider },
      data: { is_default: false },
    });
  }

  const llmModel = await prisma.llmModel.create({
    data: {
      name,
      provider,
      base_url,
      api_key: encryptApiKey(api_key),
      model,
      is_default: is_default ?? false,
      is_enabled: is_enabled ?? true,
    },
  });
  const actor = await getCurrentUser();
  await recordAdminAudit({
    actorUserId: actor?.id ?? null,
    action: "llm_model.create",
    targetType: "llm_model",
    targetId: llmModel.id,
    metadata: {
      name,
      provider,
      model,
      is_default: is_default ?? false,
      is_enabled: is_enabled ?? true,
      api_key_updated: true,
    },
  });

  return Response.json({ ok: true, data: { ...llmModel, api_key: maskApiKey(llmModel.api_key) } });
}
