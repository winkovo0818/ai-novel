import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { BibleDraftSchema, getAllChapters } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

import { ExportCenterClient } from "./ExportCenterClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function ExportCenterPage({ params }: PageProps) {
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
      chapters: { orderBy: { chapter_index: "asc" } },
    },
  });
  if (!novel) notFound();
  if (!canAccessOwnerResource(novel.user_id, userId)) notFound();

  const bibleParse = novel.bible ? BibleDraftSchema.safeParse(novel.bible.content) : null;
  const outlineChapters = bibleParse?.success ? getAllChapters(bibleParse.data) : [];
  const totalChapters = outlineChapters.length;
  const draftedCount = novel.chapters.length;
  const doneCount = novel.chapters.filter((c) => c.status === "done").length;
  // Whitespace-stripped count matches the wordcount shown on the chapters page.
  const totalWords = novel.chapters.reduce(
    (acc, c) => acc + c.content.replace(/\s/g, "").length,
    0,
  );

  const lastEditedAt = novel.chapters.reduce<Date | null>((acc, c) => {
    if (!acc || c.updated_at > acc) return c.updated_at;
    return acc;
  }, null);

  const hasContent = totalWords > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-32">
        <PageHeader
          title="导出中心"
          description={`将《${novel.title}》打包为 4 种主流格式 · 已起草 ${draftedCount} 个章节`}
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: novel.title, href: `/novels/${novel.id}` },
            { label: "导出中心" },
          ]}
        />

        <section className="mt-12 grid gap-6 md:grid-cols-3">
          <StatCard
            label="已起草章节"
            value={`${draftedCount}${totalChapters ? ` / ${totalChapters}` : ""}`}
            subValue={
              totalChapters
                ? `共规划 ${totalChapters} 章，已起草 ${draftedCount} 章`
                : "尚未生成大纲"
            }
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="累计正文字数"
            value={totalWords.toLocaleString("zh-CN")}
            subValue={hasContent ? "已统计所有章节" : "暂无可导出的正文"}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            }
          />
          <StatCard
            label="最近编辑"
            value={lastEditedAt ? lastEditedAt.toLocaleDateString("zh-CN") : "无记录"}
            subValue={
              lastEditedAt
                ? `${doneCount} 个章节已标记完结`
                : "建议先在编辑器写一章再来导出"
            }
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </section>

        <section className="mt-12">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">
            选择导出格式 / EXPORT FORMATS
          </h2>
          {!hasContent && (
            <div className="card bg-amber-50 border-amber-200 mb-6">
              <p className="text-sm text-amber-700">
                当前作品还没有任何正文，导出会生成空文档。建议先在编辑器中写入至少一章。
              </p>
            </div>
          )}
          <ExportCenterClient novelId={novel.id} disabled={!hasContent} />
        </section>

        <section className="mt-12 card bg-white">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-4">
            导出说明 / NOTES
          </h2>
          <ul className="space-y-2 text-sm text-text-muted leading-relaxed list-disc pl-5">
            <li>
              所有格式都会按章节顺序拼接，标题与正文之间保留一个空行。
            </li>
            <li>
              章节范围可留空导出全书，也可输入单章、区间或逗号组合，例如 3、1-10、1,3,5-8。
            </li>
            <li>
              勾选「附带作品 Bible」会把角色、世界、章节大纲与当前故事状态作为附录加入导出文件。
            </li>
            <li>
              EPUB / DOCX 会保留章节硬换行；Markdown / TXT 直接输出原始字符。
            </li>
            <li>
              下载前会做一次审核检查，若全文含违规内容会被拒绝（HTTP 422）。
            </li>
            <li>
              文件名会以作品标题命名并做安全转义；中文文件名通过 RFC 5987 编码。
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
