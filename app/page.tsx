import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: "全自动逐章生成",
    body: "设定主题和章数后，系统无人值守起草、审校、修订，直到整本完成。40 章实测，质量无衰减。",
  },
  {
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "7 维质量门",
    body: "情节推进、连贯性、逻辑、AI 腔、世界观一致性、角色一致性、文笔可读性——每章自动评分，不合格自动重修。",
  },
  {
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: "长程记忆检索",
    body: "pgvector + HNSW 混合检索，角色关系、世界观规则、前文伏笔自动注入每章上下文，40 章不遗忘。",
  },
  {
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "多格式导出",
    body: "完成即导出——Markdown、TXT、DOCX、EPUB，选择性导出章节范围，附 Bible 设定附录。",
  },
] as const;

const steps = [
  { label: "灵感", body: "用一句话描述你的故事核心冲突。" },
  { label: "设定", body: "AI 生成角色、世界观、阵营和章节大纲。" },
  { label: "生成", body: "无人值守逐章写作，质量自动把关。" },
  { label: "导出", body: "整本导出为你选择的格式，随时发布或分享。" },
] as const;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[#080808] text-[#e8e4dc] selection:bg-[#c8a45c]/40 selection:text-white">
      {/* ---- Nav ---- */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center bg-[#080808]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 md:px-10">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="AI Novel 首页">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c8a45c] text-xs font-bold text-[#080808] group-hover:scale-105 transition-transform duration-300 shadow-[0_0_24px_-4px_rgba(200,164,92,0.3)]">
              墨
            </span>
            <span className="text-sm font-bold tracking-wide text-[#e8e4dc]">AI Novel</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-full px-5 text-sm font-medium text-[#b5af9f] transition hover:text-[#e8e4dc] hover:bg-white/[0.04]"
            >
              登录
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-full bg-[#c8a45c] px-5 text-sm font-bold text-[#080808] transition hover:bg-[#d4b86a] hover:shadow-[0_0_32px_-8px_rgba(200,164,92,0.4)] active:scale-95"
            >
              开始写作
            </Link>
          </div>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="relative pt-16 overflow-hidden">
        {/* Atmospheric ink-wash background (CSS only) */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[900px] opacity-60" />
          <div className="absolute top-[25%] right-[15%] w-0.5 h-0.5 rounded-full bg-[#c8a45c]/20 animate-pulse" />
          <div className="absolute top-[60%] left-[20%] w-0.5 h-0.5 rounded-full bg-[#c8a45c]/25 animate-pulse" />
          <div className="absolute top-[70%] right-[25%] w-1 h-1 rounded-full bg-[#c8a45c]/20 animate-pulse" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 py-32 md:py-44 lg:py-56 text-center">
          {/* Eyebrow */}
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#c8a45c] mb-8 animate-fade-in">
            面向长篇小说创作者的 AI 写作工作台
          </p>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-bold leading-[1.04] tracking-tight mb-8 animate-fade-in-up">
            让每一个故事
            <br />
            <span className="text-[#c8a45c]">都值得被写完</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base md:text-lg leading-relaxed text-[#9a9488] max-w-xl mx-auto mb-12 animate-fade-in-up delay-200">
            从灵感、角色设定、章节大纲到整本成稿，AI 辅助全流程。
            不是替代你的创作，是让创作不再卡在每一章的空白页面前。
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
            <Link
              href="/signup"
              className="inline-flex h-13 items-center rounded-full bg-[#c8a45c] px-10 text-base font-bold text-[#080808] transition hover:bg-[#d4b86a] hover:shadow-[0_0_48px_-12px_rgba(200,164,92,0.5)] hover:-translate-y-0.5 active:scale-95"
            >
              免费开始创作
            </Link>
            <Link
              href="#features"
              className="inline-flex h-13 items-center rounded-full border border-white/[0.08] px-10 text-base font-medium text-[#b5af9f] transition hover:border-white/[0.15] hover:text-[#e8e4dc] hover:bg-white/[0.02]"
            >
              了解更多
            </Link>
          </div>

          {/* Scroll hint */}
          <div className="mt-20 animate-fade-in delay-500">
            <div className="mx-auto w-5 h-8 rounded-full border border-white/[0.08] flex items-start justify-center p-1">
              <div className="w-1 h-2 rounded-full bg-[#c8a45c]/60 animate-bounce" />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section id="features" className="relative px-6 py-24 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#c8a45c] mb-4">为什么选择</p>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#e8e4dc]">
              为长篇而生
            </h2>
            <p className="mt-4 text-[#9a9488] text-base max-w-lg mx-auto">
              不是通用 AI 聊天。每一个功能都围绕长篇小说创作设计。
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative rounded-2xl border border-white/[0.04] bg-white/[0.02] p-8 md:p-10 hover:border-[#c8a45c]/20 hover:bg-white/[0.03] transition-all duration-700"
              >
                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(200,164,92,0.04) 0%, transparent 100%)',
                  }}
                />
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-[#c8a45c]/10 flex items-center justify-center text-[#c8a45c] mb-6 group-hover:bg-[#c8a45c]/15 transition-colors duration-500">
                    {f.icon}
                  </div>
                  <h3 className="text-xl font-serif font-bold text-[#e8e4dc] mb-3">{f.title}</h3>
                  <p className="text-[#8a8580] text-sm leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How It Works ---- */}
      <section className="relative px-6 py-24 md:py-32 border-y border-white/[0.04]">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#c8a45c] mb-4">创作流程</p>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#e8e4dc]">
              四步成书
            </h2>
          </div>

          <div className="grid gap-12 md:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.label} className="relative text-center group">
                {/* Connecting line (desktop) */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-px bg-white/[0.04] group-hover:bg-[#c8a45c]/20 transition-colors duration-500" />
                )}
                <div className="relative">
                  <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#c8a45c]/10 text-[#c8a45c] text-lg font-serif font-bold mb-5 group-hover:bg-[#c8a45c]/20 group-hover:scale-105 transition-all duration-500 ring-1 ring-[#c8a45c]/10 group-hover:ring-[#c8a45c]/30">
                    {i + 1}
                  </span>
                  <h4 className="text-lg font-serif font-bold text-[#e8e4dc] mb-2">{s.label}</h4>
                  <p className="text-sm text-[#8a8580] leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Quote ---- */}
      <section className="px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <blockquote className="text-2xl md:text-3xl lg:text-4xl font-serif italic leading-relaxed text-[#b5af9f]">
            &ldquo;写一本小说的唯一障碍，<br className="hidden sm:block" />
            不是没有灵感，而是没有勇气<br className="hidden sm:block" />
            面对每天的空白页面。&rdquo;
          </blockquote>
          <p className="mt-8 text-sm text-[#6b6560]">—— 每一位从来没有写完的小说作者</p>
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="px-6 py-24 md:py-32 border-t border-white/[0.04]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-[#e8e4dc] mb-6">
            准备好写你的故事了吗？
          </h2>
          <p className="text-base text-[#9a9488] max-w-lg mx-auto mb-10">
            免费开始，零设置。从一句话灵感到整本成稿。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex h-14 items-center rounded-full bg-[#c8a45c] px-12 text-base font-bold text-[#080808] transition hover:bg-[#d4b86a] hover:shadow-[0_0_48px_-12px_rgba(200,164,92,0.5)] hover:-translate-y-0.5 active:scale-95"
            >
              创建第一部作品
            </Link>
            <Link
              href="/login"
              className="inline-flex h-14 items-center rounded-full border border-white/[0.08] px-12 text-base font-medium text-[#b5af9f] transition hover:border-white/[0.15] hover:text-[#e8e4dc]"
            >
              已有账号？登录
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="px-6 py-12 border-t border-white/[0.04]">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-[#5a5550]">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#c8a45c]/10 text-[11px] font-bold text-[#c8a45c]">
              墨
            </span>
            <span className="font-bold text-[#8a8580]">AI Novel</span>
            <span className="text-[#5a5550]">面向长篇小说写作的 AI 辅助工作台。</span>
          </div>
          <div className="flex gap-6">
            <a href="#features" className="transition hover:text-[#b5af9f]">功能</a>
            <Link href="/login" className="transition hover:text-[#b5af9f]">登录</Link>
            <Link href="/signup" className="transition hover:text-[#b5af9f]">注册</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
