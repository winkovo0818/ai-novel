import { prisma } from "@/lib/db";
import { evaluateNovelQuality, type QualityChapterInput } from "@/lib/evals/novelQuality";
import type { BibleDraft } from "@/lib/validation/schemas";

interface WindowResult {
  chapterIndex: number;
  title: string;
  scorePct: number;
  dimensions: Record<string, number>;
}

interface TrendResult {
  coldStart: true;
  chapterCount: number;
  message: string;
}

interface TrendData {
  coldStart: false;
  totalWindows: number;
  windows: WindowResult[];
  summary: {
    overallAvg: number;
    trend: string;
    bestChapter: { index: number; title: string; score: number };
    worstChapter: { index: number; title: string; score: number };
    firstHalfAvg: number;
    secondHalfAvg: number;
  };
  dimensionAvgs: Record<string, number>;
  riskFlags: Array<{ chapters: number[]; dimension: string; avg: number; message: string }>;
}

export type QualityTrendResult = TrendResult | TrendData;

const DIM_LABELS: Record<string, string> = {
  continuity: "连贯性", logic: "逻辑", character_consistency: "角色一致性",
  plot_progress: "情节推进", world_rules: "世界观", ai_voice: "AI腔", prose_readability: "文笔",
};

export async function computeQualityTrend(novelId: string): Promise<QualityTrendResult> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      bible: true,
      chapters: {
        where: { status: "done" },
        orderBy: { chapter_index: "asc" },
      },
    },
  });

  if (!novel || !novel.bible) {
    return { coldStart: true, chapterCount: 0, message: "作品未找到" };
  }

  const bible = novel.bible.content as BibleDraft;
  const chapters = novel.chapters;

  if (chapters.length < 3) {
    return {
      coldStart: true,
      chapterCount: chapters.length,
      message: `需要至少 3 个已完成的章节才能分析趋势。当前已完成 ${chapters.length} 章。`,
    };
  }

  const windowResults: WindowResult[] = [];

  for (let i = 2; i < chapters.length; i++) {
    const window = chapters.slice(i - 2, i + 1);
    const inputs: QualityChapterInput[] = window.map((ch) => ({
      chapterIndex: ch.chapter_index,
      title: ch.title,
      content: ch.content,
    }));

    const report = evaluateNovelQuality({
      bible,
      chapters: inputs,
      fixtureId: `trend-window-${window[2].chapter_index}`,
    });

    const dims: Record<string, number> = {};
    for (const m of report.metrics) {
      dims[m.key] = Math.round((m.score / m.max) * 1000) / 10;
    }

    windowResults.push({
      chapterIndex: window[2].chapter_index,
      title: window[2].title,
      scorePct: Math.round((report.overallScore / report.maxScore) * 1000) / 10,
      dimensions: dims,
    });
  }

  const scores = windowResults.map((w) => w.scorePct);
  const overallAvg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const mid = Math.floor(scores.length / 2);
  const firstAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid || 0;
  const secondAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid) || 0;
  const trend = secondAvg - firstAvg >= 2 ? "improving" : firstAvg - secondAvg >= 2 ? "declining" : "stable";

  const best = windowResults.reduce((a, b) => (b.scorePct > a.scorePct ? b : a), windowResults[0]);
  const worst = windowResults.reduce((a, b) => (b.scorePct < a.scorePct ? b : a), windowResults[0]);

  const dimKeys = Object.keys(windowResults[0]?.dimensions ?? {});
  const dimensionAvgs: Record<string, number> = {};
  for (const key of dimKeys) {
    const vals = windowResults.map((w) => w.dimensions[key] ?? 0);
    dimensionAvgs[key] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  const riskFlags: TrendData["riskFlags"] = [];
  for (const key of dimKeys) {
    let lowStreak = 0, lowStart = 0;
    for (let i = 0; i < windowResults.length; i++) {
      if ((windowResults[i].dimensions[key] ?? 0) < 70) {
        if (lowStreak === 0) lowStart = windowResults[i].chapterIndex;
        lowStreak++;
        if (lowStreak >= 3) {
          riskFlags.push({
            chapters: [lowStart, windowResults[i].chapterIndex],
            dimension: key,
            avg: Math.round(
              (windowResults.slice(i - lowStreak + 1, i + 1).reduce((s, w) => s + (w.dimensions[key] ?? 0), 0) / lowStreak) * 10
            ) / 10,
            message: `${DIM_LABELS[key] ?? key} 连续 ${lowStreak} 章偏低`,
          });
          lowStreak = 0;
        }
      } else { lowStreak = 0; }
    }
    for (let i = 1; i < windowResults.length; i++) {
      const prev = windowResults[i - 1].dimensions[key] ?? 0;
      const curr = windowResults[i].dimensions[key] ?? 0;
      if (prev - curr > 20) {
        riskFlags.push({
          chapters: [windowResults[i - 1].chapterIndex, windowResults[i].chapterIndex],
          dimension: key,
          avg: curr,
          message: `${DIM_LABELS[key] ?? key} 骤降 (${prev} → ${curr})`,
        });
      }
    }
  }

  return {
    coldStart: false,
    totalWindows: windowResults.length,
    windows: windowResults,
    summary: {
      overallAvg, trend,
      bestChapter: { index: best.chapterIndex, title: best.title, score: best.scorePct },
      worstChapter: { index: worst.chapterIndex, title: worst.title, score: worst.scorePct },
      firstHalfAvg: Math.round(firstAvg * 10) / 10,
      secondHalfAvg: Math.round(secondAvg * 10) / 10,
    },
    dimensionAvgs,
    riskFlags,
  };
}
