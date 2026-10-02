import { z } from "zod";
import type { BibleDraft, StoryStateV1 } from "@/lib/validation/schemas";
import { getVolumes } from "@/lib/validation/schemas";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { PROMPT_SAFETY_PREAMBLE, wrap } from "@/lib/llm/promptSafety";
import { logWarn } from "@/lib/observability/logger";

const detail = z.string().min(10).max(500);
export const VolumePlanSchema = z.object({
  name: z.string().min(2).max(20), theme: z.string().min(2).max(200),
  goal: detail, central_conflict: detail, character_change: detail, climax: detail,
  resolution: detail, next_hook: detail,
  avoid_patterns: z.array(z.string().min(1).max(120)).max(10).default([]),
  thread_targets: z.array(z.object({ kind: z.enum(["plot_threads", "foreshadowing"]), title: z.string().min(1).max(200),
    action: z.enum(["advance", "resolve"]), deadline_chapter: z.number().int().positive() })).max(10).default([]),
});
export type VolumePlan = z.infer<typeof VolumePlanSchema>;
export interface VolumeArc { volume_index: number; start_chapter: number; end_chapter: number; planned_after_chapter: number; plan: VolumePlan }

/** Respect legacy shorter/longer volumes; new volume capacity is 80. */
export function volumeBounds(bible: BibleDraft, chapter: number, continuous: boolean, total: number) {
  const volumes = getVolumes(bible);
  let nextStart = 1;
  for (let i = 0; i < volumes.length; i++) {
    const start = volumes[i].chapters[0]?.index ?? nextStart;
    const next = volumes[i + 1]?.chapters[0]?.index;
    const end = next != null ? next - 1 : start + Math.max(80, volumes[i].chapters.length) - 1;
    if (chapter >= start && chapter <= end) return { volume_index: i, start_chapter: start, end_chapter: continuous ? end : Math.min(end, total) };
    nextStart = end + 1;
  }
  const offset = Math.floor((chapter - nextStart) / 80);
  const start = nextStart + offset * 80;
  return { volume_index: volumes.length + offset, start_chapter: start, end_chapter: continuous ? start + 79 : Math.min(start + 79, total) };
}

/** 未解决线索的规范名清单（供 prompt 逐字引用与校验映射）。 */
export function eligibleThreadTitles(state: StoryStateV1 | undefined) {
  return {
    plot_threads: (state?.plot_threads ?? []).filter(t => t.status !== "resolved").map(t => t.title),
    foreshadowing: (state?.foreshadowing ?? []).filter(t => t.status !== "resolved").map(t => t.clue),
  };
}

