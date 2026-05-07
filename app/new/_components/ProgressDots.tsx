import type { WizardStep } from "@/lib/store/wizardStore";

const labels = ["基础", "灵感", "追问", "生成", "审阅"];

export function ProgressDots({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center gap-3">
      {labels.map((label, index) => {
        const current = index + 1 === step;
        const done = index + 1 < step;
        return (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span
              className={`grid h-8 w-8 place-items-center rounded-full border ${
                current || done
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-300 text-neutral-500"
              }`}
            >
              {index + 1}
            </span>
            <span className={current ? "font-medium text-neutral-950" : "text-neutral-500"}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
