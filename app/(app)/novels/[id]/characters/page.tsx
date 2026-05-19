import { loadNovelBible } from "@/lib/loaders/novelBible";

import { CharactersEditor } from "../_components/CharactersEditor";
import { NoBible } from "@/components/ui/NoBible";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function CharactersPage({ params }: PageProps) {
  const { id } = await params;
  const { novel, bible } = await loadNovelBible(id);

  if (!bible) {
    return <NoBible novelId={novel.id} title={novel.title} hint="编辑角色" />;
  }

  return <CharactersEditor novelId={novel.id} bible={bible} />;
}
