import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import {
  createRun,
  markRunning,
  addCost,
  getRun,
  pause,
  cancel,
} from "@/lib/agent/generationRun";
import { planOutline } from "@/lib/agent/planOutline";
import { enqueueJob } from "@/lib/jobs/queue";
import { BibleDraftSchema, NovelProfileSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 远程 planOutline 可能 30-60s，预留足够时间
export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET — 轮询最新 run 状态 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel || !canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const run = await prisma.novelGenerationRun.findFirst({
    where: { novel_id: id },
    orderBy: { created_at: "desc" },
  });

  if (!run) {
    return jsonOk({ active: false });
  }

  const doneCount = await prisma.chapterDraft.count({
    where: { novel_id: id, status: "done" },
  });

  return jsonOk({
    active: true,
    id: run.id,
    status: run.status,
    current_chapter: run.current_chapter,
    total_chapters: run.total_chapters,
    done_chapters: doneCount,
    cost_cny_spent: run.cost_cny_spent,
    cost_cap_cny: run.cost_cap_cny,
    quality_floor: run.quality_floor,
    revision_rounds: run.revision_rounds,
    checkpoint_mode: run.checkpoint_mode,
    last_error: run.last_error,
    created_at: run.created_at.toISOString(),
    updated_at: run.updated_at.toISOString(),
  });
}

const StartRequestSchema = {
  parse: (body: unknown) => {
    if (typeof body !== "object" || body === null) throw new Error("body 必须是对象");
    const b = body as Record<string, unknown>;
    const total_chapters = Number(b.total_chapters ?? 40);
    if (!Number.isInteger(total_chapters) || total_chapters < 1 || total_chapters > 80) {
      throw new Error("total_chapters 必须是 1-80 的整数");
    }
    return {
      total_chapters,
      revision_rounds: typeof b.revision_rounds === "number" ? b.revision_rounds : undefined,
      quality_floor: typeof b.quality_floor === "number" ? b.quality_floor : undefined,
      cost_cap_cny: typeof b.cost_cap_cny === "number" ? b.cost_cap_cny : undefined,
      checkpoint_mode: ["none", "per_volume", "on_fail"].includes(b.checkpoint_mode as string)
        ? (b.checkpoint_mode as "none" | "per_volume" | "on_fail")
        : undefined,
    };
  },
};

/** POST — 启动全自动生成 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: { bible: true },
  });
  if (!novel || !canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }
  if (!novel.bible) {
    return jsonError("NO_BIBLE", "请先合成叙事圣经 (Bible)", false, 400);
  }

  // 检查是否有在途 run
  const activeRun = await prisma.novelGenerationRun.findFirst({
    where: { novel_id: id, status: { in: ["planning", "running", "paused", "needs_review"] } },
  });
  if (activeRun) {
    return jsonError(
      "RUN_ACTIVE",
      `已有进行中的生成任务（${activeRun.status}），请先暂停或取消后再启动新任务`,
      false,
      409,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let config: ReturnType<typeof StartRequestSchema.parse>;
  try {
    config = StartRequestSchema.parse(body);
  } catch (e) {
    return jsonError("INVALID_INPUT", e instanceof Error ? e.message : "参数不合法", false, 400);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_BIBLE", "Bible 或 Profile 数据不合法", false, 400);
  }

  // 1. 建 run
  const run = await createRun({
    novelId: id,
    userId,
    totalChapters: config.total_chapters,
    revisionRounds: config.revision_rounds,
    qualityFloor: config.quality_floor,
    costCapCny: config.cost_cap_cny ?? null,
    config: {
      source: "ui",
      checkpoint_mode: config.checkpoint_mode ?? "on_fail",
    },
  });

  // 2. 前置补全大纲（同步 LLM 调用，可能 30-60s）
  let outlineCost = 0;
  try {
    const planned = await planOutline({
      novelId: id,
      bible: bible.data,
      profile: profile.data,
      targetChapters: config.total_chapters,
    });
    if (planned.addedChapters > 0) {
      await prisma.bibleDraft.update({
        where: { novel_id: id },
        data: { content: planned.bible },
      });
      await addCost(run.id, planned.cost.cny);
      outlineCost = planned.cost.cny;
    }
  } catch (e) {
    // 大纲补全失败不阻塞，用现有 outline 继续
    console.error("[auto-generate] planOutline 失败:", e instanceof Error ? e.message : String(e));
  }

  // 3. 标记 running 并入队第 1 章
  await markRunning(run.id);
  await enqueueJob({
    type: "generate_chapter",
    payload: { novel_id: id, chapter_index: 1, run_id: run.id },
    novelId: id,
  });

  const updated = await getRun(run.id);

  return jsonOk({
    id: run.id,
    status: updated?.status ?? "running",
    total_chapters: config.total_chapters,
    outline_cost_cny: outlineCost,
  });
}

/** PATCH — 暂停/取消（简化版，完整操作走 /[action]） */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel || !canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_INPUT", "请求体不能为空", false, 400);
  }
  const action = (body as Record<string, unknown>)?.action;

  if (action === "pause") {
    const run = await prisma.novelGenerationRun.findFirst({
      where: { novel_id: id, status: "running" },
      orderBy: { created_at: "desc" },
    });
    if (!run) return jsonError("NO_ACTIVE_RUN", "没有正在运行的生成任务", false, 404);
    await pause(run.id, "用户暂停");
    return jsonOk({ status: "paused" });
  }

  if (action === "cancel") {
    const run = await prisma.novelGenerationRun.findFirst({
      where: { novel_id: id, status: { in: ["running", "paused", "needs_review"] } },
      orderBy: { created_at: "desc" },
    });
    if (!run) return jsonError("NO_ACTIVE_RUN", "没有可取消的生成任务", false, 404);
    await cancel(run.id);
    return jsonOk({ status: "cancelled" });
  }

  return jsonError("INVALID_ACTION", `不支持的操作: ${action}`, false, 400);
}
