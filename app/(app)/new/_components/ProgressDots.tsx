import React from "react";
import type { WizardStep } from "@/lib/store/wizardStore";

const labels = ["核心方向", "灵感合成", "决策矩阵", "圣经合成", "最终核对"];

export function ProgressDots({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center justify-between w-full px-2">
      {labels.map((label, index) => {
        const current = index + 1 === step;
        const done = index + 1 < step;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-2 group relative">
              <div className="relative flex items-center justify-center">
                {current && (
                  <span className="absolute -inset-1.5 rounded-full bg-primary/20 animate-ping opacity-30" />
                )}
                <span
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold transition-all duration-500 z-10 ${
                    done 
                      ? "bg-emerald-500 text-white shadow-lg scale-90" 
                      : current 
                      ? "bg-text-primary text-white shadow-lg ring-4 ring-primary/10" 
                      : "bg-white text-text-dim border border-border-strong group-hover:border-primary/40"
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
              <span className={`text-[10px] font-bold uppercase tracking-[0.1em] transition-colors duration-300 absolute top-12 whitespace-nowrap ${current ? "text-primary" : done ? "text-emerald-600" : "text-text-dim"}`}>
                {label}
              </span>
            </div>
            {index < labels.length - 1 && (
              <div className="flex-1 mx-1">
                <div className={`h-[2px] w-full rounded-full transition-all duration-1000 ${done ? "bg-emerald-500/30" : "bg-border-subtle"}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
