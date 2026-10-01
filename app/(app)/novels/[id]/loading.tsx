export default function LoadingNovel() {
  // Keep a Suspense boundary around database-backed details during navigation.
  return <div role="status" className="p-8 text-sm text-text-muted">正在加载作品…</div>;
}
