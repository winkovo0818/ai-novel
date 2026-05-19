import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isUp?: boolean;
  };
}

export function StatCard({ label, value, subValue, icon, trend }: StatCardProps) {
  return (
    <div className="card glass-panel group hover:border-accent/30 hover:shadow-[0_20px_40px_-12px_rgba(99,102,241,0.1)] transition-all duration-500 hover:-translate-y-1 overflow-hidden relative min-h-[140px] flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] group-hover:text-text-primary transition-colors">
              {label}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-serif font-bold tracking-tight text-text-primary group-hover:text-accent transition-colors duration-500 tabular-nums">
                {value}
              </span>
              {trend && (
                <span className={`text-[11px] font-bold ${trend.isUp ? "text-emerald-500" : "text-red-500"} flex items-center gap-1`}>
                  {trend.isUp ? "↑" : "↓"} {trend.value}
                </span>
              )}
            </div>
          </div>
          {icon && (
            <div className="h-10 w-10 rounded-2xl bg-secondary flex items-center justify-center text-text-muted group-hover:bg-accent group-hover:text-white transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner border border-border-subtle group-hover:border-transparent">
              {icon}
            </div>
          )}
        </div>
      </div>
      
      {subValue && (
        <div className="relative z-10 mt-auto pt-4 border-t border-border-subtle/50">
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider opacity-60">
            {subValue}
          </span>
        </div>
      )}
    </div>
  );
}
