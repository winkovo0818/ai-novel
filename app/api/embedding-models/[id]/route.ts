import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { EmbeddingModelPatchSchema } from "@/lib/validation/embeddingModel";
import { encryptApiKey, maskApiKey } from "@/lib/llm/encryption";
import { jsonError, jsonOk } from "@/lib/http/json";

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
  const parse = EmbeddingModelPatchSchema.safeParse(body ?? {});
  if (!parse.success) {
    return jsonError(
      "INVALID_INPUT",
      parse.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      false,
      400,
    );
  }

  const { name, provider, base_url, api_key, model, dim, is_default, is_enabled } = parse.data;

  // B-D-03a: globally unique default — unset every other row when promoting.
  if (is_default) {
    await prisma.embeddingModel.updateMany({
      where: { is_default: true, id: { not: id } },
      data: { is_default: false },
    });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (provider !== undefined) data.provider = provider;
  if (base_url !== undefined) data.base_url = base_url;
  if (model !== undefined) data.model = model;
  if (dim !== undefined) data.dim = dim;
  if (api_key !== undefined && api_key) data.api_key = encryptApiKey(api_key);
  if (is_default !== undefined) data.is_default = is_default;
  if (is_enabled !== undefined) data.is_enabled = is_enabled;

  const updated = await prisma.embeddingModel.update({ where: { id }, data });
  return jsonOk({ ...updated, api_key: maskApiKey(updated.api_key) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const { id } = await context.params;
  await prisma.embeddingModel.delete({ where: { id } });
  return jsonOk({});
}
