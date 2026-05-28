import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { EmbeddingModelInputSchema } from "@/lib/validation/embeddingModel";
import { encryptApiKey, maskApiKey } from "@/lib/llm/encryption";
import { jsonError, jsonOk } from "@/lib/http/json";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAdminAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const models = await prisma.embeddingModel.findMany({
    orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
  });

  const masked = models.map((m) => ({ ...m, api_key: maskApiKey(m.api_key) }));
  return jsonOk(masked);
}

export async function POST(request: Request) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parse = EmbeddingModelInputSchema.safeParse(body ?? {});
  if (!parse.success) {
    return jsonError(
      "INVALID_INPUT",
      parse.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      false,
      400,
    );
  }

  const { name, provider, base_url, api_key, model, dim, is_default, is_enabled } = parse.data;

  // B-D-03a: only one embedding default may be active globally (unlike
  // LlmModel which scopes default per-provider). The runtime resolver picks
  // exactly one row, so we keep that invariant at the write side.
  if (is_default) {
    await prisma.embeddingModel.updateMany({
      where: { is_default: true },
      data: { is_default: false },
    });
  }

  const created = await prisma.embeddingModel.create({
    data: {
      name,
      provider,
      base_url,
      api_key: encryptApiKey(api_key),
      model,
      dim: dim ?? 1024,
      is_default: is_default ?? false,
      is_enabled: is_enabled ?? true,
    },
  });
  const actor = await getCurrentUser();
  await recordAdminAudit({
    actorUserId: actor?.id ?? null,
    action: "embedding_model.create",
    targetType: "embedding_model",
    targetId: created.id,
    metadata: {
      name,
      provider,
      model,
      dim: dim ?? 1024,
      is_default: is_default ?? false,
      is_enabled: is_enabled ?? true,
      api_key_updated: true,
    },
  });

  return jsonOk({ ...created, api_key: maskApiKey(created.api_key) });
}
