import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { BibleDraftSchema, getAllChapters } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function NovelDetailPage({ params }: PageProps) {
  const { id } = await params;

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    notFound();
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: { orderBy: { updated_at: "desc" } },
    },
  });

  if (!novel) notFound();
  if (!canAccessOwnerResource(novel.user_id, userId)) notFound();

  const bibleParse = novel.bible ? BibleDraftSchema.safeParse(novel.bible.content) : null;
  const bibleOk = bibleParse?.success === true;
  const outlineChapters = bibleOk ? getAllChapters(bibleParse.data) : [];
  const totalChapters = outlineChapters.length;
  const savedCount = novel.chapters.length;
  const doneCount = novel.chapters.filter((c) => c.status === "done").length;
  const lastEdited = novel.chapters[0];

  const profile = novel.profile as Record<string, unknown> | null;
  const genreMainMap: Record<string, string> = {
    web: "网文",
    literary: "严肃文学",
    script: "剧本",
    fanfic: "同人",
    shortstory: "短篇集"
  };
  const genreMain = genreMainMap[profile?.genre_main as string] ?? "通用文学";
  const genreSub = (profile?.genre_sub as string | undefined) ?? "";

  const editorHref = lastEdited
    ? `/editor/${novel.id}?chapter=${lastEdited.chapter_index}`
    : `/editor/${novel.id}`;

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-32">
        <PageHeader
          title={novel.title}
          description={`${genreMain}${genreSub ? ` · ${genreSub}` : ""} · 最后活跃 ${new Date().toLocaleDateString()}`}
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: novel.title }
          ]}
          actions={
            <Link href={editorHref} className="btn-primary gap-2 px-6">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {lastEdited ? `继续写作 (第 ${lastEdited.chapter_index} 章)` : "开启首章创作"}
            </Link>
          }
        />

        {/* Progress row */}
        <section className="mt-12 grid gap-6 md:grid-cols-3">
          <StatCard
            label="全书创作进度"
            value={`${savedCount} / ${totalChapters || "—"}`}
            subValue={`目前已完结 ${doneCount} 个正式章节`}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            label="叙事圣经状态"
            value={bibleOk ? "已合成" : "未合成"}
            subValue={bibleOk ? `已规划 ${outlineChapters.length} 章完整大纲` : "尚未执行灵感合成协议"}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
          />
          <StatCard
            label="最近编辑记录"
            value={lastEdited ? `第 ${lastEdited.chapter_index} 章` : "无记录"}
            subValue={lastEdited ? lastEdited.updated_at.toLocaleDateString("zh-CN") : "建议尽快开始首章创作"}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </section>

        {/* Management Grid */}
        <section className="mt-12">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">
            作品管理协议 / INFRASTRUCTURE
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <NavCard
              href={`/novels/${novel.id}/characters`}
              title="角色图谱"
              description={bibleOk ? `${bibleParse.data.characters.length} 位活跃角色` : "需先合成 Bible"}
              icon="characters"
            />
            <NavCard
              href={`/novels/${novel.id}/world`}
              title="世界观规则"
              description={bibleOk ? `${bibleParse.data.world.rules.length} 条物理/社会规则` : "需先合成 Bible"}
              icon="world"
            />
            <NavCard
              href={`/novels/${novel.id}/outline`}
              title="叙事大纲"
              description={bibleOk ? `共规划 ${outlineChapters.length} 个节拍点` : "需先合成 Bible"}
              icon="outline"
            />
             <NavCard
              href={`/novels/${novel.id}/chapters`}
              title="版本管理"
              description={`已同步 ${savedCount} 个云端草稿`}
              icon="chapters"
            />
          </div>
        </section>

        {/* Prominent Action */}
        <section className="mt-8">
           <Link
            href={editorHref}
            className="card bg-text-primary text-white border-text-primary flex items-center justify-between gap-8 group hover:shadow-premium transition-all duration-300"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-2">
                继续您的故事
              </p>
              <h3 className="text-xl font-serif font-bold group-hover:translate-x-1 transition-transform">
                {lastEdited ? `进入编辑器：${lastEdited.title}` : "立即开启第一章"}
              </h3>
              <p className="text-sm opacity-70 mt-2 leading-relaxed">
                {lastEdited 
                   ? `上次您停在了第 ${lastEdited.chapter_index} 章。AI 助手已就绪，随时准备为您提供灵感。` 
                   : "万事开头难，让我们从第一行文字开始构建这个世界。"}
              </p>
            </div>
            <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </Link>
        </section>

        {/* History / Extra */}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
           <section>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">最近编辑的章节</h2>
              {novel.chapters.length === 0 ? (
                <div className="card bg-white/50 border-dashed py-10 text-center">
                   <p className="text-sm text-text-dim italic">暂无创作记录</p>
                </div>
              ) : (
                <div className="card bg-white p-0 overflow-hidden divide-y divide-border-subtle shadow-sm">
                  {novel.chapters.slice(0, 5).map((chapter) => (
                    <Link
                      key={chapter.id}
                      href={`/editor/${novel.id}?chapter=${chapter.chapter_index}`}
                      className="flex items-center gap-4 px-6 py-5 hover:bg-secondary/40 transition-colors group"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-text-dim w-16">
                        U-{String(chapter.chapter_index).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-sm font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                        {chapter.title}
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          chapter.status === "done"
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                            : "bg-secondary text-text-dim border border-border-subtle"
                        }`}
                      >
                        {chapter.status === "done" ? "Done" : "Draft"}
                      </span>
                      <svg className="w-4 h-4 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              )}
           </section>
           
           <section>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">AI 调用历史</h2>
              <Link
                href={`/novels/${novel.id}/history`}
                className="card bg-white hover:border-primary/30 transition-all flex items-center justify-between shadow-sm group"
              >
                 <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-text-secondary group-hover:bg-primary group-hover:text-white transition-all">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                       </svg>
                    </div>
                    <div>
                       <h3 className="text-sm font-bold text-text-primary uppercase tracking-tight">查看完整日志</h3>
                       <p className="text-[11px] text-text-dim uppercase tracking-wider mt-0.5">Audit AI Activity</p>
                    </div>
                 </div>
                 <svg className="w-5 h-5 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                 </svg>
              </Link>
           </section>
        </div>
      </div>
    </div>
  );
}

function NavCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: "characters" | "world" | "outline" | "chapters";
}) {
  const iconPaths: Record<typeof icon, string> = {
    characters:
      "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    world:
      "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    outline:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    chapters:
      "M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4",
  };

  return (
    <Link
      href={href}
      className="group card bg-white transition-all hover:shadow-premium hover:border-primary/20 hover:-translate-y-1 p-6"
    >
      <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4 bg-secondary text-text-dim group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[icon]} />
        </svg>
      </div>
      <h3 className="text-[15px] font-bold text-text-primary mb-1">{title}</h3>
      <p className="text-[11px] text-text-dim font-medium uppercase tracking-tight leading-snug">{description}</p>
    </Link>
  );
}
