import { z } from "zod";

import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const FeedbackSchema = z.object({
  memory_chunk_id: z.string().min(1),
  rating: z.enum(["helpful", "irrelevant"]),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid memory feedback payload", false, 400);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const chunk = await prisma.memoryChunk.findUnique({
    where: { id: parsed.data.memory_chunk_id },
    select: { id: true, novel_id: true },
  });
  if (!chunk || chunk.novel_id !== id) {
    return jsonError("MEMORY_NOT_FOUND", "Memory chunk not found", false, 404);
  }

  const feedback = await prisma.memoryFeedback.upsert({
    where: {
      user_id_memory_chunk_id: {
        user_id: userId,
        memory_chunk_id: chunk.id,
      },
    },
    create: {
      novel_id: id,
      memory_chunk_id: chunk.id,
      user_id: userId,
      rating: parsed.data.rating,
      reason: parsed.data.reason,
    },
    update: {
      rating: parsed.data.rating,
      reason: parsed.data.reason,
    },
  });

  return jsonOk({
    id: feedback.id,
    memoryChunkId: feedback.memory_chunk_id,
    rating: feedback.rating,
  });
}
