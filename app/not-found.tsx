import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6">
      <h1 className="text-4xl font-bold text-neutral-950">404</h1>
      <p className="mt-4 text-sm text-neutral-500">页面不存在</p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-neutral-950 px-6 py-3 text-sm font-medium text-white"
      >
        返回首页
      </Link>
    </main>
  );
}
