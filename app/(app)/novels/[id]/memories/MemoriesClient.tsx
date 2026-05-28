"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/StatusStates";
import type {
  MemoryFreshness,
  MemoryLibraryFilterType,
  MemoryLibraryPreview,
} from "@/lib/agent/contracts";
import { MEMORY_LIBRARY_FILTER_TYPES } from "@/lib/agent/memoryLibrary";

interface MemoriesClientProps {
  novelId: string;
  title: string;
  data: MemoryLibraryPreview;
  breadcrumb: { label: string; href?: string }[];
}

const FILTER_LABELS: Record<MemoryLibraryFilterType, string> = {
  all: "全部",
  chapter_summary: "章节摘要",
  volume_summary: "卷摘要",
  novel_summary: "全书摘要",
  memory_chunk: "记忆片段",
  scene: "场景",
  dialogue: "对白",
  character_fact: "人物",
  world_rule: "规则",
  plot_thread: "线索",
  summary: "摘要片段",
};

export function MemoriesClient({ novelId, title, data, breadcrumb }: MemoriesClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [type, setType] = useState<MemoryLibraryFilterType>(data.filters.type);
  const [chapterIndex, setChapterIndex] = useState<string>(String(data.filters.chapterIndex ?? ""));
  const totals = [
    { label: "章节摘要", value: data.chapterSummaries.length },
    { label: "卷摘要", value: data.volumeSummaries.length },
    { label: "记忆片段", value: data.memoryChunks.pagination.total },
    { label: "待刷新", value: data.freshness.staleSummaryCount + data.freshness.staleIndexCount },
  ];

  const updateUrl = (nextType = type, nextChapterIndex = chapterIndex) => {
    const params = new URLSearchParams();
    if (nextType !== "all") params.set("type", nextType);
    const parsed = Number(nextChapterIndex);
    if (Number.isInteger(parsed) && parsed > 0) params.set("chapter_index", String(parsed));
    const query = params.toString();
    startTransition(() => router.replace(`/novels/${novelId}/memories${query ? `?${query}` : ""}`));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-24">
        <PageHeader
          title="记忆库"
          description={`${title} · 摘要、分层梗概与 RAG 片段`}
          breadcrumb={breadcrumb}
          actions={
            <Link href={`/editor/${novelId}`} className="btn-primary gap-2">
              进入写作
            </Link>
          }
        />

        <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {totals.map((item) => (
            <div key={item.label} className="rounded-lg border border-border-subtle bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">{item.label}</p>
              <p className="mt-1 text-2xl font-serif font-bold text-text-primary tabular-nums">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 flex flex-wrap items-center gap-2 border-b border-border-strong/30 pb-3">
          {MEMORY_LIBRARY_FILTER_TYPES.map((item) => (
            <button
              key={item}
              onClick={() => {
                setType(item);
                updateUrl(item);
              }}
              className={`px-3 py-1.5 text-[12px] font-bold rounded-lg transition-colors ${
                type === item ? "bg-text-primary text-white" : "text-text-secondary hover:bg-secondary"
              }`}
            >
              {FILTER_LABELS[item]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={chapterIndex}
              onChange={(event) => setChapterIndex(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") updateUrl();
              }}
              placeholder="章节"
              className="w-24 rounded-lg border border-border-strong bg-white px-3 py-1.5 text-[12px] font-bold text-text-primary outline-none focus:border-primary"
              aria-label="按章节筛选"
            />
            <button onClick={() => updateUrl()} className="btn-secondary px-3 py-1.5 text-[12px]">
              筛选
            </button>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <main className="space-y-8">
            {data.novelSummary && (
              <MemorySection title="全书摘要">
                <MemoryBlock title="全书梗概" meta={formatDate(data.novelSummary.updatedAt)}>
                  {data.novelSummary.summary}
                </MemoryBlock>
              </MemorySection>
            )}

            {data.volumeSummaries.length > 0 && (
              <MemorySection title="卷摘要">
                {data.volumeSummaries.map((summary) => (
                  <MemoryBlock
                    key={summary.id}
                    title={`第 ${summary.volumeIndex} 卷`}
                    meta={`覆盖章节 ${summary.coveredChapters.join(", ")} · ${formatDate(summary.updatedAt)}`}
                  >
                    {summary.summary}
                  </MemoryBlock>
                ))}
              </MemorySection>
            )}

            {data.chapterSummaries.length > 0 && (
              <MemorySection title="章节摘要">
                {data.chapterSummaries.map((summary) => (
                  <MemoryBlock
                    key={summary.id}
                    title={`第 ${summary.chapterIndex} 章 · ${summary.title}`}
                    meta={`${freshnessLabel(summary.freshness)} · ${formatDate(summary.updatedAt)}`}
                  >
                    {summary.summary}
                  </MemoryBlock>
                ))}
              </MemorySection>
            )}

            {data.memoryChunks.items.length > 0 && (
              <MemorySection title="记忆片段">
                {data.memoryChunks.items.map((chunk) => (
                  <MemoryBlock
                    key={chunk.id}
                    title={`${FILTER_LABELS[chunk.type as MemoryLibraryFilterType] ?? chunk.type}${chunk.chapterIndex ? ` · 第 ${chunk.chapterIndex} 章` : ""}`}
                    meta={[
                      chunk.chapterTitle ?? "未关联章节",
                      `重要性 ${chunk.importance.toFixed(2)}`,
                      chunk.lastUsedAt ? `最近命中 ${formatDate(chunk.lastUsedAt)}` : "未被命中",
                      chunk.sourceKind,
                      formatDate(chunk.updatedAt),
                    ].join(" · ")}
                  >
                    {chunk.text}
                  </MemoryBlock>
                ))}
                <div className="flex items-center justify-between text-[12px] text-text-muted">
                  <span>
                    第 {data.memoryChunks.pagination.page} / {data.memoryChunks.pagination.totalPages} 页
                  </span>
                  <span>共 {data.memoryChunks.pagination.total} 条片段</span>
                </div>
              </MemorySection>
            )}

            {!data.novelSummary && data.volumeSummaries.length === 0 && data.chapterSummaries.length === 0 && data.memoryChunks.items.length === 0 && (
              <EmptyState
                title="暂无记忆数据"
                description="保存章节后刷新摘要和索引，记忆库会显示可被 AI 调用的上下文。"
                action={<Link className="btn-primary" href={`/novels/${novelId}/chapters`}>查看章节状态</Link>}
              />
            )}
          </main>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border-subtle bg-white p-5 shadow-sm">
              <h2 className="text-[12px] font-bold text-text-primary">Freshness</h2>
              <div className="mt-4 space-y-3">
                {data.freshness.chapters.slice(0, 12).map((chapter) => (
                  <div key={chapter.chapterId} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="truncate text-text-secondary">第 {chapter.chapterIndex} 章</span>
                    <span className="flex items-center gap-1">
                      <FreshnessPill label="摘要" value={chapter.summaryFreshness} />
                      <FreshnessPill label="索引" value={chapter.indexFreshness} />
                    </span>
                  </div>
                ))}
              </div>
              <Link href={`/novels/${novelId}/chapters?filter=needsRefresh`} className="mt-5 inline-flex text-[12px] font-bold text-primary hover:underline">
                刷新待更新章节
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MemorySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function MemoryBlock({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-border-subtle bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
        <span className="text-[11px] text-text-muted">{meta}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-secondary">{children}</p>
    </article>
  );
}

function FreshnessPill({ label, value }: { label: string; value: MemoryFreshness }) {
  const styles: Record<MemoryFreshness, string> = {
    fresh: "border-emerald-100 bg-emerald-50 text-emerald-700",
    stale: "border-amber-100 bg-amber-50 text-amber-700",
    missing: "border-border-subtle bg-secondary text-text-muted",
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${styles[value]}`}>
      {label}{freshnessLabel(value)}
    </span>
  );
}

function freshnessLabel(value: MemoryFreshness) {
  if (value === "fresh") return "新鲜";
  if (value === "stale") return "待刷新";
  return "缺失";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
}
