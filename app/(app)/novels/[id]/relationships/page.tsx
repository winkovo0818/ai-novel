import { loadNovelBible } from "@/lib/loaders/novelBible";

import { RelationshipEditor } from "./RelationshipEditor";
import { NoBible } from "@/components/ui/NoBible";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RelationshipsPage({ params }: PageProps) {
  const { id } = await params;
  const { novel, bible } = await loadNovelBible(id);

  if (!bible) {
    return <NoBible novelId={novel.id} title={novel.title} hint="查看角色关系" />;
  }

  return <RelationshipEditor novelId={novel.id} initialBible={bible} />;
}
