import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Navigation */}
      <nav className="flex h-24 items-center justify-between px-32 md:px-64 border-b border-border-subtle bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-12">
          <div className="h-32 w-32 rounded-sm bg-primary flex items-center justify-center text-white font-bold">A</div>
          <span className="text-sm font-bold tracking-tight text-text-primary uppercase">AI Novel Studio</span>
        </div>
        <div className="flex items-center gap-24">
          <a href="/login" className="text-sm font-medium text-text-secondary hover:text-primary transition-colors">登录</a>
          <a href="/signup" className="btn-primary px-24 h-40">免费注册</a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center pt-96 pb-128 px-32 text-center overflow-hidden">
        <div className="relative">
          <div className="absolute -inset-x-20 -inset-y-10 bg-primary/5 blur-3xl rounded-full" />
          <h1 className="relative font-serif text-[80px] md:text-[140px] lg:text-[180px] font-bold leading-none tracking-tighter text-text-primary animate-fade">
            NOVEL
          </h1>
        </div>
        <div className="mt-32 max-w-2xl animate-slide relative z-10">
          <p className="text-xl md:text-2xl text-text-secondary leading-relaxed">
            新一代 AI 协同创作工作台。
            <br />
            从一个灵感碎片到百万字长篇，让 AI 真正理解您的创作意图。
          </p>
          <div className="mt-48 flex flex-col md:flex-row items-center justify-center gap-16">
            <a href="/signup" className="btn-primary w-full md:w-auto px-48 h-56 text-base shadow-lg shadow-primary/20">
              立即开启创作
            </a>
            <a href="#features" className="btn-secondary w-full md:w-auto px-48 h-56 text-base">
              了解核心系统
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="px-32 py-128 bg-white border-y border-border-subtle">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-64">
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mb-12">System Core</p>
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight">创作基础设施</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-32">
            <div className="card group hover:border-primary/30 transition-all p-32">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-24 group-hover:scale-110 transition-transform">
                <span className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-8">01 / Bible</p>
              <h3 className="text-xl font-bold mb-16 text-text-primary">作品圣经合成</h3>
              <p className="text-text-secondary leading-relaxed text-sm">
                自动化构建角色关系网、地理环境、魔法体系及多线大纲，确保长篇创作逻辑严密。
              </p>
            </div>
            
            <div className="card group hover:border-primary/30 transition-all p-32">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-24 group-hover:scale-110 transition-transform">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-8">02 / Drafts</p>
              <h3 className="text-xl font-bold mb-16 text-text-primary">语义协同起草</h3>
              <p className="text-text-secondary leading-relaxed text-sm">
                基于作品设定和前文语义关联，AI 实时生成符合人物性格与剧情走向的高质量草稿。
              </p>
            </div>

            <div className="card group hover:border-primary/30 transition-all p-32">
              <div className="h-12 w-12 rounded-full bg-violet-100 flex items-center justify-center mb-24 group-hover:scale-110 transition-transform">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
              </div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-8">03 / Context</p>
              <h3 className="text-xl font-bold mb-16 text-text-primary">长程上下文保持</h3>
              <p className="text-text-secondary leading-relaxed text-sm">
                内置智能 RAG 引擎，在百万字长文创作中实时检索伏笔与细节，杜绝人设崩坏。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto px-32 md:px-64 py-64 bg-background">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-32">
          <div className="flex items-center gap-12 opacity-50">
            <div className="h-24 w-24 rounded-sm bg-text-primary flex items-center justify-center text-white font-bold text-[10px]">A</div>
            <span className="text-[10px] font-bold tracking-widest text-text-primary uppercase">© 2026 AI Novel Studio</span>
          </div>
          <div className="flex gap-32 text-[10px] font-bold text-text-muted uppercase tracking-widest">
            <a href="#" className="hover:text-primary transition-colors">隐私政策</a>
            <a href="#" className="hover:text-primary transition-colors">服务条款</a>
            <a href="https://github.com" className="hover:text-primary transition-colors">Github</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
