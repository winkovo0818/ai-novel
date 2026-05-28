import Link from "next/link";

import { NoBible } from "@/components/ui/NoBible";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format/datetime";
import {
  buildStoryTimeline,
  type StoryTimelineEvent,
  type StoryTimelineEventKind,
} from "@/lib/novels/timeline";
import { loadNovelBible } from "@/lib/loaders/novelBible";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

const KIND_STYLES: Record<StoryTimelineEventKind, string> = {
  outline: "border-slate-200 bg-slate-50 text-slate-700",
  draft: "border-emerald-200 bg-emerald-50 text-emerald-700",
  story: "border-sky-200 bg-sky-50 text-sky-700",
  plot_thread: "border-amber-200 bg-amber-50 text-amber-800",
  foreshadowing: "border-rose-200 bg-rose-50 text-rose-700",
  relationship: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

const STATUS_LABELS: Record<string, string> = {
  done: "已完成",
  draft: "草稿",
  open: "未解决",
  progressing: "推进中",
  resolved: "已回收",
  planted: "已埋设",
  reinforced: "已强化",
  revealed: "已揭示",
};

export default async function TimelinePage({ params }: PageProps) {
  const { id } = await params;
  const { novel, bible } = await loadNovelBible(id);

  if (!bible) {
    return <NoBible novelId={novel.id} title={novel.title} hint="查看故事时间线" />;
  }

  const drafts = await prisma.chapterDraft.findMany({
    where: { novel_id: id },
    orderBy: { chapter_index: "asc" },
    select: {
      chapter_index: true,
      title: true,
      content: true,
      status: true,
      updated_at: true,
    },
  });
  const timeline = buildStoryTimeline(bible, drafts);

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="mx-auto min-h-full max-w-7xl p-8 pb-24 md:p-12 lg:p-16">
        <PageHeader
          title="故事时间线"
          description={`${novel.title} · 按章节查看大纲、正文进度、事件、伏笔和关系变化`}
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: novel.title, href: `/novels/${novel.id}` },
            { label: "故事时间线" },
          ]}
          actions={
            <Link href={`/editor/${novel.id}`} className="btn-primary gap-2">
              进入写作
            </Link>
          }
        />

        <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TimelineStat label="计划章节" value={timeline.summary.plannedChapters} />
          <TimelineStat label="已写章节" value={timeline.summary.draftedChapters} />
          <TimelineStat label="已记录事件" value={timeline.summary.storyEvents} />
          <TimelineStat label="活跃线索" value={timeline.summary.openThreads} />
          <TimelineStat label="未回收伏笔" value={timeline.summary.unresolvedForeshadowing} />
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          <main className="space-y-5">
            {timeline.chapters.map((chapter) => (
              <article
                key={chapter.chapterIndex}
                className="rounded-lg border border-border-subtle bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim">
                      Chapter {String(chapter.chapterIndex).padStart(2, "0")}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-text-primary">
                      {chapter.draftTitle ?? chapter.title}
                    </h2>
                    {chapter.outlineSummary ? (
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-text-secondary">
                        {chapter.outlineSummary}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] font-bold">
                    <span className="rounded border border-border-subtle bg-secondary px-2 py-1 text-text-muted">
                      {chapter.wordCount > 0 ? `${chapter.wordCount} 字` : "未起草"}
                    </span>
                    {chapter.draftStatus ? (
                      <span className="rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-700">
                        {STATUS_LABELS[chapter.draftStatus] ?? chapter.draftStatus}
                      </span>
                    ) : null}
                    {chapter.updatedAt ? (
                      <span className="rounded border border-border-subtle bg-white px-2 py-1 text-text-dim">
                        {formatDate(chapter.updatedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {chapter.events.map((event) => (
                    <TimelineEventCard key={event.id} event={event} />
                  ))}
                </div>
              </article>
            ))}
          </main>

          <aside className="space-y-5">
            <section className="rounded-lg border border-border-subtle bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-text-primary">未定位记录</h2>
              <p className="mt-1 text-[12px] leading-6 text-text-muted">
                这些线索或伏笔还没有章节位置，后续采纳 State Diff 时可以补上引入或回收章节。
              </p>
              <div className="mt-4 space-y-3">
                {timeline.unplaced.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border-subtle bg-secondary/40 px-3 py-4 text-center text-[12px] text-text-dim">
                    暂无未定位记录
                  </p>
                ) : (
                  timeline.unplaced.map((event) => (
                    <TimelineEventCard key={event.id} event={event} compact />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border-subtle bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-text-primary">写作检查点</h2>
              <ul className="mt-4 space-y-3 text-[12px] leading-6 text-text-secondary">
                <li>每章完成后，运行状态分析并采纳可信的时间线事件。</li>
                <li>伏笔埋设后尽量补充回收提示，避免长篇后段遗忘。</li>
                <li>关系变化最好绑定章节，方便回看人物转折是否自然。</li>
              </ul>
              <Link
                href={`/novels/${novel.id}/memories`}
                className="mt-5 inline-flex text-[12px] font-bold text-primary hover:underline"
              >
                查看记忆库
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TimelineStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">{label}</p>
      <p className="mt-1 text-2xl font-serif font-bold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function TimelineEventCard({ event, compact = false }: { event: StoryTimelineEvent; compact?: boolean }) {
  const style = KIND_STYLES[event.kind];
  const status = event.status ? STATUS_LABELS[event.status] ?? event.status : undefined;
  return (
    <div className={`rounded-lg border border-border-subtle bg-secondary/20 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${style}`}>
            {event.label}
          </span>
          <h3 className="mt-2 text-sm font-bold leading-6 text-text-primary">{event.title}</h3>
        </div>
        {status ? (
          <span className="rounded border border-border-subtle bg-white px-2 py-0.5 text-[10px] font-bold text-text-muted">
            {status}
          </span>
        ) : null}
      </div>
      {event.description ? (
        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
          {event.description}
        </p>
      ) : null}
    </div>
  );
}
