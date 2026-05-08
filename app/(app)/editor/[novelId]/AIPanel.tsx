import React from "react";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { ConsistencyResult } from "./useChapterEditor";

interface AIPanelProps {
  show: boolean;
  onClose(): void;
  bible: BibleDraft;
  status: "idle" | "saving" | "saved" | "drafting" | "error";
  message?: string;
  selectedOutline?: { summary?: string } | null;
  onDraftChapter(): void;
  onRunConsistency(): void;
  consistencyRunning: boolean;
  consistencyResult?: ConsistencyResult;
  consistencyError?: string;
  onGenerateStateDiff(): void;
  stateDiffLoading: boolean;
}

function AIActionBtn({ label, icon, onClick, disabled }: { label: string; icon: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-4 p-12 bg-background border border-border-subtle hover:border-primary/50 hover:bg-primary/5 rounded-sm transition-all group disabled:opacity-50"
    >
      <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-[10px] font-bold text-text-secondary group-hover:text-primary">{label}</span>
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
  onDraftChapter,
  onRunConsistency,
  consistencyRunning,
  consistencyResult,
  consistencyError,
  onGenerateStateDiff,
  stateDiffLoading,
}: AIPanelProps) {
  return (
    <aside
      className={`bg-white border-l border-border-strong transition-all duration-500 ease-out shadow-2xl z-20 ${
        show ? "w-[360px] opacity-100" : "w-0 opacity-0 invisible"
      }`}
    >
      <div className="h-full flex flex-col w-[360px]">
        <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-secondary/20">
          <span className="text-[11px] font-bold text-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center text-white shadow-sm">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </div>
            AI 灵感引擎
          </span>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
          <section className="animate-fade-in-up">
            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">智能指令</h3>
            <div className="grid grid-cols-2 gap-3">
              <AIActionBtn label="全文续写" icon="⚡" onClick={onDraftChapter} disabled={status === "drafting"} />
              <AIActionBtn label="文本润色" icon="✨" />
              <AIActionBtn label="扩充细节" icon="📝" />
              <AIActionBtn label="逻辑审计" icon="🔍" onClick={onRunConsistency} disabled={consistencyRunning} />
              <AIActionBtn label="状态追踪" icon="📊" onClick={onGenerateStateDiff} disabled={stateDiffLoading} />
            </div>
          </section>

          <section className="animate-fade-in-up delay-100">
            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">本章叙事蓝图</h3>
            <div className="p-5 bg-secondary/20 border border-border-strong rounded-xl text-[13px] text-text-secondary leading-relaxed italic relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
              {selectedOutline?.summary || "当前章节暂无梗概引导"}
            </div>
          </section>

          <section className="animate-fade-in-up delay-200">
            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">活跃角色设定</h3>
            <div className="space-y-3">
              {bible.characters.slice(0, 2).map(char => (
                <div key={char.name} className="p-5 bg-white border border-border-subtle hover:border-primary/30 rounded-xl transition-all duration-300 shadow-sm hover:shadow-md group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-text-primary">{char.name}</span>
                    <span className="text-[9px] px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold uppercase tracking-wider border border-primary/10">{char.role}</span>
                  </div>
                  <p className="text-[12px] text-text-secondary line-clamp-2 leading-relaxed opacity-80 group-hover:line-clamp-none transition-all">
                    {char.personality}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {(consistencyRunning || consistencyResult || consistencyError) && (
            <section className="animate-fade-in-up">
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">逻辑审计报告</h3>
              {consistencyRunning && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs text-primary flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  AI 正在审阅全文一致性...
                </div>
              )}
              {!consistencyRunning && consistencyError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">
                  {consistencyError}
                </div>
              )}
              {!consistencyRunning && consistencyResult?.consistent && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  暂未发现矛盾
                </div>
              )}
              {!consistencyRunning && consistencyResult && !consistencyResult.consistent && (
                <ul className="space-y-2">
                  {(consistencyResult.issues ?? []).map((issue, i) => (
                    <li key={i} className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-amber-200/60 text-amber-900 rounded-full font-bold uppercase tracking-wider text-[9px]">
                          {issue.type}
                        </span>
                        <span className="font-bold">第 {issue.chapter} 章</span>
                      </div>
                      <p className="leading-relaxed text-amber-900/80">{issue.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {message && (
            <div className={`p-4 rounded-xl text-xs font-bold animate-slide ${
              status === "error" ? "bg-red-50 text-red-600 border border-red-100" : "bg-primary/5 text-primary border border-primary/10"
            }`}>
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full ${status === "error" ? "bg-red-500" : "bg-primary animate-pulse"}`} />
                {message}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border-subtle bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          <button
            className="w-full btn-primary py-3.5 shadow-xl shadow-primary/20 flex items-center justify-center gap-3"
            onClick={onDraftChapter}
            disabled={status === "drafting"}
          >
            {status === "drafting" ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>AI 思考中...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                <span>立即启动起草协议</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
