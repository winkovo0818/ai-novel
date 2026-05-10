import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { BibleDraftSchema, getVolumes } from "@/lib/validation/schemas";
import { getChapterStatusesForNovel } from "@/lib/agent/chapterStatus";

import { ChaptersClient } from "./ChaptersClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ChaptersPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { filter } = await searchParams;

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    notFound();
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: { bible: true, chapters: { orderBy: { chapter_index: "asc" } } },
  });
  if (!novel) notFound();
  if (!canAccessOwnerResource(novel.user_id, userId)) notFound();
  if (!novel.bible) notFound();

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) notFound();

  const volumes = getVolumes(bible.data);
  const statuses = await getChapterStatusesForNovel(id);
  const statusByChapter = new Map(statuses.map((s) => [s.chapterId, s]));

  // Map outline chapter_index → ChapterDraft (if drafted yet) so the UI shows
  // the full outline, not only persisted drafts.
  const draftByIndex = new Map(novel.chapters.map((c) => [c.chapter_index, c]));
  const volumeMeta = volumes.map((v, vi) => ({
    name: v.name,
    theme: v.theme,
    rows: v.chapters.map((ch) => {
      const draft = draftByIndex.get(ch.index);
      const status = draft ? statusByChapter.get(draft.id) : undefined;
      const wordCount = draft ? draft.content.replace(/\s/g, "").length : 0;
      return {
        chapter_index: ch.index,
        title: draft?.title ?? ch.title,
        outline_summary: ch.summary,
        status: draft?.status ?? "missing",
        target_words: draft?.target_words ?? null,
        word_count: wordCount,
        updated_at: draft?.updated_at?.toISOString(),
        summary_state: status?.summary,
        index_state: status?.index,
        last_job_status: status?.lastJobStatus,
        last_job_type: status?.lastJobType,
        chapter_id: draft?.id,
      };
    }),
    volumeIndex: vi,
  }));

  return (
    <ChaptersClient
      novelId={novel.id}
      bibleTitle={bible.data.meta.suggested_title}
      volumes={volumeMeta}
      initialFilter={filter ?? "all"}
      breadcrumb={[
        { label: "我的书架", href: "/novels" },
        { label: bible.data.meta.suggested_title, href: `/novels/${novel.id}` },
        { label: "章节版本" }
      ]}
    />
  );
}
