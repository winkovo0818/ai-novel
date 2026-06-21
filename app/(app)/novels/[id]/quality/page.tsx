import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeQualityTrend } from "@/lib/evals/qualityTrend";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/StatusStates";
import { BibleDraftSchema, getAllChapters } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/* ------------------------------------------------------------------ */
/*  Data fetching                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Dimension labels                                                    */
/* ------------------------------------------------------------------ */

const DIM_LABELS: Record<string, string> = {
  continuity: "连贯性",
  logic: "逻辑",
  character_consistency: "角色一致",
  plot_progress: "情节推进",
  world_rules: "世界观",
  ai_voice: "AI腔",
  prose_readability: "文笔",
};

const DIM_ORDER = [
  "plot_progress",
  "continuity",
  "logic",
  "ai_voice",
  "world_rules",
  "character_consistency",
  "prose_readability",
];

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function scoreColor(pct: number): string {
  if (pct >= 85) return "bg-emerald-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function trendIcon(trend: string): string {
  if (trend === "improving") return "↑ 上升";
  if (trend === "declining") return "↓ 下降";
  return "→ 持平";
}

function trendColor(trend: string): string {
  if (trend === "improving") return "text-emerald-600";
  if (trend === "declining") return "text-red-500";
  return "text-text-dim";
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */


export default async function QualityPage({ params }: Props) {
  const { id } = await params;

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: { bible: true, chapters: { where: { status: "done" }, orderBy: { chapter_index: "asc" } } },
  });

  if (!novel) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <EmptyState title="作品未找到" description="该作品可能已被删除。" />
      </div>
    );
  }

  const bibleOk = BibleDraftSchema.safeParse(novel.bible?.content);
  const totalChapters = bibleOk.success ? getAllChapters(bibleOk.data).length : 0;

  const trend = await computeQualityTrend(id);

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-32">
        <PageHeader
          title="写作质量"
          description={`${novel.title} · ${totalChapters} 章大纲 · ${novel.chapters.length} 章已完成`}
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: novel.title, href: `/novels/${id}` },
            { label: "写作质量" },
          ]}
          actions={
            <Link href={`/novels/${id}`} className="btn-secondary gap-2">
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回作品
            </Link>
          }
        />

        {!trend || trend.coldStart ? (
          <div className="mt-12 card bg-white/80">
            <EmptyState
              title={trend?.message ?? "暂无可分析的数据"}
              description="至少 3 个已完成的章节才能生成趋势分析。"
              icon={
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
                  <svg aria-hidden="true" className="w-8 h-8 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              }
            />
          </div>
        ) : (
          <>
            {/* ---- Summary ---- */}
            <section className="mt-12 grid gap-6 md:grid-cols-4">
              <div className="card bg-white/80 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">综合平均</p>
                <p className="text-4xl font-serif font-bold text-text-primary">{trend.summary.overallAvg}%</p>
                <p className="text-[11px] text-text-dim mt-1">{trend.totalWindows} 个滑窗</p>
              </div>
              <div className="card bg-white/80 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">趋势</p>
                <p className={`text-2xl font-serif font-bold ${trendColor(trend.summary.trend)}`}>
                  {trendIcon(trend.summary.trend)}
                </p>
                <p className="text-[11px] text-text-dim mt-1">
                  前半 {trend.summary.firstHalfAvg}% · 后半 {trend.summary.secondHalfAvg}%
                </p>
              </div>
              <div className="card bg-white/80 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">最佳章节</p>
                <p className="text-2xl font-serif font-bold text-emerald-600">
                  第 {trend.summary.bestChapter.index} 章
                </p>
                <p className="text-[11px] text-text-dim mt-1 truncate">{trend.summary.bestChapter.title} · {trend.summary.bestChapter.score}%</p>
              </div>
              <div className="card bg-white/80 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">最弱章节</p>
                <p className="text-2xl font-serif font-bold text-amber-600">
                  第 {trend.summary.worstChapter.index} 章
                </p>
                <p className="text-[11px] text-text-dim mt-1 truncate">{trend.summary.worstChapter.title} · {trend.summary.worstChapter.score}%</p>
              </div>
            </section>

            {/* ---- Risk flags ---- */}
            {trend.riskFlags.length > 0 && (
              <section className="mt-8">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-4">
                  ⚠ {trend.riskFlags.length} 个风险标记
                </h3>
                <div className="space-y-2">
                  {trend.riskFlags.map((flag, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-100 rounded-2xl">
                      <span className="text-xs font-bold text-amber-700 uppercase">
                        {DIM_LABELS[flag.dimension] ?? flag.dimension}
                      </span>
                      <span className="text-xs text-amber-600">
                        第 {flag.chapters[0]}-{flag.chapters[1]} 章
                      </span>
                      <span className="text-xs text-amber-500 ml-auto">{flag.message}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ---- Overall trend chart ---- */}
            <section className="mt-12">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">综合评分趋势</h3>
              <div className="card bg-white/80 overflow-x-auto">
                <div className="flex items-end gap-1 min-h-[200px] px-2 pt-8">
                  {trend.windows.map((w) => (
                    <div key={w.chapterIndex} className="flex-1 min-w-[24px] flex flex-col items-center group relative">
                      <span className="text-[9px] font-bold text-text-dim mb-1 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                        {w.scorePct}%
                      </span>
                      <div
                        className={`w-full rounded-t-md transition-all duration-300 group-hover:brightness-110 ${scoreColor(w.scorePct)}`}
                        style={{ height: `${Math.max(4, w.scorePct)}px` }}
                        title={`第 ${w.chapterIndex} 章 · ${w.title} · ${w.scorePct}%`}
                      />
                      <span className="text-[9px] text-text-dim mt-2 tabular-nums">{w.chapterIndex}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between px-2 pb-4">
                  <span className="text-[9px] text-text-dim">章 3</span>
                  <span className="text-[9px] text-text-dim">第 {trend.windows[trend.windows.length - 1]?.chapterIndex} 章</span>
                </div>
              </div>
            </section>

            {/* ---- Per-dimension bars ---- */}
            <section className="mt-12">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">各维度平均分</h3>
              <div className="space-y-4">
                {DIM_ORDER.filter((k) => trend.dimensionAvgs[k] != null).map((key) => (
                  <div key={key} className="card bg-white/80 p-5 flex items-center gap-4">
                    <span className="text-[11px] font-bold text-text-secondary w-20 shrink-0">
                      {DIM_LABELS[key] ?? key}
                    </span>
                    <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${scoreColor(trend.dimensionAvgs[key])}`}
                        style={{ width: `${Math.max(4, trend.dimensionAvgs[key])}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-text-primary w-12 text-right">
                      {trend.dimensionAvgs[key]}%
                    </span>
                  </div>
                ))}
              </div>
            </section >
          </>
        )}
      </div>
    </div>
  );
}
