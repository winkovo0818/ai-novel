import type { CliConfig, BibleData, OutlineChapter, NovelMeta } from "./types";
import { saveChapter, saveProgress, appendQuality, appendUsage, loadChapter, loadProgress, loadUsage,
  acquireLock, releaseLock, saveBible, saveNotes } from "./storage";
import { cliChatCompletion } from "./llm";
import { evaluateChapterGate } from "@/lib/agent/qualityGate";
import { runChapterPipeline, type RunChapterPipelineInput } from "@/lib/agent/chapterPipeline";
import { BibleDraftSchema, StateDiffSchema, buildDefaultProfile } from "@/lib/validation/schemas";

import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { applyStateDiff, validateStateDiff } from "@/lib/validation/stateDiffMerge";

interface GeneratorInput {
  config: CliConfig; dir: string; novelId: string; bible: BibleData;
  outline: OutlineChapter[]; totalChapters: number; model: string; meta?: NovelMeta;
}

export async function runAutoGeneration(input: GeneratorInput): Promise<void> {
  const { config, dir, novelId, outline, totalChapters, model } = input;
  if (!acquireLock(dir)) throw new Error("Another generation is already running for this project");
  let current = 0;
  let cost = loadUsage(dir).reduce((sum, u) => sum + u.total_cost, 0);
  const startedAt = loadProgress(dir)?.started_at ?? new Date().toISOString();
  let bible: BibleData;
  try { bible = BibleDraftSchema.parse({ ...input.bible,
    outline: { volume_1: { ...input.bible.outline.volume_1, chapters: outline, chapter_count_estimate: totalChapters } } }); } catch (error) { releaseLock(dir); throw error; }
  const profile = buildDefaultProfile("web", input.meta?.theme ?? "小说", input.meta?.logline ?? "");
  if ([2000, 3000, 5000].includes(config.generation.target_words_per_chapter)) {
    profile.chapter_word_count = config.generation.target_words_per_chapter as 2000 | 3000 | 5000;
  }
  const progress = (status: "running" | "paused" | "needs_review" | "completed") => saveProgress(dir, {
    total: totalChapters, current, status, cost, cost_cap: config.generation.cost_cap_cny,
    model, started_at: startedAt, last_chapter_at: new Date().toISOString(),
  });
  const completion: NonNullable<RunChapterPipelineInput["completion"]> = async opts => {
    if (cost >= config.generation.cost_cap_cny) throw new Error("生成费用达到上限");
    const result = await cliChatCompletion({ ...config, llm: { ...config.llm, model } }, {
      messages: opts.messages, temperature: opts.temperature, timeoutMs: opts.timeoutMs,
      topP: opts.topP, frequencyPenalty: opts.frequencyPenalty, presencePenalty: opts.presencePenalty,
    });
    cost += result.costCny;
    const category = opts.agent === "critic" ? "critic_cost" : opts.agent === "state_updater" ? "state_diff_cost"
      : opts.route?.endsWith("/revise") ? "revise_cost" : "draft_cost";
    appendUsage(dir, { chapter: current + 1, title: opts.agent ?? "writer", draft_cost: 0,
      critic_cost: 0, revise_cost: 0, state_diff_cost: 0, [category]: result.costCny, total_cost: result.costCny });
    return result;
  };
  try {
    if (loadProgress(dir)?.status === "needs_review") throw new Error("请先复核 notes.json 中的候选稿；确认或移除后再恢复生成");
    for (let i = 1; i <= totalChapters; i++) {
      if (loadChapter(dir, i)) { current = i; continue; }
      if (cost >= config.generation.cost_cap_cny) { progress("paused"); return; }
      const previous: RunChapterPipelineInput["chapters"] = [];
      for (let j = Math.max(1, i - 5); j < i; j++) {
        const ch = loadChapter(dir, j);
        if (ch) previous.push({ id: `ch-${j}`, chapter_index: j, title: ch.title, content: ch.content, status: "done" });
      }
      const result = await runChapterPipeline({ novelId, bible, profile, chapters: previous,
        chapterIndex: i, revisionRounds: config.generation.revision_rounds, skipRetrieval: true, completion, model });
      const summaries = new Map(outline.map(c => [c.index, c.summary]));
      const gate = evaluateChapterGate([...previous.slice(-2).map(c => ({ chapterIndex: c.chapter_index,
        title: c.title, content: c.content, outlineSummary: summaries.get(c.chapter_index) })),
        { chapterIndex: i, title: result.title, content: result.content,
          outlineSummary: summaries.get(i), rawCleanupHits: result.rawCleanupHits }], bible,
        { qualityFloor: config.generation.quality_floor, criticIssues: result.criticIssues });
      appendQuality(dir, { chapter: i, score: gate.scorePct,
        dimensions: Object.fromEntries(gate.report.metrics.map(m => [m.key, m.score])) });
      const reject = (reason: string): never => {
        saveNotes(dir, { notes: [{ text: `第 ${i} 章 · ${result.title}\n复核原因：${reason}\n\n${result.content}`, created_at: new Date().toISOString() }] });
        progress("needs_review");
        throw new Error(`第 ${i} 章需要复核（候选稿保存在 notes.json）：${reason}`);
      };
      if (!gate.pass) reject(gate.reason);
      const response = await completion({ route: "/cli/state-diff", agent: "state_updater", messages: buildStateDiffPrompt({
        bible, storyState: bible.story_state, chapterIndex: i, chapterTitle: result.title, chapterContent: result.content,
      }), responseFormat: "json_object", temperature: 0 });
      const diff = StateDiffSchema.safeParse(parseFirstJsonObject(response.content));
      if (!diff.success) reject("状态变更 JSON 无法解析");
      if (diff.success) {
        const errors = validateStateDiff(bible, diff.data, result.content, { maxStateChanges: config.generation.max_state_changes });
        if (errors.length) reject(errors.map(e => e.message).join("；"));
        bible = applyStateDiff(bible, diff.data, i);
      }
      saveChapter(dir, i, result.title, result.content);
      current = i;
      saveBible(dir, bible);
      progress(i === totalChapters ? "completed" : "running");
    }
    progress("completed");
  } catch (error) {
    if (loadProgress(dir)?.status !== "needs_review") progress("paused");
    throw error;
  } finally { releaseLock(dir); }
}
