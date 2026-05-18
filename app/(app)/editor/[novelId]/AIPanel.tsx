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

function AIActionBtn({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-2.5 p-4 bg-white border border-border-subtle hover:border-primary/40 hover:bg-primary/5 rounded-2xl transition duration-300 group disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-95"
    >
      <div className="p-2.5 rounded-xl bg-secondary/50 group-hover:bg-primary/10 group-hover:text-primary transition-colors text-text-dim">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider group-hover:text-primary transition-colors">{label}</span>
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
      className={`bg-white border-l border-border-subtle h-full flex flex-col transition duration-500 ease-in-out shadow-premium relative z-20 ${
        show ? "w-96 opacity-100" : "w-0 opacity-0 invisible"
      }`}
    >
      <div className="w-96 h-full flex flex-col flex-shrink-0">
        <header className="px-6 py-5 border-b border-border-subtle flex items-center justify-between bg-secondary/20 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-text-primary to-primary flex items-center justify-center text-white shadow-premium">
              <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-text-primary uppercase tracking-[0.2em]">灵感助手</span>
              <span className="text-[9px] font-medium text-text-dim uppercase tracking-wider mt-0.5">Neural Creative Engine</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="关闭 AI 创作助手" className="p-2 hover:bg-secondary rounded-xl text-text-dim hover:text-text-primary transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
          <section className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">创作指令 / COMMANDS</h3>
              <div className="h-px flex-1 bg-border-subtle ml-4 opacity-50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AIActionBtn 
                label="全文起草" 
                icon={<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>} 
                onClick={onDraftChapter} 
                disabled={status === "drafting"} 
              />
              <AIActionBtn 
                label="文本润色" 
                icon={<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>} 
              />
              <AIActionBtn 
                label="逻辑审计" 
                icon={<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>} 
                onClick={onRunConsistency} 
                disabled={consistencyRunning} 
              />
              <AIActionBtn 
                label="时态追踪" 
                icon={<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} 
                onClick={onGenerateStateDiff} 
                disabled={stateDiffLoading} 
              />
            </div>
          </section>

          <section className="animate-fade-in delay-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">叙事蓝图 / BLUEPRINT</h3>
              <div className="h-px flex-1 bg-border-subtle ml-4 opacity-50" />
            </div>
            <div className="p-5 bg-secondary/30 rounded-2xl text-[13px] text-text-secondary leading-relaxed border border-border-subtle/50 relative overflow-hidden shadow-inner group">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/30 group-hover:bg-primary transition-colors" />
              {selectedOutline?.summary || "当前章节暂无梗概引导，您可以直接创作。"}
            </div>
          </section>

          <section className="animate-fade-in delay-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">章节节奏 / BEATS</h3>
              <div className="h-px flex-1 bg-border-subtle ml-4 opacity-50" />
            </div>
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">活跃角色 / CAST</h3>
              <div className="h-px flex-1 bg-border-subtle ml-4 opacity-50" />
            </div>
            <div className="space-y-4">
              {bible.characters.slice(0, 3).map(char => (
                <div key={char.name} className="p-5 bg-white border border-border-subtle hover:border-primary/20 rounded-2xl transition duration-300 shadow-sm hover:shadow-md group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition group-hover:scale-110" />
                  <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">{char.name}</span>
                    <span className="text-[9px] px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold uppercase tracking-wider ring-1 ring-primary/10">{char.role}</span>
                  </div>
                  <p
                    className="text-[12px] text-text-secondary line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity duration-200 relative z-10"
                    title={char.personality}
                  >
                    {char.personality}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {(consistencyRunning || consistencyResult || consistencyError) && (
            <section className="animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">一致性审计报告</h3>
                <div className="h-px flex-1 bg-border-subtle ml-4 opacity-50" />
              </div>
              {consistencyRunning && (
                <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 text-xs text-primary flex items-center gap-3 animate-pulse">
                  <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="font-bold tracking-tight">AI 正在审阅全文设定的一致性…</span>
                </div>
              )}
              {!consistencyRunning && consistencyError && (
                <div className="p-5 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-600 font-bold flex items-center gap-2">
                  <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {consistencyError}
                </div>
              )}
              {!consistencyRunning && consistencyResult?.consistent && (
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 shadow-sm">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-bold">逻辑严密，暂未发现设定矛盾。</span>
                </div>
              )}
              {!consistencyRunning && consistencyResult && !consistencyResult.consistent && (
                <ul className="space-y-3">
                  {(consistencyResult.issues ?? []).map((issue, i) => (
                    <li key={i} className="p-5 rounded-2xl bg-amber-50 border border-amber-100 shadow-sm border-l-4 border-l-amber-400">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-amber-200/50 text-amber-900 rounded-lg font-bold uppercase tracking-wider text-[9px]">
                          {issue.type}
                        </span>
                        <span className="font-bold text-[11px] text-amber-900 tracking-tight">第 {issue.chapter} 章冲突</span>
                      </div>
                      <p className="leading-relaxed text-[12px] text-amber-900/80">{issue.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {message && (
            <div className={`p-5 rounded-2xl text-xs font-bold animate-slide-in shadow-lg ${
              status === "error" ? "bg-red-50 text-red-600 border border-red-100" : "bg-primary text-white border border-primary/20"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 rounded-full border-2 border-white ${status === "error" ? "bg-red-500" : "bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]"}`} />
                {message}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border-subtle bg-white shadow-premium">
          {selectedChapterIndex >= 2 && beats.length === 0 && status !== "drafting" && (
            <div className="mb-3 p-3 bg-primary/5 border border-primary/10 rounded-xl flex items-start gap-2.5">
              <svg aria-hidden="true" className="w-4 h-4 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-text-secondary leading-relaxed">建议先在上方「章节节奏」区块生成节拍，再逐段引导写作，效果更可控。</p>
            </div>
          )}
          <p className="text-[10px] text-text-dim text-center mb-2">基于 Bible 与大纲，一步生成完整章节</p>
          <button
            className="w-full btn-primary py-4 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-3 group active:scale-[0.98] transition relative overflow-hidden"
            onClick={onDraftChapter}
            disabled={status === "drafting"}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
            {status === "drafting" ? (
              <>
                <svg aria-hidden="true" className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="uppercase tracking-[0.15em] text-xs font-bold">思考引擎运行中…</span>
              </>
            ) : (
              <>
                <svg aria-hidden="true" className="w-5 h-5 group-hover:scale-110 group-hover:rotate-12 transition-transform" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                <span className="uppercase tracking-[0.15em] text-xs font-bold">直接起草全文</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

