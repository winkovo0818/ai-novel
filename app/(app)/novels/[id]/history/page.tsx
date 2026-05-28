import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { BibleDraftSchema } from "@/lib/validation/schemas";

import { HistoryClient } from "./HistoryClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ agent?: string; status?: string }>;
}

export const dynamic = "force-dynamic";

export default async function GenerationHistoryPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { agent, status } = await searchParams;

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

  const bibleParse = novel.bible ? BibleDraftSchema.safeParse(novel.bible.content) : null;
  const bibleTitle = bibleParse?.success ? bibleParse.data.meta.suggested_title : novel.title;

  const generations = await prisma.llmUsage.findMany({
    where: {
      novel_id: id,
      user_id: userId,
      ...(agent ? { agent } : {}),
      ...(status === "ok" || status === "err" ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const initialData = generations.map((row) => ({
    id: row.id,
    agent: row.agent ?? "unknown",
    route: row.route,
    model: row.model,
    status: row.status,
    error_code: row.error_code ?? undefined,
    token_in: row.token_in,
    token_out: row.token_out,
    cost_cny: row.cost_cny,
    took_ms: row.took_ms ?? undefined,
    created_at: row.created_at.toISOString(),
  }));

  return (
    <HistoryClient
      novelId={novel.id}
      initialData={initialData}
      initialAgent={agent ?? "all"}
      initialStatus={status ?? "all"}
      breadcrumb={[
        { label: "我的书架", href: "/novels" },
        { label: bibleTitle, href: `/novels/${novel.id}` },
        { label: "AI 调用历史" }
      ]}
    />
  );
}
