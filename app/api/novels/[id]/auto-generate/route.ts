import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { generationPolicy } from "@/lib/agent/generationPolicy";
import { generationDailySpend, nextGenerationBudgetReset } from "@/lib/agent/generationBudget";
import { z } from "zod";
import { StartRequestSchema, startGeneration, GenerationError } from "@/lib/agent/autoGeneration";
import { BibleDraftSchema, NovelProfileSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Planning is persisted to the queue; this request never waits for the model.
export const maxDuration = 30;

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
    ...generationPolicy(run.config),
    id: run.id,
    status: run.status,
    current_chapter: run.current_chapter,
    total_chapters: run.total_chapters,
    done_chapters: doneCount,
    cost_cny_spent: run.cost_cny_spent,
    cost_cap_cny: run.cost_cap_cny,
    daily_cost_cny_spent: generationDailySpend(run),
    pause_reason: run.pause_reason,
    resume_after: run.resume_after?.toISOString() ?? null,
    next_daily_reset_at: nextGenerationBudgetReset().toISOString(),
    quality_floor: run.quality_floor,
    revision_rounds: run.revision_rounds,
    checkpoint_mode: run.checkpoint_mode,
    last_error: run.last_error,
    created_at: run.created_at.toISOString(),
    updated_at: run.updated_at.toISOString(),
  });
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let config: z.infer<typeof StartRequestSchema>;
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

  try {
    return jsonOk(await startGeneration(novel, userId, config));
  } catch (error) {
    if (error instanceof GenerationError) return jsonError(error.code, error.message, error.status >= 500, error.status);
    throw error;
  }
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

  if (action === "budget") {
    const budget = z.number().finite().positive().safeParse((body as Record<string, unknown>)?.cost_cap_cny);
    if (!budget.success) return jsonError("INVALID_INPUT", "累计预算必须为正数", false, 400);
    const run = await prisma.novelGenerationRun.findFirst({ where: { novel_id: id, status: { in: ["paused", "needs_review", "failed"] } }, orderBy: { created_at: "desc" } });
    if (!run) return jsonError("NO_PAUSED_RUN", "请先暂停任务再调整预算", false, 409);
    if (budget.data <= Math.max(run.cost_cny_spent, run.cost_cap_cny ?? 0)) return jsonError("INVALID_INPUT", "新预算必须高于已用费用及原上限", false, 400);
    const changed = await prisma.novelGenerationRun.updateMany({ where: { id: run.id, status: run.status,
      cost_cny_spent: { lt: budget.data }, cost_cap_cny: run.cost_cap_cny }, data: { cost_cap_cny: budget.data } });
    if (!changed.count) return jsonError("RUN_CHANGED", "任务费用或状态已改变，请刷新", false, 409);
    return jsonOk({ cost_cap_cny: budget.data });
  }

  if (action === "daily_budget") {
    const cap = z.number().finite().positive().nullable().safeParse((body as Record<string, unknown>)?.daily_cost_cap_cny);
    if (!cap.success) return jsonError("INVALID_INPUT", "每日预算必须为正数，或 null 表示关闭", false, 400);
    const run = await prisma.novelGenerationRun.findFirst({ where: { novel_id: id, status: { in: ["paused", "needs_review", "failed"] } }, orderBy: { created_at: "desc" } });
    if (!run) return jsonError("NO_PAUSED_RUN", "请先暂停任务再调整每日预算", false, 409);
    const config = { ...(run.config as Record<string, unknown>), ...generationPolicy(run.config) };
    delete config.daily_cost_cap_cny;
    if (cap.data != null) config.daily_cost_cap_cny = cap.data;
    const changed = await prisma.novelGenerationRun.updateMany({ where: { id: run.id, status: run.status, updated_at: run.updated_at },
      data: { config: config as import("@prisma/client").Prisma.InputJsonObject,
        ...(run.pause_reason === "daily_budget" ? { pause_reason: "manual", resume_after: null, last_error: "每日预算已调整，请确认后恢复" } : {}) } });
    if (!changed.count) return jsonError("RUN_CHANGED", "任务状态已改变，请刷新", false, 409);
    return jsonOk({ daily_cost_cap_cny: cap.data });
  }

  if (action === "pause") {
    const run = await prisma.novelGenerationRun.findFirst({
      where: { novel_id: id, OR: [{ status: { in: ["planning", "running"] } }, { status: "paused", pause_reason: { in: ["daily_budget", "quota"] } }] },
      orderBy: { created_at: "desc" },
    });
    if (!run) return jsonError("NO_ACTIVE_RUN", "没有正在运行的生成任务", false, 404);
    const changed = await prisma.novelGenerationRun.updateMany({ where: { id: run.id, OR: [{ status: { in: ["planning", "running"] } }, { status: "paused", pause_reason: { in: ["daily_budget", "quota"] } }] },
      data: { status: "paused", pause_reason: "manual", resume_after: null, last_error: "用户暂停" } });
    if (!changed.count) return jsonError("RUN_CHANGED", "任务状态已改变，请刷新", false, 409);
    return jsonOk({ status: "paused" });
  }

  if (action === "cancel") {
    const run = await prisma.novelGenerationRun.findFirst({
      where: { novel_id: id, status: { in: ["planning", "running", "paused", "needs_review", "failed"] } },
      orderBy: { created_at: "desc" },
    });
    if (!run) return jsonError("NO_ACTIVE_RUN", "没有可取消的生成任务", false, 404);
    const changed = await prisma.novelGenerationRun.updateMany({ where: { id: run.id, status: { in: ["planning", "running", "paused", "needs_review", "failed"] } },
      data: { status: "cancelled", pause_reason: null, resume_after: null } });
    if (!changed.count) return jsonError("RUN_CHANGED", "任务状态已改变，请刷新", false, 409);
    return jsonOk({ status: "cancelled" });
  }

  return jsonError("INVALID_ACTION", `不支持的操作: ${action}`, false, 400);
}
