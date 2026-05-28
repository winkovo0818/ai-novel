import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

const workflowItems = [
  {
    title: "创建作品",
    description: "用题材、标题和一句话灵感建立项目。",
  },
  {
    title: "生成作品设定",
    description: "整理角色、世界观、阵营和章节大纲。",
  },
  {
    title: "继续写作",
    description: "在编辑器里查看下一步建议，使用写作助手生成候选稿。",
  },
  {
    title: "检查与导出",
    description: "核对一致性、刷新摘要和记忆，按章节范围导出作品。",
  },
] as const;

const workspaceStats = [
  { label: "最近作品", value: "3 部", detail: "2 部本周更新" },
  { label: "待继续章节", value: "7 章", detail: "按更新时间排序" },
  { label: "本月调用", value: "126 次", detail: "含起草与检查" },
] as const;

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background text-text-primary selection:bg-primary/20">
      <nav className="sticky top-0 z-50 border-b border-border-subtle bg-background/95 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="AI Novel 首页">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-text-primary text-sm font-bold text-white shadow-sm">
              A
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-bold uppercase">AI Novel</span>
              <span className="text-xs font-medium text-text-muted">写作工作台</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-bold text-text-secondary transition hover:bg-secondary hover:text-text-primary"
            >
              登录
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-text-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-accent"
            >
              开始使用
            </Link>
          </div>
        </div>
      </nav>

      <section className="border-b border-border-subtle px-5 py-12 md:px-10 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-accent">写作工作台入口</p>
            <h1 className="mt-4 font-serif text-5xl font-bold leading-[1.08] md:text-6xl">
              AI Novel 写作工作台
            </h1>
            <p className="mt-6 text-lg leading-8 text-text-secondary md:text-xl">
              从灵感、作品设定、大纲到章节正文的 AI 辅助写作工具。注册后进入工作台，创建作品并继续写作。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-text-primary px-6 text-sm font-bold text-white shadow-sm transition hover:bg-accent"
              >
                创建第一部作品
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-border-strong bg-white px-6 text-sm font-bold text-text-primary shadow-sm transition hover:border-text-primary hover:bg-secondary"
              >
                进入已有工作台
              </Link>
            </div>
          </div>

          <WorkspacePreview />
        </div>
      </section>

      <section id="workflow" className="px-5 py-14 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 border-b border-border-subtle pb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold text-accent">日常创作流程</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
                把每一步都放回写作者真正会用的位置
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-text-secondary">
              首页只负责把用户带进产品；具体创作、管理和配置都在登录后的工作台内完成。
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {workflowItems.map((item, index) => (
              <article key={item.title} className="rounded-lg border border-border-subtle bg-white p-5 shadow-sm">
                <p className="text-xs font-bold text-text-muted">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-5 text-lg font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-text-secondary">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border-subtle bg-white px-5 py-12 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-accent">准备开始</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">进入工作台，继续写下一章</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-text-primary px-6 text-sm font-bold text-white shadow-sm transition hover:bg-accent"
            >
              免费注册
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border-strong bg-white px-6 text-sm font-bold text-text-primary shadow-sm transition hover:border-text-primary hover:bg-secondary"
            >
              登录
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-5 py-10 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-text-muted md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-text-primary text-xs font-bold text-white">
              A
            </span>
            <span className="font-bold text-text-primary">AI Novel</span>
            <span>面向长篇小说写作的 AI 辅助工作台。</span>
          </div>
          <div className="flex gap-4">
            <a href="#workflow" className="transition hover:text-text-primary">
              创作流程
            </a>
            <Link href="/login" className="transition hover:text-text-primary">
              登录
            </Link>
            <Link href="/signup" className="transition hover:text-text-primary">
              注册
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function WorkspacePreview() {
  return (
    <div className="rounded-lg border border-border-strong bg-white shadow-premium" aria-label="产品界面预览">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-sm font-bold">工作台预览</p>
          <p className="mt-1 text-xs text-text-muted">下一步建议、最近作品和任务状态集中呈现</p>
        </div>
        <span className="rounded-md bg-secondary px-3 py-1 text-xs font-bold text-text-secondary">今日</span>
      </div>

      <div className="grid min-h-[360px] md:grid-cols-[168px_1fr]">
        <aside className="border-b border-border-subtle bg-secondary/30 p-4 md:border-b-0 md:border-r">
          <nav className="grid gap-2 text-sm">
            {["仪表盘", "新建作品", "写作助手", "导出中心"].map((item, index) => (
              <span
                key={item}
                className={`rounded-md px-3 py-2 font-bold ${
                  index === 0 ? "bg-text-primary text-white" : "text-text-secondary"
                }`}
              >
                {item}
              </span>
            ))}
          </nav>
        </aside>

        <div className="grid gap-0 md:grid-cols-[1fr_230px]">
          <section className="p-5">
            <div className="rounded-lg border border-border-subtle p-4">
              <p className="text-xs font-bold text-accent">下一步建议</p>
              <h2 className="mt-3 text-xl font-bold">继续写作《星河纪》</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                还有 1 个章节处于草稿状态，可以从最近编辑的位置继续。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-md bg-secondary px-3 py-1 text-xs font-bold text-text-secondary">
                  第 12 章
                </span>
                <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  自动保存正常
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {workspaceStats.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-border-subtle bg-background p-4">
                  <p className="text-xs font-bold text-text-muted">{stat.label}</p>
                  <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                  <p className="mt-1 text-xs text-text-muted">{stat.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="border-t border-border-subtle bg-secondary/20 p-5 md:border-l md:border-t-0">
            <p className="text-sm font-bold">写作助手</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border-subtle bg-white p-3">
                <p className="text-xs font-bold text-text-muted">选区操作</p>
                <p className="mt-2 text-sm text-text-secondary">润色、扩写、缩写、增强冲突</p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-white p-3">
                <p className="text-xs font-bold text-text-muted">一致性检查</p>
                <p className="mt-2 text-sm text-text-secondary">查看角色、线索和世界观提醒</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">任务状态</p>
                <p className="mt-2 text-sm text-amber-900">1 个失败任务可重试</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
