import { loadNovelBible } from "@/lib/loaders/novelBible";

import { WorldEditor } from "../_components/WorldEditor";
import { NoBible } from "@/components/ui/NoBible";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function WorldPage({ params }: PageProps) {
  const { id } = await params;
  const { novel, bible } = await loadNovelBible(id);

  if (!bible) {
    return <NoBible novelId={novel.id} title={novel.title} hint="编辑世界观" />;
  }

  return <WorldEditor novelId={novel.id} bible={bible} />;
}
