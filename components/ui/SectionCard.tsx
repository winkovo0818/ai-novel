import React from "react";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, subtitle, children, actions, className = "" }: SectionCardProps) {
  return (
    <section className={`card bg-white flex flex-col gap-6 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[13px] text-text-muted">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      
      <div className="flex-1">
        {children}
      </div>
    </section>
  );
}
