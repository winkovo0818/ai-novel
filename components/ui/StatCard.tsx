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
    <div className="card card-hover flex flex-col justify-between min-h-[140px]">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-dim uppercase tracking-[0.15em]">
            {label}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-text-primary">
              {value}
            </span>
            {trend && (
              <span className={`text-[11px] font-bold ${trend.isUp ? "text-emerald-500" : "text-red-500"}`}>
                {trend.value}
              </span>
            )}
          </div>
        </div>
        {icon && (
          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-text-secondary">
            {icon}
          </div>
        )}
      </div>
      
      {subValue && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <span className="text-[12px] text-text-muted font-medium">
            {subValue}
          </span>
        </div>
      )}
    </div>
  );
}
