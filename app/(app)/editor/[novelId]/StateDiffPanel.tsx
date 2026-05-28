"use client";

import { useEffect, useMemo, useState } from "react";
import {
  countSelectedStateDiffItems,
  createStateDiffSelection,
  filterStateDiff,
  type StateDiffSection,
  type StateDiffSelection,
  type StateDiffConflictWarning,
} from "@/lib/validation/stateDiffMerge";
import type { StateDiff } from "@/lib/validation/schemas";

interface StateDiffPanelProps {
  loading: boolean;
  error?: string;
  diff?: StateDiff;
  warnings?: StateDiffConflictWarning[];
  onClose: () => void;
  onAccept: (diff: StateDiff) => void;
}

export function StateDiffPanel({ loading, error, diff, warnings = [], onClose, onAccept }: StateDiffPanelProps) {
  const [selection, setSelection] = useState<StateDiffSelection>(() =>
    diff ? createStateDiffSelection(diff) : createEmptySelection(),
  );

  useEffect(() => {
    setSelection(diff ? createStateDiffSelection(diff) : createEmptySelection());
  }, [diff]);

  const hasChanges = diff && (
    diff.character_updates.length > 0 ||
    diff.timeline_events.length > 0 ||
    diff.plot_thread_updates.length > 0 ||
    diff.new_entities.length > 0
  );
  const totalItems = useMemo(() => countStateDiffItems(diff), [diff]);
  const selectedItems = countSelectedStateDiffItems(selection);

  const toggleItem = (section: StateDiffSection, index: number) => {
    setSelection((current) => ({
      ...current,
      [section]: current[section].includes(index)
        ? current[section].filter((selectedIndex) => selectedIndex !== index)
        : [...current[section], index].sort((a, b) => a - b),
    }));
  };

  const selectAll = () => {
    if (diff) setSelection(createStateDiffSelection(diff));
  };

  const clearSelection = () => {
    setSelection(createEmptySelection());
  };

  const acceptSelected = () => {
    if (!diff || selectedItems === 0) return;
    onAccept(filterStateDiff(diff, selection));
  };

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
            {!loading && !error && diff && hasChanges && (
              <p className="mt-1 text-[11px] font-medium text-text-muted">
                已选择 {selectedItems} / {totalItems} 项
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
            aria-label="关闭"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {loading && (
            <div className="text-center py-12 text-sm text-text-muted flex flex-col items-center gap-3">
              <svg aria-hidden="true" className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
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
              <svg aria-hidden="true" className="w-8 h-8 mx-auto mb-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              未发现明显状态变更
            </div>
          )}

          {!loading && !error && diff && hasChanges && (
            <div className="space-y-6">
              {warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <svg aria-hidden="true" className="h-4 w-4 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    </svg>
                    <span className="text-[11px] font-bold text-amber-900">检测到 {warnings.length} 条需要确认的状态冲突</span>
                  </div>
                  <ul className="space-y-1.5">
                    {warnings.map((warning, index) => (
                      <li key={`${warning.type}-${index}`} className="text-[11px] leading-relaxed text-amber-900/85">
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-secondary/20 px-4 py-3">
                <span className="text-[11px] font-bold text-text-secondary">选择要写入 Story State 的变更</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[10px] font-bold text-primary hover:text-primary-hover transition-colors"
                  >
                    全选
                  </button>
                  <span className="h-3 w-px bg-border-strong" />
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[10px] font-bold text-text-muted hover:text-text-primary transition-colors"
                  >
                    清空
                  </button>
                </div>
              </div>

              {diff.character_updates.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    角色状态更新
                  </h4>
                  <div className="space-y-3">
                    {diff.character_updates.map((update, i) => (
                      <label key={i} className={itemClassName(selection.character_updates.includes(i))}>
                        <input
                          type="checkbox"
                          checked={selection.character_updates.includes(i)}
                          onChange={() => toggleItem("character_updates", i)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-primary focus:ring-primary/20"
                          aria-label={`选择角色状态更新：${update.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3 mb-2">
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
                      </label>
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
                      <label key={i} className={itemClassName(selection.timeline_events.includes(i))}>
                        <input
                          type="checkbox"
                          checked={selection.timeline_events.includes(i)}
                          onChange={() => toggleItem("timeline_events", i)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-primary focus:ring-primary/20"
                          aria-label={`选择时间线事件：${event.event}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">{event.event}</p>
                          {event.impact && <p className="text-[11px] text-text-secondary mt-1">影响：{event.impact}</p>}
                        </div>
                      </label>
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
                      <label key={i} className={itemClassName(selection.plot_thread_updates.includes(i))}>
                        <input
                          type="checkbox"
                          checked={selection.plot_thread_updates.includes(i)}
                          onChange={() => toggleItem("plot_thread_updates", i)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-primary focus:ring-primary/20"
                          aria-label={`选择线索推进：${thread.title}`}
                        />
                        <div className="min-w-0 flex-1">
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
                      </label>
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
                      <label key={i} className={itemClassName(selection.new_entities.includes(i))}>
                        <input
                          type="checkbox"
                          checked={selection.new_entities.includes(i)}
                          onChange={() => toggleItem("new_entities", i)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-primary focus:ring-primary/20"
                          aria-label={`选择新实体：${entity.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold uppercase tracking-wider border border-primary/10">{entity.type}</span>
                            <span className="text-sm font-bold text-text-primary">{entity.name}</span>
                          </div>
                          <p className="text-[11px] text-text-secondary">{entity.description}</p>
                        </div>
                      </label>
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
              onClick={acceptSelected}
              disabled={selectedItems === 0}
              className="flex-1 btn-primary text-xs font-bold py-3 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              采纳选中变更
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

function createEmptySelection(): StateDiffSelection {
  return {
    character_updates: [],
    timeline_events: [],
    plot_thread_updates: [],
    new_entities: [],
  };
}

function countStateDiffItems(diff?: StateDiff): number {
  if (!diff) return 0;
  return (
    diff.character_updates.length +
    diff.timeline_events.length +
    diff.plot_thread_updates.length +
    diff.new_entities.length
  );
}

function itemClassName(selected: boolean): string {
  return [
    "flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors",
    selected
      ? "bg-secondary/20 border-border-subtle"
      : "bg-white border-border-subtle/70 opacity-65 hover:opacity-100",
  ].join(" ");
}
