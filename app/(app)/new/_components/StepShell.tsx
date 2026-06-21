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
  const folio = eyebrow.match(/\d+/)?.[0] ?? "";

  return (
    <section className="wizard-paper-surface relative overflow-hidden rounded-xl border border-border-subtle bg-white p-5 shadow-[0_18px_54px_rgba(36,31,24,0.06),0_6px_18px_rgba(36,31,24,0.04)] animate-fade-in-up sm:p-7 lg:p-9">
      <div className="pointer-events-none absolute right-7 top-7 select-none font-serif text-6xl leading-none tracking-normal text-text-primary/[0.045]">
        {folio}
      </div>

      <div className="relative z-10">
        <header className="mb-8 grid gap-4">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.24em] text-accent">
            <span className="h-px w-7 bg-accent" />
            {eyebrow.replace("Folio", "卷期").replace("Step", "步骤")}
          </div>

          <h1 className="max-w-3xl font-serif text-4xl font-normal leading-tight tracking-normal text-text-primary md:text-5xl">
            {title}
          </h1>

          <p className="max-w-2xl border-l border-accent/25 pl-5 font-serif text-base leading-8 tracking-normal text-text-secondary">
            {description}
          </p>
        </header>

        <div className="animate-fade-in delay-200">{children}</div>
      </div>
    </section>
  );
}
