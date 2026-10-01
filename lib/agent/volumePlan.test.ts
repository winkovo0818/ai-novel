import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/scripts/fixtures/eval-novels/xuanhuan-seed.json";
import { BibleDraftSchema } from "@/lib/validation/schemas";
const chat = vi.hoisted(() => vi.fn()); vi.mock("@/lib/llm/client", () => ({ chatCompletionWithRetry: chat }));
import { VolumePlanSchema, volumeBounds, planVolume, buildVolumePlanPrompt, formatVolumeArc, overduePayoffs } from "./volumePlan";
const bible = BibleDraftSchema.parse(seed.bible);
const plan = VolumePlanSchema.parse({ name: "追索旧案", theme: "主动调查并承担代价", goal: "取得可验证的旧案证据并保护证人", central_conflict: "调查行动与宗门利益发生直接冲突", character_change: "主角从被动逃避转为主动承担责任", climax: "各方势力交锋中主角保护证人并揭露证据", resolution: "本卷解决证据可信度与证人安全问题", next_hook: "证据引出新的幕后势力和具体冲突" });
const input = { novelId: "n", bible, start_chapter: 1, end_chapter: 80, current_chapter: 8, recentOutline: [], previousPlans: [], continuous: true };
const arc = { volume_index: 0, start_chapter: 1, end_chapter: 80, planned_after_chapter: 8, plan };
beforeEach(() => vi.resetAllMocks());
describe("volume planning", () => {
  it("handles seed, next volume, far future, and finite book boundaries", () => {
    expect(volumeBounds(bible, 10, true, 20)).toMatchObject({ volume_index: 0, start_chapter: 1, end_chapter: 80 });
    expect(volumeBounds(bible, 81, true, 90)).toMatchObject({ volume_index: 1, start_chapter: 81, end_chapter: 160 });
    expect(volumeBounds(bible, 161, true, 180)).toMatchObject({ volume_index: 2, start_chapter: 161, end_chapter: 240 });
    expect(volumeBounds(bible, 10, false, 20).end_chapter).toBe(20);
  });
  it("preserves an existing short-volume boundary", () => {
    const multi = { ...bible, outline: { ...bible.outline, volumes: [{ name: "第二卷", theme: "继续", chapter_count_estimate: 8, chapters: [{ ...bible.outline.volume_1.chapters[0], index: 9 }] }] } };
    expect(volumeBounds(multi, 8, true, 30).end_chapter).toBe(8); expect(volumeBounds(multi, 9, true, 30)).toMatchObject({ volume_index: 1, start_chapter: 9 });
  });
  it("returns a validated plan and passes the chosen model", async () => {
    chat.mockResolvedValue({ content: JSON.stringify(plan) }); expect(await planVolume({ ...input, model: "chosen" })).toEqual(plan);
    expect(chat.mock.calls[0][0].model).toBe("chosen");
  });
  it("accepts only existing unresolved thread targets", async () => {
    const known = { ...bible, story_state: { plot_threads: [{ id: "p", title: "旧案", status: "open" as const }], foreshadowing: [{ id: "f", clue: "木牌", status: "planted" as const }] } };
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [{ kind: "plot_threads", title: "旧案", action: "resolve", deadline_chapter: 20 }, { kind: "foreshadowing", title: "木牌", action: "advance", deadline_chapter: 30 }] }) });
    expect((await planVolume({ ...input, bible: known })).thread_targets).toHaveLength(2);
  });
  it.each([8, 81, 0])("rejects invalid payoff deadline %d", async deadline_chapter => {
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [{ kind: "plot_threads", title: "旧案", action: "resolve", deadline_chapter }] }) });
    await expect(planVolume(input)).rejects.toThrow();
  });
  it("rejects hallucinated, resolved and duplicate thread targets", async () => {
    const target = { kind: "plot_threads", title: "旧案", action: "resolve", deadline_chapter: 20 };
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [target] }) }); await expect(planVolume(input)).rejects.toThrow("未知");
    await expect(planVolume({ ...input, bible: { ...bible, story_state: { plot_threads: [{ id: "p", title: "旧案", status: "resolved" }] } } })).rejects.toThrow("已解决");
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [target, target] }) });
    await expect(planVolume({ ...input, bible: { ...bible, story_state: { plot_threads: [{ id: "p", title: "旧案", status: "open" }] } } })).rejects.toThrow("重复");
  });
  it("includes real progress, prior arcs, and the finite ending policy in its prompt", () => {
    const prompt = buildVolumePlanPrompt({ ...input, continuous: false, recentProgress: [{ chapter_index: 8, title: "证人出现", excerpt: "证人已经获救" }], previousPlans: [plan] }).map(m => m.content).join("\n");
    expect(prompt).toContain("证人已经获救"); expect(prompt).toContain("不要重复"); expect(prompt).toContain("固定章数");
    expect(buildVolumePlanPrompt(input)[0].content).toContain("不是全书完结"); expect(formatVolumeArc(arc)).toContain("意图，不是已发生事实"); expect(formatVolumeArc()).toBe("");
  });
  it("enforces due resolutions without demanding future or advance targets prematurely", () => {
    const tracked = { ...arc, plan: { ...plan, thread_targets: [{ kind: "plot_threads" as const, title: "旧案", action: "resolve" as const, deadline_chapter: 20 }, { kind: "foreshadowing" as const, title: "木牌", action: "resolve" as const, deadline_chapter: 30 }] } };
    expect(overduePayoffs(tracked, undefined, 19)).toEqual([]); expect(overduePayoffs(tracked, undefined, 30)).toEqual(["旧案", "木牌"]);
    expect(overduePayoffs(tracked, { plot_threads: [{ id: "p", title: "旧案", status: "resolved" }], foreshadowing: [{ id: "f", clue: "木牌", status: "resolved" }] }, 30)).toEqual([]);
    expect(overduePayoffs(undefined, undefined, 30)).toEqual([]);
  });
});
