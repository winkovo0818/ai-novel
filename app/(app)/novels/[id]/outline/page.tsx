import { prisma } from "@/lib/db";
import { loadNovelBible } from "@/lib/loaders/novelBible";

import { OutlineEditor } from "../_components/OutlineEditor";
import { NoBible } from "@/components/ui/NoBible";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function OutlinePage({ params }: PageProps) {
  const { id } = await params;
  const { novel, bible } = await loadNovelBible(id);

  if (!bible) {
    return <NoBible novelId={novel.id} title={novel.title} hint="编辑大纲" />;
  }

  const chapters = await prisma.chapterDraft.findMany({
    where: { novel_id: id },
    select: { chapter_index: true },
  });
  const draftedIndexes = chapters.map((c) => c.chapter_index);

  return (
    <OutlineEditor novelId={novel.id} bible={bible} draftedIndexes={draftedIndexes} />
  );
}
