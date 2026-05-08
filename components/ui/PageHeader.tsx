import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function PageHeader({ title, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="relative mb-8 animate-fade-in-up">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between pb-6 border-b border-border-strong/50">
        <div className="flex flex-col gap-2">
          {breadcrumb && (
            <nav className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">
                {breadcrumb}
              </span>
            </nav>
          )}
          <h1 className="text-3xl font-serif font-bold text-text-primary tracking-tight leading-none">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-text-secondary max-w-2xl leading-relaxed mt-0.5 font-medium opacity-80">
              {description}
            </p>
          )}
        </div>
        
        {actions && (
          <div className="flex items-center gap-3 pt-6 md:pt-0">
            {actions}
          </div>
        )}
      </div>
      
      {/* Decorative element to ground the header */}
      <div className="absolute -bottom-px left-0 w-24 h-0.5 bg-primary rounded-full" />
    </div>
  );
}
