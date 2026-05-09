import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { BibleDraftSchema, getAllChapters } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

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
  const genreMain = (profile?.genre_main as string | undefined) ?? "未设定";
  const genreSub = (profile?.genre_sub as string | undefined) ?? "";

  const editorHref = lastEdited
    ? `/editor/${novel.id}?chapter=${lastEdited.chapter_index}`
    : `/editor/${novel.id}`;

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full">
        <PageHeader
          title={novel.title}
          description={`${genreMain}${genreSub ? ` · ${genreSub}` : ""} · 创建于 ${novel.created_at.toLocaleDateString("zh-CN")}`}
          breadcrumb={<Link href="/novels" className="hover:text-text-primary">我的创作书架</Link>}
          actions={
            <Link href={editorHref} className="btn-primary gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {lastEdited ? `继续写作（第 ${lastEdited.chapter_index} 章）` : "进入写作"}
            </Link>
          }
        />

        {/* Progress + status row */}
        <section className="mt-12 grid gap-4 md:grid-cols-3">
          <StatCard
            label="章节进度"
            primary={`${savedCount} / ${totalChapters || "—"}`}
            secondary={`完成 ${doneCount}`}
          />
          <StatCard
            label="作品设定"
            primary={bibleOk ? "已生成" : "未生成"}
            secondary={bibleOk ? `${outlineChapters.length} 章大纲` : "请重新走一遍向导"}
          />
          <StatCard
            label="最近编辑"
            primary={lastEdited ? `第 ${lastEdited.chapter_index} 章` : "尚未编辑"}
            secondary={
              lastEdited
                ? lastEdited.updated_at.toLocaleString("zh-CN")
                : "建议从第 1 章开始"
            }
          />
        </section>

        {/* Quick links */}
        <section className="mt-10">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-4">
            管理这本书
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NavCard
              href={`/novels/${novel.id}/characters`}
              title="角色"
              description={
                bibleOk
                  ? `${bibleParse.data.characters.length} 位角色`
                  : "需先生成 Bible"
              }
              icon="characters"
            />
            <NavCard
              href={`/novels/${novel.id}/world`}
              title="世界观"
              description={
                bibleOk
                  ? `${bibleParse.data.world.rules.length} 条规则`
                  : "需先生成 Bible"
              }
              icon="world"
            />
            <NavCard
              href={`/novels/${novel.id}/outline`}
              title="大纲"
              description={
                bibleOk ? `共 ${outlineChapters.length} 章` : "需先生成 Bible"
              }
              icon="outline"
            />
            <NavCard
              href={editorHref}
              title="进入写作"
              description={lastEdited ? `第 ${lastEdited.chapter_index} 章 · ${lastEdited.title}` : "从第 1 章开始"}
              icon="write"
              accent
            />
          </div>
        </section>

        {/* Recent chapters */}
        {novel.chapters.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-4">
              最近编辑的章节
            </h2>
            <div className="card bg-white divide-y divide-border-subtle p-0 overflow-hidden">
              {novel.chapters.slice(0, 5).map((chapter) => (
                <Link
                  key={chapter.id}
                  href={`/editor/${novel.id}?chapter=${chapter.chapter_index}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted w-16">
                    Unit {String(chapter.chapter_index).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-sm font-medium text-text-primary truncate">
                    {chapter.title}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      chapter.status === "done"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : "bg-secondary text-text-muted border border-border-subtle"
                    }`}
                  >
                    {chapter.status === "done" ? "已完成" : "草稿"}
                  </span>
                  <span className="text-[10px] text-text-muted hidden md:inline">
                    {chapter.updated_at.toLocaleDateString("zh-CN")}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="card bg-white">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">
        {label}
      </p>
      <p className="mt-3 text-2xl font-serif font-bold text-text-primary">{primary}</p>
      <p className="mt-1 text-[12px] text-text-secondary">{secondary}</p>
    </div>
  );
}

function NavCard({
  href,
  title,
  description,
  icon,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  icon: "characters" | "world" | "outline" | "write";
  accent?: boolean;
}) {
  const iconPaths: Record<typeof icon, string> = {
    characters:
      "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    world:
      "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    outline:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    write:
      "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  };

  return (
    <Link
      href={href}
      className={`group card bg-white transition-all hover:shadow-md hover:-translate-y-0.5 ${
        accent ? "border-primary/30 bg-primary/5" : ""
      }`}
    >
      <div
        className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${
          accent
            ? "bg-primary text-white shadow-sm shadow-primary/30"
            : "bg-secondary text-text-secondary group-hover:bg-primary/10 group-hover:text-primary"
        } transition-colors`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[icon]} />
        </svg>
      </div>
      <h3 className="text-base font-bold text-text-primary">{title}</h3>
      <p className="mt-1 text-[12px] text-text-secondary">{description}</p>
    </Link>
  );
}
