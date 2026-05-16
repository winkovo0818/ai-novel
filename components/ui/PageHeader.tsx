import React from "react";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}

export function PageHeader({ title, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[11px] font-bold text-text-dim uppercase tracking-wider">
          {breadcrumb.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="opacity-40" aria-hidden="true">/</span>}
              {item.href ? (
                <Link href={item.href} className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-text-primary mb-3">
            {title}
          </h1>
          {description && (
            <p className="text-base text-text-secondary leading-relaxed opacity-80">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
