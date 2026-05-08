import React from "react";
import type { WizardStep } from "@/lib/store/wizardStore";

const labels = ["核心方向", "灵感合成", "决策矩阵", "圣经合成", "最终核对"];

export function ProgressDots({ step }: { step: WizardStep }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {labels.map((label, index) => {
        const current = index + 1 === step;
        const done = index + 1 < step;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-2 group">
              <div className="relative flex items-center justify-center">
                {current && (
                  <span className="absolute -inset-1.5 rounded-full bg-primary/10 animate-ping opacity-40" />
                )}
                <span
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-500 z-10 ${
                    done 
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-90" 
                      : current 
                      ? "bg-primary text-white shadow-xl shadow-primary/30" 
                      : "bg-secondary text-text-muted border border-border-strong group-hover:border-primary/30"
                  }`}
                >
                  {done ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-[0.15em] transition-colors duration-300 ${current ? "text-primary" : done ? "text-text-secondary" : "text-text-dim"}`}>
                {label}
              </span>
            </div>
            {index < labels.length - 1 && (
              <div className="flex-1 min-w-[20px] px-2 mb-4">
                <div className={`h-[2px] w-full rounded-full transition-all duration-700 ${done ? "bg-emerald-500/30" : "bg-border-subtle"}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
