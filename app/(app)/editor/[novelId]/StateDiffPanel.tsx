"use client";

import type { StateDiff } from "@/lib/validation/schemas";

interface StateDiffPanelProps {
  loading: boolean;
  error?: string;
  diff?: StateDiff;
  onClose: () => void;
  onAccept: (diff: StateDiff) => void;
}

export function StateDiffPanel({ loading, error, diff, onClose, onAccept }: StateDiffPanelProps) {
  const hasChanges = diff && (
    diff.character_updates.length > 0 ||
    diff.timeline_events.length > 0 ||
    diff.plot_thread_updates.length > 0 ||
    diff.new_entities.length > 0
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-70">
              State Diff / 状态变更
            </p>
            <h3 className="text-lg font-serif font-bold text-text-primary">本章状态分析</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {loading && (
            <div className="text-center py-12 text-sm text-text-muted flex flex-col items-center gap-3">
              <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI 正在分析本章状态变更...
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          {!loading && !error && diff && !hasChanges && (
            <div className="text-center py-12 text-sm text-text-muted">
              <svg className="w-8 h-8 mx-auto mb-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              未发现明显状态变更
            </div>
          )}

          {!loading && !error && diff && hasChanges && (
            <div className="space-y-6">
              {diff.character_updates.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    角色状态更新
                  </h4>
                  <div className="space-y-3">
                    {diff.character_updates.map((update, i) => (
                      <div key={i} className="p-4 bg-secondary/20 border border-border-subtle rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-text-primary">{update.name}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                            update.confidence === "high" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            update.confidence === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-secondary text-text-muted border-border-strong"
                          }`}>
                            {update.confidence}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {Object.entries(update.changes).map(([key, value]) => (
                            <div key={key} className="text-[11px] text-text-secondary flex items-center gap-2">
                              <span className="text-text-muted">{key}:</span>
                              <span className="font-medium text-text-primary">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {diff.timeline_events.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    时间线事件
                  </h4>
                  <div className="space-y-3">
                    {diff.timeline_events.map((event, i) => (
                      <div key={i} className="p-4 bg-secondary/20 border border-border-subtle rounded-xl">
                        <p className="text-sm font-medium text-text-primary">{event.event}</p>
                        {event.impact && <p className="text-[11px] text-text-secondary mt-1">影响：{event.impact}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {diff.plot_thread_updates.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    线索推进
                  </h4>
                  <div className="space-y-3">
                    {diff.plot_thread_updates.map((thread, i) => (
                      <div key={i} className="p-4 bg-secondary/20 border border-border-subtle rounded-xl">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-text-primary">{thread.title}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                            thread.status === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            thread.status === "progressing" ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-secondary text-text-muted border-border-strong"
                          }`}>
                            {thread.status}
                          </span>
                        </div>
                        {thread.notes && <p className="text-[11px] text-text-secondary">{thread.notes}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {diff.new_entities.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    新实体
                  </h4>
                  <div className="space-y-3">
                    {diff.new_entities.map((entity, i) => (
                      <div key={i} className="p-4 bg-secondary/20 border border-border-subtle rounded-xl">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold uppercase tracking-wider border border-primary/10">{entity.type}</span>
                          <span className="text-sm font-bold text-text-primary">{entity.name}</span>
                        </div>
                        <p className="text-[11px] text-text-secondary">{entity.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {!loading && !error && diff && hasChanges && (
          <div className="p-6 border-t border-border-subtle bg-secondary/10 flex gap-3">
            <button
              onClick={() => onAccept(diff)}
              className="flex-1 btn-primary text-xs font-bold py-3 gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              采纳并更新设定
            </button>
            <button
              onClick={onClose}
              className="flex-1 btn-secondary text-xs font-bold py-3"
            >
              跳过
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
