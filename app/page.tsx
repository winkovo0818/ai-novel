export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">AI Novel</h1>
      <p className="text-gray-600">Onboarding MVP — 入口在 /new（待 Step 5 实现）</p>
      <a
        href="/api/healthz/llm"
        className="text-sm underline text-gray-500 hover:text-gray-900"
      >
        DeepSeek 探活: GET /api/healthz/llm
      </a>
    </main>
  );
}
