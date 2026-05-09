import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { LlmModelPatchSchema } from "@/lib/validation/llmModel";
import { encryptApiKey, maskApiKey } from "@/lib/llm/encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parse = LlmModelPatchSchema.safeParse(body ?? {});
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

  // If setting as default, unset others for same provider
  if (is_default) {
    const existing = await prisma.llmModel.findUnique({ where: { id } });
    if (existing) {
      await prisma.llmModel.updateMany({
        where: { provider: existing.provider, id: { not: id } },
        data: { is_default: false },
      });
    }
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (provider !== undefined) data.provider = provider;
  if (base_url !== undefined) data.base_url = base_url;
  if (model !== undefined) data.model = model;
  if (api_key !== undefined && api_key) data.api_key = encryptApiKey(api_key);
  if (is_default !== undefined) data.is_default = is_default;
  if (is_enabled !== undefined) data.is_enabled = is_enabled;

  const llmModel = await prisma.llmModel.update({ where: { id }, data });
  return Response.json({ ok: true, data: { ...llmModel, api_key: maskApiKey(llmModel.api_key) } });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const { id } = await context.params;
  await prisma.llmModel.delete({ where: { id } });
  return Response.json({ ok: true });
}
