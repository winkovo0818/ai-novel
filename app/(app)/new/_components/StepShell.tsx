import type { ReactNode } from "react";

export function StepShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface border border-border-strong rounded-xl p-6 md:p-10 shadow-sm animate-fade">
      <div className="flex flex-col gap-4 mb-10">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary px-2 py-0.5 bg-primary/5 rounded border border-primary/10">{eyebrow}</span>
        </div>
        <h1 className="text-3xl font-serif font-bold text-text-primary tracking-tight leading-none">{title}</h1>
        <p className="text-sm text-text-secondary leading-relaxed max-w-2xl font-medium opacity-80">{description}</p>
      </div>
      <div className="animate-slide">
        {children}
      </div>
    </section>
  );
}
