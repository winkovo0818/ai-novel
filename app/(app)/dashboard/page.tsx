import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    redirect("/login");
  }

  // One round-trip per data box, all in parallel — keeps p95 under a single
  // pool RTT.
  const userNovelIds = await prisma.novel
    .findMany({ where: { user_id: userId }, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));

  const [novels, generations, ownedFailedJobs, monthlyUsage] = await Promise.all([
    prisma.novel.findMany({
      where: { user_id: userId },
      include: {
        chapters: {
          select: { id: true, chapter_index: true, title: true, status: true, updated_at: true },
          orderBy: { updated_at: "desc" },
        },
      },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
    prisma.llmUsage.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 5,
    }),
    userNovelIds.length === 0
      ? Promise.resolve([])
      : prisma.backgroundJob.findMany({
          where: { status: "failed", novel_id: { in: userNovelIds } },
          orderBy: { created_at: "desc" },
          take: 20,
        }),
    prisma.llmUsage.aggregate({
      where: {
        user_id: userId,
        created_at: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { token_in: true, token_out: true, cost_cny: true },
      _count: true,
    }),
  ]);

  // Recently edited: top 3 novels with most-recent chapter updated_at.
  const recentNovels = [...novels]
    .map((n) => ({
      ...n,
      lastEdit: n.chapters[0]?.updated_at ?? n.created_at,
    }))
    .sort((a, b) => b.lastEdit.getTime() - a.lastEdit.getTime())
    .slice(0, 3);

  // Chapters waiting to be drafted or finished — across the user's library.
  const pendingChapters = novels
    .flatMap((n) =>
      n.chapters
        .filter((c) => c.status !== "done")
        .map((c) => ({ novel_id: n.id, novel_title: n.title, ...c })),
    )
    .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
    .slice(0, 5);

  const suggestion = nextStepSuggestion({
    novels: novels.length,
    failedJobs: ownedFailedJobs.length,
    pendingChapters: pendingChapters.length,
    recentNovel: recentNovels[0],
  });

  const monthlyCost = monthlyUsage._sum.cost_cny ?? 0;
  const monthlyTokens = (monthlyUsage._sum.token_in ?? 0) + (monthlyUsage._sum.token_out ?? 0);

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full pb-12">
        <PageHeader
          title="工作台"
          description={
            novels.length === 0
              ? "你还没有作品。从书架新建一个项目开始。"
              : `${novels.length} 个作品 · 本月调用 ${monthlyUsage._count} 次 · 累计 ¥${monthlyCost.toFixed(2)}`
          }
          actions={
            <Link href="/new" className="btn-primary gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建作品
            </Link>
          }
        />

        {/* Next step suggestion */}
        {suggestion && (
          <section className="mt-10">
            <Link
              href={suggestion.href}
              className="card bg-primary text-white border-primary flex items-center justify-between gap-6 hover:bg-primary/90 transition-colors"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mb-1">
                  下一步建议
                </p>
                <h3 className="text-lg font-serif font-bold">{suggestion.title}</h3>
                <p className="text-[13px] opacity-90 mt-1">{suggestion.detail}</p>
              </div>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </section>
        )}

        {/* Two-column layout */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* Recent novels */}
          <section className="card bg-white">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-4">
              最近编辑
            </h3>
            {recentNovels.length === 0 ? (
              <p className="text-sm text-text-muted">还没有作品</p>
            ) : (
              <ul className="space-y-3">
                {recentNovels.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/novels/${n.id}`}
                      className="block hover:bg-secondary rounded-md px-3 py-2 -mx-3"
                    >
                      <p className="text-sm font-bold text-text-primary truncate">{n.title}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {n.chapters.filter((c) => c.status === "done").length} / {n.chapters.length} 章完成
                        {" · "}
                        {n.lastEdit.toLocaleDateString("zh-CN")}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pending chapters */}
          <section className="card bg-white">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-4">
              待继续的章节
            </h3>
            {pendingChapters.length === 0 ? (
              <p className="text-sm text-text-muted">所有已起草章节都已完成</p>
            ) : (
              <ul className="space-y-2">
                {pendingChapters.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/editor/${c.novel_id}?chapter=${c.chapter_index}`}
                      className="flex items-center justify-between gap-3 hover:bg-secondary rounded-md px-3 py-2 -mx-3"
                    >
                      <span className="text-sm text-text-primary truncate">
                        <span className="text-text-muted">第 {c.chapter_index} 章 · </span>
                        {c.title}
                      </span>
                      <span className="text-[10px] text-text-muted whitespace-nowrap">
                        {c.novel_title.slice(0, 8)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent generations */}
          <section className="card bg-white">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-4">
              最近 AI 调用
            </h3>
            {generations.length === 0 ? (
              <p className="text-sm text-text-muted">还没有 AI 调用记录</p>
            ) : (
              <ul className="space-y-2">
                {generations.map((g) => (
                  <li key={g.id} className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          g.status === "ok" ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-text-secondary truncate">{g.agent ?? "unknown"}</span>
                    </span>
                    <span className="text-text-muted whitespace-nowrap">
                      {g.took_ms != null ? `${(g.took_ms / 1000).toFixed(1)}s` : "—"}
                      {" · "}¥{g.cost_cny.toFixed(4)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Usage + failed jobs */}
          <section className="card bg-white">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-4">
              本月用量与异常
            </h3>
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">调用次数</dt>
                <dd className="text-2xl font-serif font-bold text-text-primary mt-1">
                  {monthlyUsage._count}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">累计费用</dt>
                <dd className="text-2xl font-serif font-bold text-text-primary mt-1">
                  ¥{monthlyCost.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">Token</dt>
                <dd className="text-sm text-text-secondary mt-1">
                  {monthlyTokens.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">失败任务</dt>
                <dd
                  className={`text-sm mt-1 ${
                    ownedFailedJobs.length > 0 ? "text-red-600 font-bold" : "text-text-secondary"
                  }`}
                >
                  {ownedFailedJobs.length}
                </dd>
              </div>
            </dl>
            {ownedFailedJobs.length > 0 && (
              <p className="mt-4 text-[11px] text-text-muted">
                进入项目后在编辑器顶部点击红色徽章可查看与重试
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

interface SuggestionInput {
  novels: number;
  failedJobs: number;
  pendingChapters: number;
  recentNovel?: { id: string; title: string };
}

function nextStepSuggestion(input: SuggestionInput): { title: string; detail: string; href: string } | null {
  if (input.novels === 0) {
    return {
      title: "创建第一本书",
      detail: "5 步向导带你从灵感到完整 Bible 草稿",
      href: "/new",
    };
  }
  if (input.failedJobs > 0) {
    return {
      title: `处理 ${input.failedJobs} 个失败的记忆任务`,
      detail: "进入项目编辑器，在顶部点击红色徽章重试",
      href: input.recentNovel ? `/editor/${input.recentNovel.id}` : "/novels",
    };
  }
  if (input.pendingChapters > 0 && input.recentNovel) {
    return {
      title: `继续编写《${input.recentNovel.title}》`,
      detail: `还有 ${input.pendingChapters} 章在草稿状态`,
      href: `/novels/${input.recentNovel.id}/chapters`,
    };
  }
  return null;
}
