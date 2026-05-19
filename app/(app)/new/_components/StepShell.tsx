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
    <section className="bg-white border border-border-subtle rounded-[2.5rem] p-6 md:p-10 shadow-premium animate-fade-in-up relative overflow-hidden group">
      {/* Editorial Decorative Elements */}
      <div className="absolute top-0 left-0 w-1.5 h-full bg-text-primary/5 group-hover:bg-accent/20 transition-colors duration-500" />
      <div className="absolute top-6 right-8 font-serif text-[80px] leading-none text-text-primary/5 select-none pointer-events-none opacity-0 group-hover:opacity-100 transition duration-500 translate-x-6 group-hover:translate-x-0">
        {eyebrow.match(/\d+/)?.[0]}
      </div>

      <div className="max-w-4xl relative z-10">
        <header className="flex flex-col gap-4 mb-8 md:mb-10">
          <div className="flex items-center gap-3 animate-slide-in">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">
              {eyebrow.replace("Folio", "卷期").replace("Step", "步骤")}
            </span>
            <div className="h-px w-16 bg-border-strong" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-serif font-normal text-text-primary tracking-tight leading-tight animate-reveal">
            {title}
          </h1>
          
          <p className="text-base md:text-lg text-text-secondary leading-relaxed max-w-2xl font-serif opacity-80 border-l-3 border-accent/10 pl-6 mt-2 animate-fade-in delay-300">
            {description}
          </p>
        </header>

        <div className="animate-fade-in delay-500">
          {children}
        </div>
      </div>

      {/* Subtle Grain Overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none mix-blend-multiply" 
           style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
    </section>
  );
}



