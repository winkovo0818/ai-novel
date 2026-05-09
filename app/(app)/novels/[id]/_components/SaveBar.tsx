"use client";

interface SaveBarProps {
  dirty: boolean;
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
  onSave(): void;
}

/**
 * Sticky bottom bar for /novels/[id] section editors. Stays visible while
 * the user has unsaved changes; collapses into a quiet "已保存" badge when
 * everything is in sync. Pulled out so the three sibling editors share the
 * exact same affordance.
 */
export function SaveBar({ dirty, status, error, onSave }: SaveBarProps) {
  const showBar = dirty || status === "saving" || status === "error" || status === "saved";
  if (!showBar) return null;

  return (
    <div className="fixed bottom-0 left-[var(--width-sidebar)] right-0 bg-white border-t border-border-strong shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-30 animate-fade-in-up">
      <div className="max-w-6xl mx-auto px-8 md:px-12 lg:px-16 py-4 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          {status === "saving" && (
            <p className="text-[12px] text-text-secondary flex items-center gap-2">
              <svg className="w-3.5 h-3.5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              保存中…
            </p>
          )}
          {status === "saved" && !dirty && (
            <p className="text-[12px] text-emerald-600 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              已保存，下次 AI 起草将使用新设定
            </p>
          )}
          {status === "error" && (
            <p className="text-[12px] text-red-600">保存失败：{error}</p>
          )}
          {dirty && status !== "saving" && (
            <p className="text-[12px] text-text-secondary">有未保存修改</p>
          )}
        </div>

        <button
          onClick={onSave}
          disabled={!dirty || status === "saving"}
          className="btn-primary text-xs font-bold py-2.5 px-6 disabled:opacity-50"
        >
          {status === "saving" ? "保存中…" : "保存修改"}
        </button>
      </div>
    </div>
  );
}
