import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";

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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建文学作品
            </Link>
          }
        />

        {/* Suggestion & Quick Stats */}
        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-2">
            {suggestion ? (
              <Link
                href={suggestion.href}
                className="card bg-text-primary text-white border-text-primary flex items-center justify-between gap-8 h-full group hover:shadow-premium transition-all duration-300"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-2">
                    智能下一步建议
                  </p>
                  <h3 className="text-xl font-serif font-bold group-hover:translate-x-1 transition-transform">{suggestion.title}</h3>
                  <p className="text-sm opacity-70 mt-2 leading-relaxed">{suggestion.detail}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
              </Link>
            ) : (
              <div className="card bg-white h-full flex flex-col justify-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim mb-2">
                  当前状态
                </p>
                <h3 className="text-xl font-serif font-bold text-text-primary">渐入佳境</h3>
                <p className="text-sm text-text-muted mt-2">所有的创作任务都已处理完成，准备开启新的篇章吗？</p>
              </div>
            )}
          </div>

          <StatCard
            label="本月 AI 调用"
            value={monthlyUsage._count}
            subValue={`消耗 ${monthlyTokens.toLocaleString()} tokens`}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          
          <StatCard
            label="累计预估费用"
            value={`¥${monthlyCost.toFixed(2)}`}
            subValue="按当前模型费率计算"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="py-12 text-center bg-secondary/20 rounded-2xl border border-dashed border-border-strong">
                  <p className="text-sm text-text-dim">还没有作品。点击上方「新建」开始创作。</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {recentNovels.map((n) => (
                    <Link
                      key={n.id}
                      href={`/novels/${n.id}`}
                      className="group p-5 rounded-2xl border border-border-subtle hover:border-border-strong hover:bg-secondary/50 transition-all"
                    >
                      <p className="text-base font-bold text-text-primary truncate group-hover:text-primary transition-colors">{n.title}</p>
                      <div className="flex items-center gap-3 mt-3">
                        <progress
                          className="progress-bar h-1 flex-1"
                          max={n.chapters.length}
                          value={n.chapters.filter((c) => c.status === "done").length}
                          aria-label={`${n.title} 创作进度`}
                        />
                        <span className="text-[11px] font-bold text-text-muted">
                          {n.chapters.filter((c) => c.status === "done").length}/{n.chapters.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-dim mt-4 uppercase tracking-wider">
                        最后编辑：{n.lastEdit.toLocaleDateString("zh-CN")}
                      </p>
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
                  <p className="text-sm text-text-muted italic">所有已创建章节均已完成，干得漂亮！</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border-subtle">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-secondary/50 text-[11px] font-bold text-text-dim uppercase tracking-wider">
                        <th className="px-5 py-3 border-b border-border-subtle">章节名称</th>
                        <th className="px-5 py-3 border-b border-border-subtle">所属作品</th>
                        <th className="px-5 py-3 border-b border-border-subtle">最后更新</th>
                        <th className="px-5 py-3 border-b border-border-subtle"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {pendingChapters.map((c) => (
                        <tr key={c.id} className="hover:bg-secondary/30 transition-colors group">
                          <td className="px-5 py-4">
                             <div className="flex flex-col">
                               <span className="font-bold text-text-primary group-hover:text-primary transition-colors">
                                 第 {c.chapter_index} 章 · {c.title}
                               </span>
                               <span className="text-[10px] font-medium text-amber-600 uppercase tracking-tighter mt-0.5">
                                 {c.status === 'draft' ? '草稿中' : '起草中'}
                               </span>
                             </div>
                          </td>
                          <td className="px-5 py-4 text-text-secondary font-medium">
                            {c.novel_title}
                          </td>
                          <td className="px-5 py-4 text-text-dim text-xs font-medium">
                            {c.updated_at.toLocaleDateString("zh-CN")}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link
                              href={`/editor/${c.novel_id}?chapter=${c.chapter_index}`}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border-strong text-text-muted hover:border-primary hover:text-primary hover:bg-white transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right Column: AI Activity & System Health */}
          <div className="flex flex-col gap-8">
            <SectionCard title="AI 活动记录" subtitle="最近的智能写作调用">
              {generations.length === 0 ? (
                <p className="text-sm text-text-dim italic">还没有 AI 调用记录</p>
              ) : (
                <div className="space-y-4">
                  {generations.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border-subtle/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${g.status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="text-[13px] font-bold text-text-secondary truncate">{g.agent ?? "AI Assistant"}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-bold text-text-primary">¥{g.cost_cny.toFixed(4)}</p>
                        <p className="text-[10px] text-text-dim mt-0.5">{g.took_ms != null ? `${(g.took_ms / 1000).toFixed(1)}s` : "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="异常与任务" subtitle="后台任务运行状态">
              <div className="space-y-6">
                 <div>
                   <dt className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-3">失败的记忆任务</dt>
                   <dd className={`flex items-center justify-between p-4 rounded-2xl border ${ownedFailedJobs.length > 0 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-emerald-50/30 border-emerald-100 text-emerald-600'}`}>
                      <span className="text-sm font-bold">{ownedFailedJobs.length} 个异常</span>
                      {ownedFailedJobs.length > 0 && (
                        <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                      )}
                   </dd>
                 </div>

                 {ownedFailedJobs.length > 0 && (
                   <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                     <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                        提示：进入作品后在编辑器顶部点击红色徽章可查看详情并重试失败的任务。
                     </p>
                   </div>
                 )}

                 {/* P1-12: the old "100% Online" 24-bar uptime strip was
                     hardcoded — no underlying probe history table, no
                     scrape job, no truthful source. Better to show nothing
                     than to imply an SLO we aren't measuring. When we add
                     a real uptime backend (Sentry / external probe with
                     persisted samples), this slot can come back with the
                     same SectionCard layout. */}
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
