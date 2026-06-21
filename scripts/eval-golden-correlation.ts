/**
 * eval:golden — validate the heuristic quality evaluator against human labels.
 *
 * Reads docs/evals/golden/manifest.json, and for each annotated sample: loads
 * the referenced Bible fixture + chapter texts, runs evaluateNovelQuality, pairs
 * the auto scores with the human labels, then reports per-dimension Spearman +
 * MAE (see lib/evals/goldenCorrelation.ts). Pure-ish IO wrapper — the math lives
 * in the tested core module.
 *
 *   npm run eval:golden                # annotated samples only
 *   npm run eval:golden -- --include-seed   # also include seed/placeholder samples
 *   npm run eval:golden -- --threshold 0.6  # custom weak-dimension threshold
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
  computeGoldenCorrelation,
  type GoldenDimension,
  type GoldenScorePair,
} from "@/lib/evals/goldenCorrelation";
import { evaluateNovelQuality, type QualityChapterInput } from "@/lib/evals/novelQuality";
import { BibleDraftSchema } from "@/lib/validation/schemas";

const ROOT = process.cwd();
const GOLDEN_DIR = path.join(ROOT, "docs", "evals", "golden");
const FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "eval-novels");

interface ManifestSample {
  id: string;
  bibleFixture: string;
  window: number[];
  chaptersFile: string;
  labelsFile: string;
  status?: string;
  note?: string;
}

interface Manifest {
  version: number;
  samples: ManifestSample[];
}

interface ChaptersFile {
  sampleId: string;
  chapters: Array<{ chapterIndex: number; title: string; content: string; outlineSummary?: string }>;
}

interface LabelsFile {
  sampleId: string;
  humanScores: Partial<Record<GoldenDimension, number>>;
  status?: string;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
}

async function loadBible(fixtureId: string) {
  const raw = await readJson<{ bible: unknown }>(path.join(FIXTURE_DIR, `${fixtureId}.json`));
  return BibleDraftSchema.parse(raw.bible);
}

function parseArgs(argv: string[]): { includeSeed: boolean; threshold?: number } {
  const includeSeed = argv.includes("--include-seed");
  const thresholdIdx = argv.indexOf("--threshold");
  const threshold = thresholdIdx >= 0 ? Number(argv[thresholdIdx + 1]) : undefined;
  return { includeSeed, threshold: Number.isFinite(threshold) ? threshold : undefined };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readJson<Manifest>(path.join(GOLDEN_DIR, "manifest.json"));

  const selected = manifest.samples.filter(
    (s) => args.includeSeed || (s.status ?? "annotated") === "annotated",
  );

  if (selected.length === 0) {
    console.log(
      "[eval:golden] 没有可用样本。" +
        (manifest.samples.length > 0
          ? " 现有样本都是 seed（占位示意）；加 --include-seed 可纳入，或把真实标注样本的 status 改为 annotated。"
          : " 请先在 docs/evals/golden/ 添加样本（见该目录 README）。"),
    );
    return;
  }

  const pairs: GoldenScorePair[] = [];
  for (const sample of selected) {
    const bible = await loadBible(sample.bibleFixture);
    const chaptersFile = await readJson<ChaptersFile>(path.join(GOLDEN_DIR, sample.chaptersFile));
    const labelsFile = await readJson<LabelsFile>(path.join(GOLDEN_DIR, sample.labelsFile));

    const chapters: QualityChapterInput[] = chaptersFile.chapters.map((c) => ({
      chapterIndex: c.chapterIndex,
      title: c.title,
      content: c.content,
      outlineSummary: c.outlineSummary,
    }));

    const report = evaluateNovelQuality({ fixtureId: `golden-${sample.id}`, bible, chapters });

    const auto: Partial<Record<GoldenDimension, number>> = {};
    for (const metric of report.metrics) auto[metric.key] = metric.score;
    auto.overall = report.maxScore > 0 ? (report.overallScore / report.maxScore) * 10 : 0;

    pairs.push({ sampleId: sample.id, auto, human: labelsFile.humanScores });
  }

  const result = computeGoldenCorrelation(pairs, { threshold: args.threshold });

  console.log(`\n人工黄金集相关性报告（样本数 ${result.sampleCount}，阈值 Spearman ≥ ${result.threshold}）`);
  console.log("─".repeat(64));
  console.log("维度".padEnd(22) + "n".padEnd(5) + "Spearman".padEnd(12) + "MAE".padEnd(8) + "标记");
  for (const d of result.dimensions) {
    const sp = d.spearman === null ? "n/a" : d.spearman.toFixed(3);
    const flag = d.spearman === null ? "（样本不足/无方差）" : d.belowThreshold ? "⚠️ 偏低" : "ok";
    console.log(d.dimension.padEnd(22) + String(d.n).padEnd(5) + sp.padEnd(12) + d.mae.toFixed(2).padEnd(8) + flag);
  }

  if (result.outliers.length > 0) {
    console.log("\n自动分与人工分差异最大的样本（供复核）：");
    for (const o of result.outliers) {
      console.log(`  - ${o.sampleId} / ${o.dimension}: 自动 ${o.auto.toFixed(1)} vs 人工 ${o.human.toFixed(1)}（差 ${o.gap.toFixed(1)}）`);
    }
  }

  const weak = result.dimensions.filter((d) => d.belowThreshold).map((d) => d.dimension);
  if (weak.length > 0) {
    console.log(`\n⚠️ 以下维度相关性偏低，评分逻辑可能需要调整：${weak.join("、")}`);
  }
  console.log("");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[eval:golden] failed: ${message}`);
  process.exit(1);
});
