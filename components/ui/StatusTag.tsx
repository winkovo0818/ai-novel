import React from "react";

type StatusType =
  | "idle"
  | "clean"
  | "dirty"
  | "drafting"
  | "saving"
  | "saved"
  | "done"
  | "conflict"
  | "offline"
  | "error"
  | "ai";

interface StatusTagProps {
  type: StatusType;
  label?: string;
  className?: string;
}

export function StatusTag({ type, label, className = "" }: StatusTagProps) {
  const styles: Record<StatusType, { bg: string; text: string; dot?: string; animate?: string }> = {
    idle: { bg: "bg-secondary/80", text: "text-text-secondary" },
    clean: { bg: "bg-secondary/80", text: "text-text-secondary" },
    dirty: { bg: "bg-amber-500/10", text: "text-amber-700", dot: "bg-amber-500" },
    drafting: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary", animate: "animate-pulse" },
    saving: { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500", animate: "animate-pulse" },
    saved: { bg: "bg-emerald-500/10", text: "text-emerald-700", dot: "bg-emerald-500" },
    done: { bg: "bg-emerald-500/10", text: "text-emerald-700", dot: "bg-emerald-500" },
    conflict: { bg: "bg-amber-500/10", text: "text-amber-800", dot: "bg-amber-500" },
    offline: { bg: "bg-red-500/10", text: "text-red-700", dot: "bg-red-500" },
    error: { bg: "bg-red-500/10", text: "text-red-700", dot: "bg-red-500" },
    ai: { bg: "bg-violet-500/10", text: "text-violet-700", dot: "bg-violet-500" },
  };

  const current = styles[type];
  const defaultLabels: Record<StatusType, string> = {
    idle: "就绪",
    clean: "已同步",
    dirty: "未保存",
    drafting: "正在生成",
    saving: "正在保存",
    saved: "已保存",
    done: "已完成",
    conflict: "版本冲突",
    offline: "离线",
    error: "需要处理",
    ai: "写作辅助",
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
