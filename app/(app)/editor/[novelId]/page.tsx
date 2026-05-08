import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { BibleDraftSchema } from "@/lib/validation/schemas";
import { EditorClient } from "./EditorClient";

interface PageProps {
  params: Promise<{ novelId: string }>;
}

export default async function EditorPlaceholderPage({ params }: PageProps) {
  const { novelId } = await params;

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

  return (
    <EditorClient
      novelId={novel.id}
      title={novel.title}
      bible={bible.data}
      initialChapters={novel.chapters}
    />
  );
}
