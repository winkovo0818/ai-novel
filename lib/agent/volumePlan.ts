import { z } from "zod";
import type { BibleDraft, StoryStateV1 } from "@/lib/validation/schemas";
import { getVolumes } from "@/lib/validation/schemas";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { PROMPT_SAFETY_PREAMBLE, wrap } from "@/lib/llm/promptSafety";

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

export interface PlanVolumeInput {
  novelId: string; bible: BibleDraft; start_chapter: number; end_chapter: number; current_chapter: number;
  recentOutline: Array<{ chapter_index: number; title: string; summary: string }>;
  recentProgress?: Array<{chapter_index: number; title: string; excerpt: string}>;
  previousPlans: VolumePlan[]; model?: string; continuous: boolean;
}
export function buildVolumePlanPrompt(input: PlanVolumeInput) {
  return [{ role: "system" as const, content: `你是长篇小说卷级剧情规划师。为第 ${input.start_chapter} 至 ${input.end_chapter} 章设计一个有成果、有代价的故事阶段。
${PROMPT_SAFETY_PREAMBLE}
输出且只输出 JSON：{"name":"卷名","theme":"主题","goal":"可检验的阶段目标","central_conflict":"核心冲突","character_change":"人物改变及代价","climax":"高潮的行动与结果","resolution":"本卷解决什么","next_hook":"后续新冲突","avoid_patterns":["避免的重复套路"],"thread_targets":[{"kind":"plot_threads|foreshadowing","title":"已有线索名","action":"advance|resolve","deadline_chapter":${input.end_chapter}}]}。
各目标描述 10–500 字。线索目标最多 10 项，只能引用最新状态中未解决的线索，期限必须晚于第 ${input.current_chapter} 章且在本卷范围内。近期正文与状态是已经发生的事实，计划不能改写它们。
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
  const seen = new Set<string>();
  for (const target of plan.thread_targets) {
    if (target.deadline_chapter <= input.current_chapter || target.deadline_chapter < input.start_chapter || target.deadline_chapter > input.end_chapter) throw new Error("卷计划的线索期限越界或已经过去");
    const known = target.kind === "plot_threads" ? input.bible.story_state?.plot_threads?.some(t => t.title === target.title && t.status !== "resolved")
      : input.bible.story_state?.foreshadowing?.some(t => t.clue === target.title && t.status !== "resolved");
    if (!known) throw new Error(`卷计划引用了未知或已解决的线索：${target.title}`);
    const key = `${target.kind}:${target.title}`;
    if (seen.has(key)) throw new Error("卷计划重复安排同一线索");
    seen.add(key);
  }
  return plan;
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
