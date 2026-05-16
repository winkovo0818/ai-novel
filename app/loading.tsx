export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-950" />
        <p className="text-sm text-neutral-500">加载中…</p>
      </div>
    </main>
  );
}
