import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatDate } from "@/lib/format/datetime";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    redirect("/login");
  }

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
      take: 8,
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

  const recentNovels = [...novels]
    .map((n) => ({
      ...n,
      lastEdit: n.chapters[0]?.updated_at ?? n.created_at,
    }))
    .sort((a, b) => b.lastEdit.getTime() - a.lastEdit.getTime())
    .slice(0, 4);

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
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-24">
        <PageHeader
          title="创作工作台"
          description="欢迎回来。在这里查看您的创作进度、AI 调用统计以及待办任务。"
          actions={
            <Link href="/new" className="btn-primary gap-2 px-6">
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建文学作品
            </Link>
          }
        />

        {/* Suggestion & Quick Stats */}
        <div className="mt-12 grid gap-8 lg:grid-cols-4">
          <div className="lg:col-span-2">
            {suggestion ? (
              <Link
                href={suggestion.href}
                aria-label={`智能建议: ${suggestion.title}. ${suggestion.detail}`}
                className="card bg-text-primary text-white border-text-primary flex items-center justify-between gap-8 h-full group hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.2)] transition-[box-shadow] duration-500"
              >
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-white/10 rounded-md mb-4">
                     <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                     <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-80">
                       智能创作协议 / DIRECTIVE
                     </p>
                  </div>
                  <h3 className="text-2xl font-serif font-bold group-hover:translate-x-1 transition-transform duration-300 leading-tight">
                    {suggestion.title}
                  </h3>
                  <p className="text-sm opacity-60 mt-3 leading-relaxed">
                    {suggestion.detail}
                  </p>
                </div>
                <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition duration-300 group-hover:scale-110">
                  <svg aria-hidden="true" className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
              </Link>
            ) : (
              <div className="card bg-white h-full flex flex-col justify-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim mb-2">
                  当前状态 / STATUS
                </p>
                <h3 className="text-xl font-serif font-bold text-text-primary">渐入佳境</h3>
                <p className="text-sm text-text-muted mt-3">所有的创作任务都已处理完成，准备开启新的篇章吗？</p>
              </div>
            )}
          </div>

          <StatCard
            label="本月 AI 调用"
            value={monthlyUsage._count}
            subValue={`消耗 ${monthlyTokens.toLocaleString()} tokens`}
            icon={
              <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          
          <StatCard
            label="累计预估费用"
            value={`¥${monthlyCost.toFixed(2)}`}
            subValue="按当前模型费率计算"
            icon={
              <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* Main Sections */}
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* Left Column: Projects & Chapters */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <SectionCard 
              title="最近编辑的作品" 
              subtitle="您最近活跃的文学项目"
              actions={
                <Link href="/novels" className="text-[11px] font-bold text-primary hover:underline uppercase tracking-wider">
                  查看全部
                </Link>
              }
            >
              {recentNovels.length === 0 ? (
                <div className="py-20 text-center bg-secondary/10 rounded-2xl border border-dashed border-border-strong flex flex-col items-center gap-6">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 bg-primary/5 rounded-2xl rotate-6" />
                    <div className="absolute inset-0 bg-white border border-border-subtle rounded-2xl flex items-center justify-center shadow-sm -rotate-3 transition-transform group-hover:rotate-0 duration-300">
                      <svg aria-hidden="true" className="w-8 h-8 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  </div>
                  <div className="max-w-xs">
                    <p className="text-sm font-bold text-text-primary mb-1">还没有创作项目</p>
                    <p className="text-xs text-text-muted leading-relaxed">灵感正在酝酿中。点击上方「新建」按钮，开启您的首部 AI 协同小说。</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  {recentNovels.map((n) => (
                    <Link
                      key={n.id}
                      href={`/novels/${n.id}`}
                      className="group p-6 rounded-2xl border border-border-subtle bg-white hover:border-primary/20 hover:shadow-premium transition-[border-color,box-shadow] duration-500 flex flex-col justify-between focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[9px] font-bold text-text-dim uppercase tracking-[0.2em] font-mono">
                            #{n.id.slice(0, 6).toUpperCase()}
                          </span>
                          <span className="text-[10px] text-text-dim tabular-nums">
                            {formatDate(n.lastEdit)}
                          </span>
                        </div>
                        <h4 className="text-lg font-serif font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                          {n.title}
                        </h4>
                      </div>
                      
                      <div className="mt-8">
                        <div className="flex items-center justify-between mb-2.5">
                           <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                              全书进度
                           </span>
                           <span className="text-[10px] font-bold text-primary tabular-nums">
                              {Math.round((n.chapters.filter(c => c.status === 'done').length / (n.chapters.length || 1)) * 100)}%
                           </span>
                        </div>
                        <progress
                          className="progress-bar h-1 w-full"
                          max={n.chapters.length || 1}
                          value={n.chapters.filter((c) => c.status === "done").length}
                          aria-label={`${n.title} 创作进度`}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard 
              title="待继续的章节" 
              subtitle="从上次停下的地方继续"
            >
              {pendingChapters.length === 0 ? (
                <div className="py-8 text-center bg-secondary/10 rounded-xl border border-border-subtle">
                  <p className="text-sm text-text-muted">所有已创建章节均已完成，干得漂亮！</p>
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar -mx-2 px-2">
                  <div className="inline-block min-w-full align-middle">
                    <div className="overflow-hidden rounded-xl border border-border-subtle">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-secondary/50 text-[11px] font-bold text-text-dim uppercase tracking-wider">
                            <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">章节名称</th>
                            <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">所属作品</th>
                            <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">最后更新</th>
                            <th className="px-5 py-3 border-b border-border-subtle"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {pendingChapters.map((c) => (
                            <tr key={c.id} className="hover:bg-secondary/30 transition-colors group">
                              <td className="px-5 py-4 min-w-[200px]">
                                 <div className="flex flex-col">
                                   <span className="font-bold text-text-primary group-hover:text-primary transition-colors">
                                     第 {c.chapter_index} 章 · {c.title}
                                   </span>
                                   <span className="text-[10px] font-medium text-amber-600 uppercase tracking-tighter mt-0.5">
                                     {c.status === 'draft' ? '草稿中' : '起草中'}
                                   </span>
                                 </div>
                              </td>
                              <td className="px-5 py-4 text-text-secondary font-medium whitespace-nowrap">
                                {c.novel_title}
                              </td>
                              <td className="px-5 py-4 text-text-dim text-xs font-medium tabular-nums whitespace-nowrap">
                                {formatDate(c.updated_at)}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <Link
                                  href={`/editor/${c.novel_id}?chapter=${c.chapter_index}`}
                                  aria-label={`继续编辑 ${c.novel_title} 第 ${c.chapter_index} 章`}
                                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border-strong text-text-muted hover:border-primary hover:text-primary hover:bg-white transition focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                  </svg>
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right Column: AI Activity & System Health */}
          <div className="flex flex-col gap-8">
            <SectionCard title="AI 活动记录 / ACTIVITY" subtitle="最近的智能写作调用">
              {generations.length === 0 ? (
                <div className="py-12 text-center bg-secondary/10 rounded-2xl border border-dashed border-border-subtle">
                   <p className="text-sm text-text-dim">尚未生成日志</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {generations.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-border-subtle hover:border-primary/20 transition-colors shadow-sm group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${g.status === "ok" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"}`} />
                        <span className="text-[13px] font-bold text-text-secondary truncate group-hover:text-text-primary transition-colors">{g.agent ?? "AI Assistant"}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-bold text-text-primary tabular-nums">¥{g.cost_cny.toFixed(4)}</p>
                        <p className="text-[9px] font-bold text-text-dim uppercase tracking-tighter mt-0.5 tabular-nums">{g.took_ms != null ? `${(g.took_ms / 1000).toFixed(1)}s` : "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="系统与异常 / HEALTH" subtitle="后台任务运行状态">
              <div className="space-y-6">
                 <div>
                   <dt className="text-[9px] font-bold uppercase tracking-[0.2em] text-text-dim mb-4 px-1">核心异步队列</dt>
                   <dd className={`flex items-center justify-between p-5 rounded-[2rem] border ${ownedFailedJobs.length > 0 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-emerald-50/20 border-emerald-100/50 text-emerald-600 shadow-inner'}`}>
                      <div className="flex items-center gap-3">
                         <div className={`h-2 w-2 rounded-full ${ownedFailedJobs.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                         <span className="text-sm font-bold uppercase tracking-tight">{ownedFailedJobs.length} 个异常任务</span>
                      </div>
                      {ownedFailedJobs.length > 0 && (
                        <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center">
                          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                      )}
                   </dd>
                 </div>

                 {ownedFailedJobs.length > 0 ? (
                   <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100/50">
                     <p className="text-[11px] text-amber-700 leading-relaxed font-bold">
                        PROTOCOL ALERT: 建议进入作品编辑器，通过顶部红色徽章重试失败的任务，以确保叙事逻辑一致性。
                     </p>
                   </div>
                 ) : (
                    <div className="p-5 rounded-2xl bg-secondary/30 border border-border-subtle/50 border-dashed text-center">
                       <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">所有系统协议运行正常</p>
                    </div>
                 )}
              </div>
            </SectionCard>
          </div>
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
      title: "开启您的首个创作项目",
      detail: "通过我们的智能向导，从一个灵感片段开始，在 5 分钟内构建出完整的作品设定集。",
      href: "/new",
    };
  }
  if (input.failedJobs > 0) {
    return {
      title: `处理 ${input.failedJobs} 个待修复的任务`,
      detail: "检测到部分记忆同步任务由于网络原因失败。请进入编辑器进行手动重试以确保一致性。",
      href: input.recentNovel ? `/editor/${input.recentNovel.id}` : "/novels",
    };
  }
  if (input.pendingChapters > 0 && input.recentNovel) {
    return {
      title: `继续打磨《${input.recentNovel.title}》`,
      detail: `您还有 ${input.pendingChapters} 个章节处于草稿阶段。继续编写，让故事走向高潮。`,
      href: `/novels/${input.recentNovel.id}`,
    };
  }
  return null;
}
