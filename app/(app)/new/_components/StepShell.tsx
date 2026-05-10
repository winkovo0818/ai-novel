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
    <section className="bg-white border border-border-subtle rounded-3xl p-6 md:p-10 shadow-sm animate-fade-in relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
      
      <div className="flex flex-col gap-3 mb-8 relative z-10">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary px-3 py-1 bg-primary/5 rounded-lg border border-primary/10">
            {eyebrow}
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-text-primary tracking-tight leading-tight">
          {title}
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed max-w-2xl opacity-70 font-medium">
          {description}
        </p>
      </div>

      <div className="animate-slide-in relative z-10">
        {children}
      </div>
    </section>
  );
}
