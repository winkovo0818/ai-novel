import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { BibleDraftSchema } from "@/lib/validation/schemas";

import { CharactersEditor } from "../_components/CharactersEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function CharactersPage({ params }: PageProps) {
  const { id } = await params;

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
  if (!novel.bible) {
    return (
      <NoBible novelId={novel.id} title={novel.title} />
    );
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) {
    return <NoBible novelId={novel.id} title={novel.title} />;
  }

  return <CharactersEditor novelId={novel.id} bible={bible.data} />;
}

function NoBible({ novelId, title }: { novelId: string; title: string }) {
  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 p-12">
      <div className="max-w-2xl mx-auto card bg-white text-center py-16">
        <h2 className="text-xl font-serif font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-secondary mb-6">
          这本书还没有 Bible，需要先完成创建流程才能编辑角色。
        </p>
        <Link href={`/novels/${novelId}`} className="btn-primary inline-flex">
          返回项目页
        </Link>
      </div>
    </div>
  );
}
