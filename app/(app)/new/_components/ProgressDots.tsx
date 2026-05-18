import React from "react";
import type { WizardStep } from "@/lib/store/wizardStore";

const labels = ["核心方向", "灵感合成", "决策矩阵", "圣经合成", "最终核对"];

export function ProgressDots({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center justify-between w-full">
      {labels.map((label, index) => {
        const current = index + 1 === step;
        const done = index + 1 < step;

        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className={`font-serif text-base leading-none transition-colors duration-300 ${
                  current ? "text-text-primary" : done ? "text-accent" : "text-text-dim/40"
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <span
                className={`hidden md:inline text-[10px] font-bold uppercase tracking-[0.18em] transition-colors duration-300 ${
                  current ? "text-text-primary" : done ? "text-text-muted" : "text-text-dim/50"
                }`}
              >
                {label}
              </span>
            </div>

            {index < labels.length - 1 && (
              <div className="h-px flex-1 mx-2 md:mx-3 bg-border-subtle relative overflow-hidden" aria-hidden="true">
                <div
                  className={`absolute inset-0 bg-accent transition-transform duration-700 ease-out ${
                    done ? "translate-x-0" : current ? "-translate-x-1/2" : "-translate-x-full"
                  }`}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