function normalizeTitle(value: string): string {
  return value.replace(/[\s\u3000·，。：；、,.;:!?！？「」『』"'（）()【】\[\]—\-]/g, "").toLowerCase();
}

interface MappableTarget { kind: "plot_threads" | "foreshadowing"; title: string; deadline_chapter: number }
type TargetMapping = { kind: "plot_threads" | "foreshadowing"; title: string } | { reason: string };

/**
 * Map an LLM-produced thread target back to a canonical unresolved thread.
 *
 * 规划器经常改写线索名（真实跑批实测：「上古剑魂来源」→「活过宗门考核并确认
 * 剑魂来源」），逐字相等校验会止链整个 run。可精确或包含匹配的目标改写回规范
 * 名（overduePayoffs 按规范名精确匹配，改写保证其继续工作）；无法对应或期限
 * 越界的目标返回丢弃原因——编造的目标没有价值，计划的其余字段仍然有效。
 */
function mapThreadTarget(state: StoryStateV1 | undefined, target: MappableTarget,
  bounds: { current_chapter: number; start_chapter: number; end_chapter: number }): TargetMapping {
  if (target.deadline_chapter <= bounds.current_chapter || target.deadline_chapter < bounds.start_chapter || target.deadline_chapter > bounds.end_chapter) {
    return { reason: "期限越界或已经过去" };
  }
  const eligible = eligibleThreadTitles(state)[target.kind];
  const norm = normalizeTitle(target.title);
  if (norm.length === 0) return { reason: "空线索名" };
  const exact = eligible.find(t => normalizeTitle(t) === norm);
  const contained = exact ?? eligible.find(t => {
    const n = normalizeTitle(t);
    return n.length >= 2 && norm.length >= 2 && (n.includes(norm) || norm.includes(n));
  });
  if (!contained) return { reason: "未知或已解决的线索" };
  return { kind: target.kind, title: contained };
}

export interface PlanVolumeInput {
  novelId: string; bible: BibleDraft; start_chapter: number; end_chapter: number; current_chapter: number;
  recentOutline: Array<{ chapter_index: number; title: string; summary: string }>;
  recentProgress?: Array<{chapter_index: number; title: string; excerpt: string}>;
  previousPlans: VolumePlan[]; model?: string; continuous: boolean;
}
export function buildVolumePlanPrompt(input: PlanVolumeInput) {
  const eligible = eligibleThreadTitles(input.bible.story_state);
  const eligibleList = [
    ...eligible.plot_threads.map(t => `plot_threads ${wrap(t, "plot_thread")}`),
    ...eligible.foreshadowing.map(t => `foreshadowing ${wrap(t, "plot_thread")}`),
  ];
  const threadRule = eligibleList.length > 0
    ? `线索目标最多 10 项，只能引用下列未解决线索，title 必须逐字复制线索名（禁止改写、缩写或合并）：${eligibleList.join("；")}。应为每条未解决线索安排 advance 或 resolve 目标（可多章共用一个期限）。期限必须晚于第 ${input.current_chapter} 章且在本卷范围内。`
    : "当前没有未解决线索，thread_targets 必须是空数组 []。";
  return [{ role: "system" as const, content: `你是长篇小说卷级剧情规划师。为第 ${input.start_chapter} 至 ${input.end_chapter} 章设计一个有成果、有代价的故事阶段。
${PROMPT_SAFETY_PREAMBLE}
输出且只输出 JSON：{"name":"卷名","theme":"主题","goal":"可检验的阶段目标","central_conflict":"核心冲突","character_change":"人物改变及代价","climax":"高潮的行动与结果","resolution":"本卷解决什么","next_hook":"后续新冲突","avoid_patterns":["避免的重复套路"],"thread_targets":[{"kind":"plot_threads|foreshadowing","title":"已有线索名","action":"advance|resolve","deadline_chapter":${input.end_chapter}}]}。
各目标描述 10–500 字。${threadRule}近期正文与状态是已经发生的事实，计划不能改写它们。
${input.continuous ? "本卷结束不是全书完结。回收旧线索，并用本卷结果自然引出下一阶段；避免重复前卷的冲突与高潮套路。" : "这是固定章数作品。若该卷终点就是作品终点，安排主要冲突收束。"}` },
  { role: "user" as const, content: `作品：${wrap(input.bible.meta.suggested_title, "outline_title")}
世界观：${wrap(input.bible.world.setting_summary, "world_setting")}
人物：${wrap(JSON.stringify(input.bible.characters), "character_personality")}
已完成至第 ${input.current_chapter} 章。规划第 ${input.start_chapter} 至 ${input.end_chapter} 章。
最新状态：${wrap(JSON.stringify(input.bible.story_state ?? {}).slice(0, 16000), "story_state")}
最近大纲：${wrap(JSON.stringify(input.recentOutline.slice(-20)), "outline_summary")}
最近已完成正文（已发生事实）：${wrap(JSON.stringify(input.recentProgress ?? []), "chapter_content")}
最近两卷计划（不要重复）：${wrap(JSON.stringify(input.previousPlans.slice(-2)), "outline_summary")}` }];
}

export async function planVolume(input: PlanVolumeInput): Promise<VolumePlan> {
  const response = await chatCompletionWithRetry({ route: "/agent/plan_volume", agent: "volume_planner", novelId: input.novelId,
    model: input.model, messages: buildVolumePlanPrompt(input), responseFormat: "json_object", temperature: 0.6, timeoutMs: 120_000 });
  const plan = VolumePlanSchema.parse(parseFirstJsonObject(response.content));
  const canonical: VolumePlan["thread_targets"] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const target of plan.thread_targets) {
    const mapped = mapThreadTarget(input.bible.story_state, target, input);
    if ("reason" in mapped) { dropped.push(`${target.title}（${mapped.reason}）`); continue; }
    const key = `${mapped.kind}:${mapped.title}`;
    if (seen.has(key)) { dropped.push(`${target.title}（重复安排）`); continue; }
    seen.add(key);
    canonical.push({ ...target, title: mapped.title });
  }
  if (dropped.length > 0) logWarn("volume_plan.target_dropped", { novel_id: input.novelId, dropped: dropped.join("；") });
  // F4（2026-10 真实跑批）：规划器面对少量线索时会静默输出空 thread_targets，
  // 伏笔期限机制整轮空转（overduePayoffs 无事跟踪）。有空闲线索却一个目标都
  // 没设时告警；真正无线索的合法空场景不告警。
  const eligible = eligibleThreadTitles(input.bible.story_state);
  const eligibleCount = eligible.plot_threads.length + eligible.foreshadowing.length;
  if (eligibleCount > 0 && canonical.length === 0) {
    logWarn("volume_plan.no_thread_targets", { novel_id: input.novelId, eligible_threads: eligibleCount });
  }
  return { ...plan, thread_targets: canonical };
}

export function formatVolumeArc(arc?: VolumeArc) {
  if (!arc) return "";
  return `卷级计划（意图，不是已发生事实）：第 ${arc.start_chapter}–${arc.end_chapter} 章\n${wrap(JSON.stringify(arc.plan), "outline_summary")}\n遵循人物已发生的变化；接近期限时推进并回收指定线索，不能仅用宣称已解决替代正文中的行动与结果。`;
}

export function overduePayoffs(arc: VolumeArc | undefined, state: StoryStateV1 | undefined, chapter: number) {
  return arc?.plan.thread_targets.filter(t => t.action === "resolve" && t.deadline_chapter <= chapter && !(t.kind === "plot_threads"
    ? state?.plot_threads?.some(p => p.title === t.title && p.status === "resolved")
    : state?.foreshadowing?.some(p => p.clue === t.title && p.status === "resolved"))).map(t => t.title) ?? [];
}
