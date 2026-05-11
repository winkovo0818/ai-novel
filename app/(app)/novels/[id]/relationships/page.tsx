import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { BibleDraftSchema } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

import { RelationshipGraph } from "./RelationshipGraph";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RelationshipsPage({ params }: PageProps) {
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
    return <NoBible novelId={novel.id} title={novel.title} />;
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) {
    return <NoBible novelId={novel.id} title={novel.title} />;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-32">
        <PageHeader
          title="角色关系图"
          description={`${bible.data.characters.length} 位角色 · 自 Bible 中的 relations 字段自动连边`}
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: novel.title, href: `/novels/${novel.id}` },
            { label: "角色关系图" },
          ]}
        />

        <div className="mt-12">
          <RelationshipGraph characters={bible.data.characters} />
        </div>

        <section className="mt-12 card bg-white">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-4">
            说明 / NOTES
          </h2>
          <ul className="space-y-2 text-sm text-text-muted leading-relaxed list-disc pl-5">
            <li>
              图中的边由 <code className="bg-secondary/60 px-1.5 py-0.5 rounded text-[12px]">characters[].relations</code> 字段抽取：当一条 relation 字符串里出现其他角色的名字，就连一条从源角色指向被提及角色的有向边。
            </li>
            <li>
              没有匹配到任何角色名字的 relation（如「神秘的过去」）会显示在源角色卡片的「未匹配」区，不画进图里。
            </li>
            <li>
              鼠标悬停节点或卡片会高亮关联边；当前版本仅展示，编辑请去 <Link href={`/novels/${novel.id}/characters`} className="text-primary hover:underline">角色管理页</Link>。
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function NoBible({ novelId, title }: { novelId: string; title: string }) {
  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 p-12">
      <div className="max-w-2xl mx-auto card bg-white text-center py-16">
        <h2 className="text-xl font-serif font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-secondary mb-6">
          这本书还没有 Bible，需要先完成创建流程才能查看角色关系。
        </p>
        <Link href={`/novels/${novelId}`} className="btn-primary inline-flex">
          返回项目页
        </Link>
      </div>
    </div>
  );
}
