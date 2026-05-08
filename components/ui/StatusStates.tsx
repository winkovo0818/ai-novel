import React from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-64 text-center border-2 border-dashed border-border-strong rounded-lg bg-surface/50">
      {icon && <div className="mb-24 text-text-muted">{icon}</div>}
      <h3 className="text-xl font-semibold text-text-primary mb-8">{title}</h3>
      <p className="text-sm text-text-secondary mb-24 max-w-sm">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export function LoadingState({ message = "正在加载数据..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-64 text-center">
      <div className="mb-24 flex gap-4">
        <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
      </div>
      <p className="text-sm font-medium text-text-secondary animate-pulse uppercase tracking-[0.1em]">
        {message}
      </p>
    </div>
  );
}
