import NovelSettingsClient from "../_components/NovelSettingsClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NovelSettingsPage({ params }: PageProps) {
  const { id } = await params;
  return <NovelSettingsClient novelId={id} />;
}