import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { BibleDraftSchema } from "@/lib/validation/schemas";

export async function loadNovelBible(id: string) {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    notFound();
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: { bible: true },
  });

  if (!novel) notFound();
  if (!canAccessOwnerResource(novel.user_id, userId)) notFound();

  let bible: Awaited<ReturnType<typeof BibleDraftSchema.parse>> | null = null;
  if (novel.bible) {
    const result = BibleDraftSchema.safeParse(novel.bible.content);
    if (result.success) bible = result.data;
  }

  return { novel, bible };
}
