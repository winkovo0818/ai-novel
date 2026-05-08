"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6">
      <h1 className="text-2xl font-semibold text-neutral-950">出错了</h1>
      <p className="mt-4 max-w-md text-center text-sm text-neutral-500">
        {error.message || "发生了意外错误，请稍后重试。"}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-neutral-950 px-6 py-3 text-sm font-medium text-white"
      >
        重试
      </button>
      <a href="/" className="mt-3 text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-950">
        返回首页
      </a>
    </main>
  );
}
