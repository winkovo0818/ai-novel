import React from "react";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { ConsistencyResult } from "./useChapterActions";
import { BeatSheetPanel, type BeatItem } from "./BeatSheetPanel";

interface AIPanelProps {
  show: boolean;
  onClose(): void;
  bible: BibleDraft;
  status: "idle" | "saving" | "saved" | "drafting" | "error";
  message?: string;
  selectedOutline?: { summary?: string } | null;
  selectedChapterIndex: number;
  chapterTitle: string;
  onDraftChapter(): void;
  onRunConsistency(): void;
  consistencyRunning: boolean;
  consistencyResult?: ConsistencyResult;
  consistencyError?: string;
  onGenerateStateDiff(): void;
  stateDiffLoading: boolean;
  // Beat Sheet
  beats: BeatItem[];
  beatsLoading: boolean;
  beatsError?: string;
  onGenerateBeats(chapterGoal?: string): void;
  onUpdateBeats(beats: BeatItem[]): void;
  onClearBeats(): void;
  onDraftWithBeats(): void;
}

function AIActionBtn({ label, icon, onClick, disabled }: { label: string; icon: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-3 p-4 bg-white border border-border-subtle hover:border-primary/40 hover:bg-primary/5 rounded-2xl transition-all duration-300 group disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
    >
      <span className="text-xl group-hover:scale-110 transition-transform duration-300">{icon}</span>
      <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider group-hover:text-primary transition-colors">{label}</span>
    </button>
  );
}

export function AIPanel({
  show,
  onClose,
  bible,
  status,
  message,
  selectedOutline,
  selectedChapterIndex,
  chapterTitle,
  onDraftChapter,
  onRunConsistency,
  consistencyRunning,
  consistencyResult,
  consistencyError,
  onGenerateStateDiff,
  stateDiffLoading,
  beats,
  beatsLoading,
  beatsError,
  onGenerateBeats,
  onUpdateBeats,
  onClearBeats,
  onDraftWithBeats,
}: AIPanelProps) {
  return (
    <aside
      className={`bg-white border-l border-border-subtle h-full flex flex-col transition-all duration-500 ease-in-out shadow-premium relative z-20 ${
        show ? "w-96 opacity-100" : "w-0 opacity-0 invisible"
      }`}
    >
      <div className="w-96 h-full flex flex-col flex-shrink-0">
        <header className="px-6 py-5 border-b border-border-subtle flex items-center justify-between bg-secondary/20">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-text-primary flex items-center justify-center text-white shadow-premium">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-text-primary uppercase tracking-[0.2em]">灵感助手</span>
              <span className="text-[9px] font-medium text-text-dim uppercase tracking-wider">AI Creative Engine</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl text-text-dim hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
          <section className="animate-fade-in">
            <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4">创作指令 / COMMANDS</h3>
            <div className="grid grid-cols-2 gap-3">
              <AIActionBtn label="全文起草" icon="⚡" onClick={onDraftChapter} disabled={status === "drafting"} />
              <AIActionBtn label="文本润色" icon="✨" />
              <AIActionBtn label="细节扩充" icon="📝" />
              <AIActionBtn label="逻辑审计" icon="🔍" onClick={onRunConsistency} disabled={consistencyRunning} />
              <AIActionBtn label="时态追踪" icon="📊" onClick={onGenerateStateDiff} disabled={stateDiffLoading} />
            </div>
          </section>

          <section className="animate-fade-in delay-100">
            <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4">叙事蓝图 / BLUEPRINT</h3>
            <div className="p-5 bg-secondary/30 rounded-2xl text-[13px] text-text-secondary leading-relaxed border border-border-subtle/50 relative overflow-hidden italic shadow-inner">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/30" />
              {selectedOutline?.summary || "当前章节暂无梗概引导，您可以直接创作。"}
            </div>
          </section>

          <section className="animate-fade-in delay-100">
            <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4">章节节拍 / BEATS</h3>
            <BeatSheetPanel
              chapterIndex={selectedChapterIndex}
              chapterTitle={chapterTitle}
              available={selectedChapterIndex >= 2}
              beats={beats}
              loading={beatsLoading}
              error={beatsError}
              onGenerate={onGenerateBeats}
              onUpdateBeats={onUpdateBeats}
              onClear={onClearBeats}
              onDraft={onDraftWithBeats}
            />
          </section>

          <section className="animate-fade-in delay-200">
            <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4">活跃角色 / CAST</h3>
            <div className="space-y-3">
              {bible.characters.slice(0, 2).map(char => (
                <div key={char.name} className="p-5 bg-white border border-border-subtle hover:border-primary/20 rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">{char.name}</span>
                    <span className="text-[9px] px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold uppercase tracking-wider ring-1 ring-primary/10">{char.role}</span>
                  </div>
                  <p className="text-[12px] text-text-secondary line-clamp-2 leading-relaxed opacity-80 group-hover:line-clamp-none transition-all duration-500">
                    {char.personality}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {(consistencyRunning || consistencyResult || consistencyError) && (
            <section className="animate-fade-in">
              <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4">一致性审计报告</h3>
              {consistencyRunning && (
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 text-xs text-primary flex items-center gap-3">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="font-bold">AI 正在审阅全文设定的一致性...</span>
                </div>
              )}
              {!consistencyRunning && consistencyError && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
                  {consistencyError}
                </div>
              )}
              {!consistencyRunning && consistencyResult?.consistent && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-bold">逻辑严密，暂未发现设定矛盾。</span>
                </div>
              )}
              {!consistencyRunning && consistencyResult && !consistencyResult.consistent && (
                <ul className="space-y-3">
                  {(consistencyResult.issues ?? []).map((issue, i) => (
                    <li key={i} className="p-5 rounded-2xl bg-amber-50 border border-amber-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-amber-200/50 text-amber-900 rounded-lg font-bold uppercase tracking-wider text-[9px]">
                          {issue.type}
                        </span>
                        <span className="font-bold text-[11px] text-amber-900">第 {issue.chapter} 章冲突</span>
                      </div>
                      <p className="leading-relaxed text-[12px] text-amber-900/80">{issue.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {message && (
            <div className={`p-5 rounded-2xl text-xs font-bold animate-slide-in shadow-sm ${
              status === "error" ? "bg-red-50 text-red-600 border border-red-100" : "bg-primary/5 text-primary border border-primary/10"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${status === "error" ? "bg-red-500" : "bg-primary animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]"}`} />
                {message}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border-subtle bg-white shadow-premium">
          <button
            className="w-full btn-primary py-3.5 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-3 group active:scale-95 transition-all"
            onClick={onDraftChapter}
            disabled={status === "drafting"}
          >
            {status === "drafting" ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="uppercase tracking-widest text-xs font-bold">思考引擎运行中...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                <span className="uppercase tracking-widest text-xs font-bold">开启智能起草协议</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
