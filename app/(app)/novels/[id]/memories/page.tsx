import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { BibleDraftSchema } from "@/lib/validation/schemas";
import { buildMemoryLibraryPreview, normalizeMemoryLibraryQuery } from "@/lib/agent/memoryLibrary";
import type { MemoryLibraryFilterType } from "@/lib/agent/contracts";

import { MemoriesClient } from "./MemoriesClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    chapter_index?: string;
    page?: string;
    page_size?: string;
    type?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function MemoriesPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;

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
  if (!novel || novel.deleted_at) notFound();
  if (!canAccessOwnerResource(novel.user_id, userId)) notFound();
  if (!novel.bible) notFound();

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) notFound();

  const data = await buildMemoryLibraryPreview(prisma, novel.id, normalizeMemoryLibraryQuery({
    chapterIndex: Number(query.chapter_index ?? undefined),
    page: Number(query.page ?? undefined),
    pageSize: Number(query.page_size ?? undefined),
    type: query.type as MemoryLibraryFilterType | undefined,
  }));

  return (
    <MemoriesClient
      novelId={novel.id}
      title={novel.title}
      data={data}
      breadcrumb={[
        { label: "我的书架", href: "/novels" },
        { label: bible.data.meta.suggested_title, href: `/novels/${novel.id}` },
        { label: "记忆库" },
      ]}
    />
  );
}
