import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";

interface PageProps {
  params: Promise<{ novelId: string }>;
}

export default async function EditorPlaceholderPage({ params }: PageProps) {
  const { novelId } = await params;
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: { bible: true },
  });

  if (!novel) notFound();

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="text-sm text-neutral-400">Editor Placeholder</p>
        <h1 className="mt-2 text-3xl font-semibold">{novel.title}</h1>
        <p className="mt-4 text-neutral-300">
          小说项目已创建，完整主编辑器不在本轮 MVP 范围内。当前页面用于验证 Onboarding 保存和跳转闭环。
        </p>
        <dl className="mt-8 grid gap-4 text-sm text-neutral-300 md:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-4">
            <dt className="text-neutral-500">Novel ID</dt>
            <dd className="mt-1 break-all">{novel.id}</dd>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <dt className="text-neutral-500">Bible Draft</dt>
            <dd className="mt-1">{novel.bible ? `v${novel.bible.version}` : "未创建"}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
