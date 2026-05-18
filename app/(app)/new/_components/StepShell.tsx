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
    <section className="bg-white border border-border-subtle rounded-2xl p-5 md:p-6 shadow-sm animate-fade-in-up relative overflow-hidden">
      <div className="absolute top-0 left-0 w-0.5 h-full bg-accent/30" aria-hidden="true" />

      <header className="flex flex-col gap-1.5 mb-5 pl-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
            {eyebrow.replace("Folio", "卷期").replace("Step", "步骤")}
          </span>
          <div className="h-px w-10 bg-border-strong" aria-hidden="true" />
        </div>

        <h2 className="text-2xl md:text-[28px] font-serif font-normal text-text-primary tracking-tight leading-tight text-balance">
          {title}
        </h2>

        <p className="text-[13px] text-text-muted leading-relaxed max-w-xl">
          {description}
        </p>
      </header>

      <div className="pl-2">{children}</div>
    </section>
  );
}
