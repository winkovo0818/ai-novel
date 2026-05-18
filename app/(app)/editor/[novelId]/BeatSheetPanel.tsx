"use client";

import { useState } from "react";

export interface BeatItem {
  index: number;
  description: string;
}

interface BeatSheetPanelProps {
  chapterIndex: number;
  chapterTitle: string;
  available: boolean;
  beats: BeatItem[];
  loading: boolean;
  error?: string;
  onGenerate(chapterGoal?: string): void;
  onUpdateBeats(beats: BeatItem[]): void;
  onClear(): void;
  onDraft(): void;
}

export function BeatSheetPanel({
  chapterIndex,
  chapterTitle,
  available,
  beats,
  loading,
  error,
  onGenerate,
  onUpdateBeats,
  onClear,
  onDraft,
}: BeatSheetPanelProps) {
  const [goal, setGoal] = useState("");

  if (!available) {
    return (
      <section className="border border-border-subtle rounded-2xl bg-secondary/20 p-5 text-[12px] text-text-muted leading-relaxed">
        第 1 章使用 Bible 内置节拍，从第 2 章起可生成章节专属节奏。
      </section>
    );
  }

  if (beats.length === 0 && !loading) {
    return (
      <section className="border border-border-subtle rounded-2xl bg-white p-5 space-y-4 shadow-sm">
        <div>
          <h4 className="text-[13px] font-bold text-text-primary mb-1">规划章节节奏</h4>
          <p className="text-[11px] text-text-dim leading-relaxed">
            先生成 5-8 个场景锚点，再按节奏逐段写作。适合需要规划叙事走向的章节。
          </p>
        </div>
        <div className="relative group">
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="本章节核心目标（可选）"
            className="w-full text-[12px] bg-secondary/30 border border-transparent rounded-xl px-4 py-2.5 focus:border-primary/30 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition shadow-inner"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-dim opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            SCENE GOAL
          </div>
        </div>
        {error && <p className="text-[11px] text-red-600 font-bold animate-shake">{error}</p>}
        <button
          onClick={() => onGenerate(goal.trim() || undefined)}
          className="w-full btn-primary text-xs font-bold py-3 rounded-xl shadow-lg shadow-primary/10 flex items-center justify-center gap-2 group active:scale-95 transition"
        >
          <svg aria-hidden="true" className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          规划章节节奏
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="border border-border-subtle rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="relative w-10 h-10 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-primary/10 border-b-primary animate-spin-slow" />
        </div>
        <p className="text-[12px] font-bold text-text-dim uppercase tracking-widest">
          正在构思叙事路径...
        </p>
      </section>
    );
  }

  return (
    <section className="border border-border-subtle rounded-2xl bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 bg-primary rounded-full" />
          <h4 className="text-[13px] font-bold text-text-primary tracking-tight">章节节奏 / BEATS</h4>
        </div>
        <button
          onClick={onClear}
          className="text-[10px] font-bold text-text-dim hover:text-red-500 uppercase tracking-wider transition-colors px-2 py-1 hover:bg-red-50 rounded-lg"
          title="清空当前节拍并重新生成"
        >
          RESET
        </button>
      </div>
      <div className="space-y-2">
        {beats.map((beat, i) => (
          <div key={beat.index} className="flex gap-2.5 group/beat">
            <span className="text-[11px] font-bold text-primary bg-primary/5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 shadow-sm border border-primary/10">
              {beat.index}
            </span>
            <div className="flex-1 min-w-0">
              <textarea
                value={beat.description}
                onChange={(e) => {
                  const next = [...beats];
                  next[i] = { ...beat, description: e.target.value };
                  onUpdateBeats(next);
                }}
                rows={3}
                className="w-full text-[13px] text-text-primary bg-secondary/10 border border-border-subtle/50 rounded-xl px-3.5 py-2.5 leading-relaxed focus:bg-white focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 transition resize-none"
              />
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-600 font-bold bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
      <p className="text-[10px] text-text-dim text-center mb-2">按已生成节拍的结构逐段写作</p>
      <button
        onClick={onDraft}
        className="w-full btn-primary text-xs font-bold py-3.5 rounded-xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group active:scale-[0.98] transition"
      >
        <svg aria-hidden="true" className="w-4 h-4 group-hover:animate-bounce" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
        执行节拍引导起草
      </button>
    </section>
  );
}