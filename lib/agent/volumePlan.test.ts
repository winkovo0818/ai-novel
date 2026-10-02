import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/scripts/fixtures/eval-novels/xuanhuan-seed.json";
import { BibleDraftSchema } from "@/lib/validation/schemas";
const chat = vi.hoisted(() => vi.fn()); vi.mock("@/lib/llm/client", () => ({ chatCompletionWithRetry: chat }));
const warn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/logger", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/observability/logger")>(), logWarn: warn }));
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
  it.each([8, 81])("drops targets with invalid payoff deadline %d instead of failing the plan", async deadline_chapter => {
    const known = { ...bible, story_state: { plot_threads: [{ id: "p", title: "旧案", status: "open" as const }] } };
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [{ kind: "plot_threads", title: "旧案", action: "resolve", deadline_chapter }] }) });
    const result = await planVolume({ ...input, bible: known });
    expect(result.thread_targets).toHaveLength(0); expect(result.goal).toBe(plan.goal);
  });
  it("drops hallucinated, resolved and duplicate targets instead of failing the plan", async () => {
    const target = { kind: "plot_threads" as const, title: "旧案", action: "resolve" as const, deadline_chapter: 20 };
    const known = { ...bible, story_state: { plot_threads: [{ id: "p", title: "旧案", status: "open" as const }] } };
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [{ ...target, title: "查无此案" }] }) });
    expect((await planVolume({ ...input, bible: known })).thread_targets).toHaveLength(0);
    const resolved = { ...bible, story_state: { plot_threads: [{ id: "p", title: "旧案", status: "resolved" as const }] } };
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [target] }) });
    expect((await planVolume({ ...input, bible: resolved })).thread_targets).toHaveLength(0);
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [target, target] }) });
    expect((await planVolume({ ...input, bible: known })).thread_targets).toEqual([target]);
    expect(warn).toHaveBeenCalled();
  });
  it("canonicalizes paraphrased titles back to the known unresolved thread and drops unmappable ones", async () => {
    // 真实跑批止链场景：规划器把「上古剑魂来源」改写成两种形式。
    const known = { ...bible, story_state: { plot_threads: [{ id: "p", title: "上古剑魂来源", status: "open" as const }] } };
    chat.mockResolvedValue({ content: JSON.stringify({ ...plan, thread_targets: [
      { kind: "plot_threads", title: "推进上古剑魂来源线", action: "advance", deadline_chapter: 20 },
      { kind: "plot_threads", title: "活过宗门考核并确认剑魂来源", action: "resolve", deadline_chapter: 30 },
    ] }) });
    const result = await planVolume({ ...input, bible: known });
    expect(result.thread_targets).toEqual([{ kind: "plot_threads", title: "上古剑魂来源", action: "advance", deadline_chapter: 20 }]);
    expect(warn).toHaveBeenCalled();
  });
  it("lists eligible unresolved threads verbatim in the prompt", () => {
    const known = { ...bible, story_state: { plot_threads: [{ id: "p", title: "上古剑魂来源", status: "open" as const }], foreshadowing: [{ id: "f", clue: "神秘木牌", status: "planted" as const }] } };
    const prompt = buildVolumePlanPrompt({ ...input, bible: known }).map(m => m.content).join("\n");
    expect(prompt).toContain("逐字复制"); expect(prompt).toContain("上古剑魂来源"); expect(prompt).toContain("神秘木牌");
    const noThreads = { ...bible, story_state: { plot_threads: [], foreshadowing: [] } };
    expect(buildVolumePlanPrompt({ ...input, bible: noThreads })[0].content).toContain("thread_targets 必须是空数组");
  });
  it("warns when eligible threads exist but the plan sets no thread targets (F4)", async () => {
    const known = { ...bible, story_state: { plot_threads: [{ id: "p", title: "旧案", status: "open" as const }] } };
    chat.mockResolvedValue({ content: JSON.stringify(plan) }); // thread_targets: []
    await planVolume({ ...input, bible: known });
    expect(warn).toHaveBeenCalledWith("volume_plan.no_thread_targets", expect.objectContaining({ eligible_threads: 1 }));
    warn.mockClear();
    await planVolume({ ...input, bible: { ...bible, story_state: { plot_threads: [], foreshadowing: [] } } });
    expect(warn).not.toHaveBeenCalled(); // 真正无线索的合法空场景不告警
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
