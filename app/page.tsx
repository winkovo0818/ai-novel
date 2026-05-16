import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Top Nav */}
      <nav className="flex h-20 items-center justify-between px-8 md:px-16 border-b border-border-subtle/50 bg-white/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3.5">
          <div className="h-9 w-9 rounded-xl bg-text-primary flex items-center justify-center text-white font-bold text-lg shadow-premium">A</div>
          <div className="flex flex-col leading-none">
            <span className="text-[14px] font-bold tracking-tight text-text-primary uppercase">AI Novel</span>
            <span className="text-[9px] font-bold text-primary tracking-widest mt-1">PRO STUDIO</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="px-5 py-2 text-[13px] font-bold text-text-secondary hover:text-text-primary transition"
          >
            登录 / SIGN IN
          </Link>
          <Link href="/signup" className="btn-primary rounded-xl px-6 py-2.5 h-auto text-[13px] font-bold shadow-xl shadow-primary/10">
            免费注册 / JOIN NOW
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center pt-32 pb-40 px-6 text-center relative overflow-hidden">
        {/* Background Decor */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/5 border border-primary/10 rounded-full mb-8 animate-fade-in">
             <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
             <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">下一代 AI 叙事引擎现已就绪</span>
          </div>
          <h1 className="font-serif text-7xl md:text-8xl lg:text-9xl font-bold leading-[1.05] tracking-tight text-text-primary animate-fade-in-up">
            写一本
            <br />
            <span className="text-primary italic">长篇巨作</span>
          </h1>
          <p className="mt-12 text-lg md:text-2xl text-text-secondary leading-relaxed max-w-2xl mx-auto animate-fade-in-up delay-100 font-medium">
            从灵感火花到百万字史诗。
            <br />
            AI 真正深度理解您的人物魂魄、世界规则与叙事节拍。
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-5 animate-fade-in-up delay-200">
            <Link
              href="/signup"
              className="btn-primary w-full sm:w-auto h-14 px-10 text-base font-bold shadow-2xl shadow-primary/20 rounded-2xl active:scale-95 transition"
            >
              开启创作之旅
            </Link>
            <a
              href="#features"
              className="btn-secondary w-full sm:w-auto h-14 px-10 text-base font-bold rounded-2xl active:scale-95 transition"
            >
              探索核心协议
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-8 md:px-16 py-32 bg-white border-y border-border-subtle relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
            <div className="max-w-2xl">
               <p className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mb-4">Core Infrastructure</p>
               <h2 className="text-4xl md:text-5xl font-bold text-text-primary tracking-tight leading-tight">
                 专为百万字级别的
                 <br />
                 严肃创作而生
               </h2>
            </div>
            <p className="text-lg text-text-muted max-w-sm leading-relaxed italic">
              不再是简单的文字补全，而是真正基于逻辑与记忆的协同创作。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <FeatureCard
              tag="01 · SYNTHETIC BIBLE"
              title="叙事圣经合成"
              description="通过向导自动构建深度角色图谱、物理规则与多线大纲，确保百万字长篇的设定逻辑无懈可击。"
              accent="primary"
            />
            <FeatureCard
              tag="02 · DRAFTING AGENT"
              title="智能起草协议"
              description="不仅仅是续写。Agent 会深度阅读设定集与前文伏笔，为您生成具有高度文学性的候选稿件。"
              accent="emerald"
            />
            <FeatureCard
              tag="03 · MEMORY RAG"
              title="长程逻辑检索"
              description="内置向量记忆数据库。无论是万字前的细节还是不经意的对白，AI 都能精准检索，杜绝人设崩坏。"
              accent="violet"
            />
          </div>
        </div>
      </section>

      {/* CTA section */}
      <section className="py-32 px-8 md:px-16 text-center">
         <div className="card bg-text-primary text-white border-none p-16 md:p-24 rounded-[48px] max-w-6xl mx-auto shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-3xl -mr-40 -mt-40 transition-transform group-hover:scale-125 duration-300" />
            <div className="relative z-10">
               <h2 className="text-4xl md:text-6xl font-serif font-bold mb-8">准备好开启下一个篇章了吗？</h2>
               <p className="text-lg md:text-xl opacity-60 max-w-xl mx-auto mb-12 leading-relaxed">
                 加入数千名创作者的行列，利用最前沿的 AI 基础设施构建您的文学帝国。
               </p>
               <Link href="/signup" className="inline-flex items-center gap-3 px-12 py-5 bg-white text-text-primary rounded-2xl font-bold text-lg hover:bg-secondary transition active:scale-95 shadow-xl shadow-black/20">
                 立即免费开始
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                 </svg>
               </Link>
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto px-8 md:px-16 py-16 bg-secondary/30">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3.5">
              <div className="h-8 w-8 rounded-xl bg-text-primary flex items-center justify-center text-white font-bold text-sm">A</div>
              <span className="text-[14px] font-bold tracking-tight text-text-primary uppercase leading-none">AI Novel</span>
            </div>
            <p className="text-sm text-text-dim max-w-xs leading-relaxed">
              全球领先的 AI 协同文学创作基础设施。让每一位创作者都能拥有构建宏大世界的能力。
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-20">
             <div className="flex flex-col gap-4">
                <span className="text-[10px] font-bold text-text-primary uppercase tracking-[0.2em]">产品</span>
                <FooterLink>功能特性</FooterLink>
                <FooterLink>模型定价</FooterLink>
                <FooterLink>开发路线</FooterLink>
             </div>
             <div className="flex flex-col gap-4">
                <span className="text-[10px] font-bold text-text-primary uppercase tracking-[0.2em]">法律</span>
                <FooterLink>隐私政策</FooterLink>
                <FooterLink>服务条款</FooterLink>
                <FooterLink>版权协议</FooterLink>
             </div>
             <div className="flex flex-col gap-4">
                <span className="text-[10px] font-bold text-text-primary uppercase tracking-[0.2em]">连接</span>
                <FooterLink href="https://github.com" external>GitHub</FooterLink>
                <FooterLink>Twitter / X</FooterLink>
                <FooterLink>Discord</FooterLink>
             </div>
          </div>
        </div>
        <div className="mx-auto max-w-7xl border-t border-border-strong mt-20 pt-8 flex justify-between items-center text-[11px] font-bold text-text-dim uppercase tracking-widest">
           <span>© 2026 AI Novel Studio Core</span>
           <span>Designed for Immersion</span>
        </div>
      </footer>
    </main>
  );
}

