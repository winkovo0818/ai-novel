import type { WizardStep } from "@/lib/store/wizardStore";

const labels = ["作品方向", "生成设定", "最终核对"];

function displayStep(step: WizardStep) {
  if (step >= 5) return 3;
  if (step >= 4) return 2;
  return 1;
}

export function ProgressDots({ step }: { step: WizardStep }) {
  const currentStep = displayStep(step);

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="grid min-w-[420px] grid-cols-3 overflow-hidden rounded-lg border border-border-subtle bg-secondary/65 shadow-sm">
        {labels.map((label, index) => {
          const stepNumber = index + 1;
          const current = stepNumber === currentStep;
          const done = stepNumber < currentStep;

          return (
            <div
              key={label}
              className={`grid min-h-[52px] grid-cols-[auto_1fr] items-center gap-3 border-r border-border-subtle px-4 last:border-r-0 ${
                current ? "bg-white" : done ? "bg-white/55" : ""
              }`}
              aria-current={current ? "step" : undefined}
            >
              <span
                className={`font-serif text-2xl leading-none tracking-normal transition ${
                  current ? "text-text-primary" : done ? "text-accent" : "text-text-dim/45"
                }`}
              >
                {String(stepNumber).padStart(2, "0")}
              </span>
              <span
                className={`truncate text-[11px] font-black uppercase tracking-[0.1em] transition ${
                  current ? "text-text-primary" : done ? "text-text-secondary" : "text-text-dim/55"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
