import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

interface AdminAuditInput {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
}

export async function recordAdminAudit(input: AdminAuditInput): Promise<void> {
  const metadata = input.metadata === undefined
    ? undefined
    : toPrismaJson(sanitizeMetadata(input.metadata));

  await prisma.adminAudit.create({
    data: {
      actor_user_id: input.actorUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      metadata,
    },
  });
}

export function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data).filter((key) => data[key] !== undefined);
}

function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "api_key" || normalizedKey.endsWith("_api_key")) {
      out[key] = child === undefined ? undefined : "[REDACTED]";
      continue;
    }
    out[key] = sanitizeMetadata(child);
  }
  return out;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
