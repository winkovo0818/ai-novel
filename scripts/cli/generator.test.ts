import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliConfig } from "./types";
import { loadProgress, loadUsage, loadNotes, loadChapter } from "./storage";
const { pipeline, completion, gate } = vi.hoisted(() => ({ pipeline: vi.fn(), completion: vi.fn(), gate: vi.fn() }));
vi.mock("@/lib/agent/chapterPipeline", () => ({ runChapterPipeline: pipeline }));
vi.mock("@/lib/agent/qualityGate", () => ({ evaluateChapterGate: gate }));
vi.mock("./llm", () => ({ cliChatCompletion: completion }));
import { runAutoGeneration } from "./generator";
const validBible = {
  meta: { suggested_title: "逆魂纪", alternative_titles: ["逆魂", "魂纪", "纪逆"] },
  characters: [
    { role: "protagonist", name: "沈言", age: 18, appearance: "清瘦", personality: "隐忍机敏", catchphrase: "活下去", abilities: ["剑魂共振"], goals: "查明父母旧案", motivation: "复仇与求真", secrets: ["体内有剑鞘"], relations: [] },
    { role: "mentor", name: "剑魂", age: 999, appearance: "无形之声", personality: "苍老讥诮", catchphrase: "归鞘", abilities: ["剑魂共振"], goals: "重塑本体", motivation: "求存", secrets: ["认识沈恪"], relations: [] },
    { role: "antagonist", name: "蒋阶", age: 40, appearance: "阴冷", personality: "狡诈", catchphrase: "棋子而已", abilities: ["祭剑术"], goals: "夺取剑魂", motivation: "野心", secrets: ["祭剑阵主谋"], relations: [] },
  ],
  world: { setting_summary: "九州仙门衰微，剑魂认主不可逆的修真世界".repeat(4), factions: [{ name: "柴饦峰", alignment: "中立", role: "杂役所在" }, { name: "黑铁会", alignment: "邪恶", role: "祭剑阵主谋" }], rules: ["剑魂认主不可逆", "祭剑需以血引魂"], geography: ["柴饦峰", "后山裂井"] },
  outline: { volume_1: { name: "第一卷", theme: "觉醒", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `第${i + 1}章梗概：覆盖本章冲突、推进方向与悬念落点，长度足以通过校验。` })) } },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
};


const dirs: string[] = [];
afterEach(() => { vi.resetAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const config: CliConfig = { llm: { provider: "custom", model: "chosen-model", base_url: "https://test.invalid", api_key: "test", max_tokens: 4096, temperature: 0.7 },
  generation: { default_chapters: 8, quality_floor: 85, revision_rounds: 0, cost_cap_cny: 1, target_words_per_chapter: 3000, max_state_changes: 15 },
  output: { export_dir: "/tmp", auto_export: false } };
function input() {
  const dir = mkdtempSync(join(tmpdir(), "novel-generator-")); dirs.push(dir); mkdirSync(join(dir, "chapters"));
  const result = { title: "第一章", content: "沈言走出灶房。", criticIssues: [], rawCleanupHits: [] };
  pipeline.mockImplementation(async opts => { await opts.completion({ messages: [], agent: "writer" }); return { ...result, chapterIndex: opts.chapterIndex }; });
  completion.mockResolvedValue({ content: "{}", tokenIn: 1, tokenOut: 1, costCny: 0.1, model: "chosen-model" });
  gate.mockReturnValue({ pass: true, scorePct: 100, report: { metrics: [] } });
  return { config, dir, novelId: "cli", bible: validBible as Parameters<typeof runAutoGeneration>[0]["bible"],
    outline: validBible.outline.volume_1.chapters, totalChapters: 8, model: "chosen-model" };
}
describe("CLI generation wiring", () => {
  it("uses the configured endpoint/model, tracks state update costs, and completes", async () => {
    const data = input(); data.config = { ...config, generation: { ...config.generation, cost_cap_cny: 10 } };
    await runAutoGeneration(data);
    expect(completion.mock.calls[0][0].llm.model).toBe("chosen-model");
    expect(loadUsage(data.dir)).toHaveLength(16); expect(loadProgress(data.dir)?.current).toBe(8);
    expect(loadProgress(data.dir)?.status).toBe("completed"); expect(existsSync(join(data.dir, ".run.lock"))).toBe(false);
  });
  it("preserves rejected prose in review notes instead of marking it complete", async () => {
    const data = input(); gate.mockReturnValue({ pass: false, reason: "critical", scorePct: 0, report: { metrics: [] } });
    await expect(runAutoGeneration(data)).rejects.toThrow("复核");
    expect(loadNotes(data.dir).notes?.[0].text).toContain("沈言走出灶房"); expect(loadChapter(data.dir, 1)).toBeNull();
    expect(loadProgress(data.dir)?.status).toBe("needs_review");
  });
  it("stops before the next LLM call when the cap has been consumed", async () => {
    const data = input(); data.config = { ...config, generation: { ...config.generation, cost_cap_cny: 0.1 } };
    await expect(runAutoGeneration(data)).rejects.toThrow("费用"); expect(completion).toHaveBeenCalledOnce();
    expect(loadProgress(data.dir)?.status).toBe("paused"); expect(existsSync(join(data.dir, ".run.lock"))).toBe(false);
  });
});
