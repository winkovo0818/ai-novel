import React from "react";
import type { WizardStep } from "@/lib/store/wizardStore";

const labels = ["核心方向", "灵感合成", "决策矩阵", "圣经合成", "最终核对"];

export function ProgressDots({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center justify-between w-full px-2 md:px-6">
      {labels.map((label, index) => {
        const current = index + 1 === step;
        const done = index + 1 < step;
        
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-3 group relative">
              <div className="relative flex flex-col items-center">
                <span className={`font-serif text-2xl transition duration-500 ease-out ${
                  current ? "text-text-primary scale-110" : done ? "text-accent" : "text-text-dim/40"
                }`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                
                {/* Bookmarking Indicator */}
                <div className={`absolute -bottom-6 h-4 w-[1.5px] transition duration-500 ${
                  current ? "bg-accent scale-y-100" : "bg-transparent scale-y-0"
                }`} />
              </div>

              <div className="flex flex-col">
                <span className={`text-[10px] font-bold uppercase tracking-[0.2em] transition duration-300 ${
                  current ? "text-text-primary translate-x-1" : done ? "text-text-muted" : "text-text-dim/40"
                }`}>
                  {label}
                </span>
                {current && (
                  <span className="text-[8px] font-medium uppercase tracking-[0.1em] mt-0.5 text-accent/60 translate-x-1 animate-fade-in">
                    当前阶段
                  </span>
                )}
              </div>
            </div>
            
            {index < labels.length - 1 && (
              <div className="h-px flex-1 mx-2 md:mx-4 bg-border-subtle relative overflow-hidden">
                <div 
                  className="absolute inset-0 bg-accent transition duration-[1.5s] ease-in-out" 
                  style={{ transform: `translateX(${done ? "0" : current ? "-50%" : "-100%"})` }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}



