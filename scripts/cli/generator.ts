import type { CliConfig } from "./types";

import type { BibleData, OutlineChapter } from "./types";
import {
  saveChapter,
  saveProgress,
  appendQuality,
  appendUsage,
  loadChapter,
  countChapters,
  acquireLock,
  releaseLock,
} from "./storage";
import { evaluateNovelQuality, type QualityChapterInput } from "@/lib/evals/novelQuality";
import { runChapterPipeline, type RunChapterPipelineInput } from "@/lib/agent/chapterPipeline";
import type { NovelProfile, BibleDraft } from "@/lib/validation/schemas";

interface GeneratorInput {
  config: CliConfig;
  dir: string;
  novelId: string;
  bible: BibleData;
  outline: OutlineChapter[];
  totalChapters: number;
  model: string;
}

export async function runAutoGeneration(input: GeneratorInput): Promise<void> {
  const { config, dir, novelId, bible, outline, totalChapters, model } = input;

  if (!acquireLock(dir)) {
    console.error("Another generation is already running for this project.");
    process.exit(1);
  }

  // CLI 占位 profile：字段为简化值，部分枚举值尚未对齐 NovelProfile 的严格约束，
  // 用结构桥接传入写作管线（TODO: 后续对齐枚举，或改用 buildDefaultProfile）。
  const profile = {
    genre_main: "web" as const,
    genre_sub: "",
    logline: "",
    description: "",
    length: "long" as const,
    audience: "general" as const,
    tone: "neutral" as const,
    pace: "mid" as const,
    pov: "third" as const,
    ai_freedom: "mid" as const,
    title: bible.meta.suggested_title,
  } as unknown as NovelProfile;

  const startedAt = new Date().toISOString();

  for (let i = 1; i <= totalChapters; i++) {
    // Cost check before each chapter
    const existing = countChapters(dir);
    if (existing >= totalChapters) {
      console.log(`\n✅ 全部 ${totalChapters} 章已完成！`);
      break;
    }

    const outlineCh = outline.find((c) => c.index === i);
    const chapterTitle = outlineCh?.title ?? `第${i}章`;

    console.log(`\n📝 第 ${i}/${totalChapters} 章《${chapterTitle}》`);

    // Build previous chapters context
    const prevChapters: RunChapterPipelineInput["chapters"] = [];
    for (let j = Math.max(1, i - 3); j < i; j++) {
      const ch = loadChapter(dir, j);
      if (ch) {
        prevChapters.push({
          chapter_index: j,
          title: chapterTitle,
          content: ch.content,
          id: `ch-${j}`,
          status: "done" as const,
        } as unknown as RunChapterPipelineInput["chapters"][number]);
      }
    }

    try {
      const result = await runChapterPipeline({
        novelId,
        bible: bible as unknown as BibleDraft, // CLI 的 BibleData 与应用层 BibleDraft 结构兼容
        profile,
        chapters: prevChapters,
        chapterIndex: i,
        revisionRounds: config.generation.revision_rounds,
        skipRetrieval: true, // CLI doesn't have pgvector
      });

      // Save chapter
      saveChapter(dir, i, chapterTitle, result.content);
      console.log(`  ✅ 起草完成 (${result.content.length} 字, ${result.cost.cny.toFixed(4)} 元)`);

      // Quality check
      const chInput: QualityChapterInput = { chapterIndex: i, title: chapterTitle, content: result.content };
      const qualityReport = evaluateNovelQuality({
        bible: bible as unknown as BibleDraft,
        chapters: [chInput],
        fixtureId: `cli-ch${i}`,
      });

      const scorePct = Math.round((qualityReport.overallScore / qualityReport.maxScore) * 1000) / 10;
      const dims: Record<string, number> = {};
      for (const m of qualityReport.metrics) {
        dims[m.key] = Math.round((m.score / m.max) * 1000) / 10;
      }

      appendQuality(dir, { chapter: i, score: scorePct, dimensions: dims });
      console.log(`  📊 质量: ${scorePct}%`);

      // Usage record
      appendUsage(dir, {
        chapter: i,
        title: chapterTitle,
        draft_cost: result.cost.cny,
        critic_cost: 0,
        revise_cost: 0,
        state_diff_cost: 0,
        total_cost: result.cost.cny,
      });

      // Update progress
      saveProgress(dir, {
        total: totalChapters,
        current: i,
        status: i >= totalChapters ? "completed" : "running",
        cost: result.cost.cny,
        cost_cap: config.generation.cost_cap_cny,
        model,
        started_at: startedAt,
        last_chapter_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`  ❌ 第 ${i} 章生成失败: ${err instanceof Error ? err.message : err}`);
      saveProgress(dir, {
        total: totalChapters,
        current: i - 1,
        status: "paused",
        cost: 0,
        cost_cap: config.generation.cost_cap_cny,
        model,
        started_at: startedAt,
        last_chapter_at: new Date().toISOString(),
      });
      releaseLock(dir);
      process.exit(1);
    }
  }

  releaseLock(dir);
  console.log(`\n🎉 全部完成！输出目录: ${dir}`);
}
