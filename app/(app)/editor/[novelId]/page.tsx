import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { BibleDraftSchema } from "@/lib/validation/schemas";
import { EditorClient } from "./EditorClient";

interface PageProps {
  params: Promise<{ novelId: string }>;
  searchParams: Promise<{ chapter?: string }>;
}

export default async function EditorPlaceholderPage({ params, searchParams }: PageProps) {
  const { novelId } = await params;
  const { chapter: chapterParam } = await searchParams;

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    notFound();
  }

  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" } },
    },
  });

  if (!novel || !novel.bible) notFound();
  if (!canAccessOwnerResource(novel.user_id, userId)) notFound();

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) notFound();

  const requestedIndex = chapterParam ? Number(chapterParam) : undefined;
  const initialChapterIndex =
    requestedIndex && Number.isFinite(requestedIndex) && requestedIndex >= 1
      ? requestedIndex
      : 1;

  const initialChapters = novel.chapters.map((c) => ({
    id: c.id,
    chapter_index: c.chapter_index,
    title: c.title,
    content: c.content,
    status: c.status,
    target_words: c.target_words,
    version: c.version,
    updated_at: c.updated_at.toISOString(),
  }));

  return (
    <EditorClient
      novelId={novel.id}
      title={novel.title}
      bible={bible.data}
      initialChapters={initialChapters}
      initialChapterIndex={initialChapterIndex}
    />
  );
}
