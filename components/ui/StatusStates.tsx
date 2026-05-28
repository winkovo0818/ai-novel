import React from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  size?: "compact" | "default";
  className?: string;
}

export function EmptyState({ title, description, icon, action, size = "default", className = "" }: EmptyStateProps) {
  const compact = size === "compact";
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 text-center border-2 border-dashed border-border-strong rounded-3xl bg-white/40 animate-fade-in ${
        compact ? "py-8" : "py-20"
      } ${className}`}
    >
      {icon && <div className={compact ? "mb-4" : "mb-6"}>{icon}</div>}
      <h3 className={`${compact ? "text-base" : "text-xl"} font-bold text-text-primary mb-2`}>{title}</h3>
      <p className={`${compact ? "text-xs mb-0" : "text-sm mb-8"} text-text-secondary max-w-xs mx-auto leading-relaxed`}>{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingState({ message = "数据加载中" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="mb-6 flex gap-2">
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
      </div>
      <p className="text-[11px] font-bold text-text-dim uppercase tracking-[0.2em]">
        {message}
      </p>
    </div>
  );
}

export function ErrorState({ title = "加载失败", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="card border-red-100 bg-red-50/30 p-12 text-center animate-fade-in">
      <div className="h-12 w-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-600 shadow-sm">
        <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h4 className="text-base font-bold text-red-900 mb-2">{title}</h4>
      <p className="text-sm text-red-700/70 mb-8 max-w-sm mx-auto">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary bg-white border-red-200 text-red-700 hover:bg-red-50">
          尝试重新连接
        </button>
      )}
    </div>
  );
}

/**
 * Long-running generation state (onboarding Bible SSE, full-novel
 * consistency, etc). Distinct from LoadingState because the user is
 * waiting on an LLM call that takes 10-60s — we surface a slow-cadence
 * progress affordance instead of bouncing dots.
 */
export function GeneratingState({
  title = "AI 正在生成",
  message,
  /** Optional 0-100 progress hint. Renders a thin progress bar when set. */
  percent,
}: {
  title?: string;
  message?: string;
  percent?: number;
}) {
  const clamped = typeof percent === "number" ? Math.min(100, Math.max(0, percent)) : undefined;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      <div className="relative h-12 w-12 mb-6">
        <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
        <span className="absolute inset-2 rounded-full bg-primary/30" />
        <svg aria-hidden="true"
          className="absolute inset-0 w-12 h-12 animate-spin text-primary"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <h4 className="text-base font-bold text-text-primary mb-1">{title}</h4>
      {message && <p className="text-sm text-text-secondary mb-4 max-w-sm mx-auto">{message}</p>}
      {clamped !== undefined && (
        <div className="w-64 max-w-full mt-2">
          <progress
            className="progress-bar h-1.5 w-full"
            max={100}
            value={clamped}
            aria-label="生成进度"
          />
          <p className="mt-2 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] tabular-nums">
            {clamped.toFixed(0)}%
          </p>
        </div>
      )}
    </div>
  );
}
