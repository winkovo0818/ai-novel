import React from "react";

type StatusType = "idle" | "drafting" | "saving" | "done" | "error" | "ai";

interface StatusTagProps {
  type: StatusType;
  label?: string;
  className?: string;
}

export function StatusTag({ type, label, className = "" }: StatusTagProps) {
  const styles: Record<StatusType, { bg: string; text: string; dot?: string; animate?: string }> = {
    idle: { bg: "bg-secondary/80", text: "text-text-secondary" },
    drafting: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary", animate: "animate-pulse" },
    saving: { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500", animate: "animate-pulse" },
    done: { bg: "bg-emerald-500/10", text: "text-emerald-700", dot: "bg-emerald-500" },
    error: { bg: "bg-red-500/10", text: "text-red-700", dot: "bg-red-500" },
    ai: { bg: "bg-violet-500/10", text: "text-violet-700", dot: "bg-violet-500" },
  };

  const current = styles[type];
  const defaultLabels: Record<StatusType, string> = {
    idle: "就绪",
    drafting: "AI 协作中",
    saving: "正在保存",
    done: "已完成",
    error: "异常",
    ai: "AI 辅助",
  };

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-transparent transition ${current.bg} ${current.text} ${className}`}>
      {current.dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${current.dot} ${current.animate || ""}`} />
      )}
      {label || defaultLabels[type]}
    </span>
  );
}