interface FeatureCardProps {
  tag: string;
  title: string;
  description: string;
  accent: "primary" | "emerald" | "violet";
}

/**
 * Footer entry that renders as a real link only when given a real href;
 * otherwise becomes a non-focusable, screen-reader-announced "coming soon"
 * span. Prevents the antipattern of `<a href="#">` which silently scrolls to
 * top and shows up as a real route to assistive tech.
 */
function FooterLink({
  children,
  href,
  external = false,
}: {
  children: React.ReactNode;
  href?: string;
  external?: boolean;
}) {
  if (!href) {
    return (
      <span
        aria-disabled="true"
        className="text-sm text-text-dim/60 font-medium cursor-not-allowed"
        title="即将上线"
      >
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="text-sm text-text-dim hover:text-primary transition-colors font-medium"
    >
      {children}
    </a>
  );
}

function FeatureCard({ tag, title, description, accent }: FeatureCardProps) {
  const accentBg = {
    primary: "bg-primary/10",
    emerald: "bg-emerald-100",
    violet: "bg-violet-100",
  }[accent];
  const accentDot = {
    primary: "bg-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]",
    emerald: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
    violet: "bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]",
  }[accent];

  return (
    <div className="card group hover:border-primary/20 transition p-8 rounded-[32px] hover:shadow-premium bg-white duration-500 hover:-translate-y-2">
      <div
        className={`h-12 w-12 rounded-2xl ${accentBg} flex items-center justify-center mb-8 group-hover:scale-110 transition duration-500 group-hover:shadow-inner`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${accentDot}`} />
      </div>
      <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4">{tag}</p>
      <h3 className="text-xl font-bold mb-4 text-text-primary tracking-tight group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-text-secondary leading-relaxed text-[15px] font-medium opacity-80">{description}</p>
    </div>
  );
}
