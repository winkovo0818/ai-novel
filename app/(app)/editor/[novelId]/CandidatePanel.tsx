"use client";

import { useEffect, useState } from "react";
import { DiffView } from "@/components/ui/DiffView";

export type CandidateMode = "replace" | "append" | "insert" | "discard";

interface CandidateCriticIssue {
  type: string;
  severity: string;
  description: string;
  suggestion?: string;
}

export interface CandidateCriticResult {
  consistent: boolean;
  issues: CandidateCriticIssue[];
}

interface CandidatePanelProps {
  /** Streaming text accumulated so far, or final candidate. */
  content: string;
  /** True while SSE is still emitting; disables actions. */
  streaming: boolean;
  /** True after stream done, while critic is running. */
  criticLoading: boolean;
  /** True while AI is rewriting the candidate from critic suggestions. */
  revisionLoading?: boolean;
  criticResult?: CandidateCriticResult;
  criticError?: string;
  /** Multi-candidate list (server sends via SSE 'candidates' + 'candidate_delta' events). */
  candidates?: Array<{ id: string; label: string; content: string }>;
  /** Whether the editor currently holds a non-empty body the candidate would overwrite. */
  hasExistingContent: boolean;
  /** The current chapter body, used as the "before" side of the diff toggle. */
  currentContent: string;
  cursorPos: number | null;
  /** Status of the RAG retrieval used for this draft (success/empty/error). */
  retrievalStatus?: string;
  /** M3.4: actual memory chunks the model received (truncated text). */
  retrievedMemories?: Array<{ source: string; reason: string; score: number; text: string }>;
  /** Server-side retrieval error message, when status === "error". */
  retrievalError?: string;
  /** Error message from the draft SSE stream (timeout, moderation block, etc.). */
  streamError?: string;
  /** Whether the error is retryable (e.g. timeout) vs not (e.g. moderation). */
  streamErrorRetryable?: boolean;
  onAccept(mode: CandidateMode): void;
  onRevise?(): void;
  onFeedbackRevise?(instruction: string): void;
  onRetryDraft?(): void;
  onClose(): void;
}

export function CandidatePanel({
  content,
  streaming,
  criticLoading,
  revisionLoading = false,
  criticResult,
  criticError,
  hasExistingContent,
  currentContent,
  cursorPos,
  retrievalStatus,
  retrievedMemories,
  retrievalError,
  streamError,
  streamErrorRetryable,
  candidates,
  onAccept,
  onRevise,
  onFeedbackRevise,
  onRetryDraft,
  onClose,
}: CandidatePanelProps) {
  const [confirmingOverwrite, setConfirmingOverwrite] = useState<CandidateMode | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "diff">("preview");
  const [feedbackText, setFeedbackText] = useState("");
  // Active candidate tab when multi-candidate generation produces >1 result.
  const [activeCandidate, setActiveCandidate] = useState<string>("c0");
  const multiCandidate = (candidates?.length ?? 0) > 1;
  const [reviewedCandidates, setReviewedCandidates] = useState<Set<string>>(new Set());

  // c0 is the primary candidate — once critic completes successfully it counts as reviewed.
  const criticDone = Boolean(criticResult) && !criticError;
  useEffect(() => {
    if (!criticDone) return;
    setReviewedCandidates((prev) => {
      if (prev.has("c0")) return prev;
      const next = new Set(prev);
      next.add("c0");
      return next;
    });
  }, [criticDone]);

  const activeContent = multiCandidate
    ? candidates?.find((c) => c.id === activeCandidate)?.content ?? content
    : content;
  // When switching to the non-primary candidate, auto-trigger critic if
  // not already reviewed and critic is available.
  const handleCandidateSwitch = (id: string) => {
    setActiveCandidate(id);
    if (id !== "c0" && !reviewedCandidates.has(id) && !criticLoading && !streaming && onRevise) {
      onRevise();
      setReviewedCandidates((prev) => new Set(prev).add(id));
    }
  };

  const hasBlockingIssue = criticResult?.issues.some(
    (i) => i.severity === "critical" || i.severity === "major",
  );
  const charCount = content.replace(/\s/g, "").length;
  const canAccept = !streaming && !criticLoading && !revisionLoading;
  const canRevise = Boolean(onRevise && criticResult?.issues.length && !streaming && !criticLoading && !revisionLoading);
  const canFeedbackRevise = Boolean(onFeedbackRevise && !streaming && !criticLoading && !revisionLoading);

  const handleAccept = (mode: CandidateMode) => {
    if (mode === "discard") {
      onAccept(mode);
      return;
    }
    // Overwrite/insert/append require an extra confirm if critic flagged blocking issues
    // OR if replacing a non-trivial existing body.
    const needsConfirm =
      hasBlockingIssue ||
      (mode === "replace" && hasExistingContent);
    if (needsConfirm) {
      setConfirmingOverwrite(mode);
      return;
    }
    onAccept(mode);
  };

  const handleConfirmOverwrite = () => {
    if (confirmingOverwrite) onAccept(confirmingOverwrite);
    setConfirmingOverwrite(null);
  };

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 w-[480px] bg-white border-l border-border-strong shadow-2xl z-40 flex flex-col animate-slide-in-right"
    >
      <header className="flex items-center justify-between px-6 py-5 border-b border-border-subtle bg-secondary/20">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-70">
            AI Candidate / 候选稿
          </p>
          {(criticLoading || revisionLoading) && (
          <div className="mt-2 h-1 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary/60 via-primary to-primary/60 rounded-full animate-progress-slide" style={{ width: "40%" }} />
          </div>
        )}
          <h3 className="text-base font-serif font-bold text-text-primary mt-1 flex items-center gap-2">
            {streaming ? (
              <>
                <svg aria-hidden="true" className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>AI 正在生成…</span>
                <span className="text-text-muted font-sans text-[11px] font-normal animate-pulse">请等待流式输出</span>
              </>
            ) : revisionLoading ? (
              <>
                <svg aria-hidden="true" className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>AI 正在修订…</span>
                <span className="text-text-muted font-sans text-[11px] font-normal animate-pulse">模型思考中，可能需要 1–2 分钟</span>
              </>
            ) : criticLoading ? (
              <>
                <svg aria-hidden="true" className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>AI 正在审校…</span>
                <span className="text-text-muted font-sans text-[11px] font-normal animate-pulse">分析中，请稍候</span>
              </>
            ) : "候选稿就绪"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
          aria-label="关闭候选稿面板"
          disabled={streaming}
          title={streaming ? "生成中无法关闭，请等待完成或放弃" : "关闭"}
        >
          <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Retrieval status — small line above critic banner */}
      {retrievalStatus && retrievalStatus !== "success" && !streaming && (
        <div
          className={`px-6 py-2 text-[11px] border-b ${
            retrievalStatus === "error"
              ? "bg-amber-50 text-amber-800 border-amber-100"
              : "bg-secondary text-text-muted border-border-subtle"
          }`}
        >
          {retrievalStatus === "error"
            ? `记忆检索失败 · 本次起草未引用历史章节${retrievalError ? `（${retrievalError}）` : ""}`
            : "未检索到长程记忆 · 基于 Bible 与章节摘要生成"}
        </div>
      )}

      {/* M3.4 retrieval transparency — list of memory chunks the model received */}
      {retrievalStatus === "success" && retrievedMemories && retrievedMemories.length > 0 && (
        <details className="border-b border-border-subtle bg-secondary/30 group">
          <summary className="cursor-pointer list-none px-6 py-2 flex items-center justify-between text-[11px] text-text-secondary hover:bg-secondary/60 transition-colors">
            <span>
              <span className="font-bold text-text-primary">已引用 {retrievedMemories.length} 条历史记忆</span>
              <span className="text-text-muted ml-2">点击展开</span>
            </span>
            <svg aria-hidden="true" className="w-3.5 h-3.5 transition-transform group-open:rotate-180 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <ul className="px-6 pb-3 pt-1 space-y-2">
            {retrievedMemories.map((m, i) => (
              <li
                key={i}
                className="text-[11px] leading-relaxed border border-border-subtle bg-white rounded-md px-3 py-2"
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted truncate">
                    {m.source}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0 tabular-nums">
                    {m.score.toFixed(3)}
                  </span>
                </div>
                {m.reason && (
                  <p className="text-text-muted mb-1">{m.reason}</p>
                )}
                <p className="text-text-secondary whitespace-pre-wrap break-words">{m.text}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Stream error / retry banner */}
      {streamError && !streaming && (
        <div className={`px-6 py-3 border-b ${streamErrorRetryable ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100"}`}>
          <p className={`text-[12px] ${streamErrorRetryable ? "text-amber-800" : "text-red-800"}`}>
            <strong>{streamErrorRetryable ? "生成中断" : "生成被拦截"}</strong>：{streamError}
            {content.trim().length > 0 && " · 已保留部分内容，可选择应用或丢弃"}
          </p>
          {streamErrorRetryable && onRetryDraft && (
            <button
              type="button"
              onClick={onRetryDraft}
              className="mt-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-full bg-amber-600 text-white hover:bg-amber-700 transition"
            >
              重新生成
            </button>
          )}
        </div>
      )}

      {/* Critic banner */}
      {(criticResult || criticError) && (
        <div
          className={`px-6 py-3 border-b ${
            criticError
              ? "bg-amber-50 border-amber-100"
              : hasBlockingIssue
              ? "bg-red-50 border-red-100"
              : "bg-emerald-50 border-emerald-100"
          }`}
        >
          {criticError && (
            <p className="text-[12px] text-amber-800">
              <strong>审校未完成：</strong>{criticError}（不阻塞，可继续操作候选稿）
            </p>
          )}
          {!criticError && criticResult && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    hasBlockingIssue
                      ? "bg-red-200/60 text-red-900"
                      : "bg-emerald-200/60 text-emerald-900"
                  }`}
                >
                  {hasBlockingIssue ? "需注意" : "通过"}
                </span>
                <span className="text-[11px] font-bold text-text-secondary">
                  发现 {criticResult.issues.length} 条问题
                </span>
              </div>
              {criticResult.issues.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[11px] text-text-muted cursor-pointer hover:text-text-secondary">
                    查看详情
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {criticResult.issues.map((issue, i) => (
                      <li
                        key={i}
                        className={`text-[11px] leading-relaxed ${
                          issue.severity === "critical" || issue.severity === "major"
                            ? "text-red-800"
                            : "text-text-secondary"
                        }`}
                      >
                        <span className="font-bold uppercase tracking-wider mr-2">
                          [{issue.severity}/{issue.type}]
                        </span>
                        {issue.description}
                        {issue.suggestion && (
                          <span className="block text-text-muted mt-0.5">
                            建议：{issue.suggestion}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* Multi-candidate tab bar */}
      {multiCandidate && !streaming && (
        <div className="flex items-center gap-1 px-6 py-2 border-b border-border-subtle bg-secondary/10 overflow-x-auto">
          {candidates!.map((c) => (
            <button
              key={c.id}
              onClick={() => handleCandidateSwitch(c.id)}
              className={"px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors " +
                (activeCandidate === c.id
                  ? "bg-white text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-secondary")}
            >
              {c.label}
              {c.id !== "c0" && !reviewedCandidates.has(c.id) && !criticLoading && (
                <span className="ml-1.5 text-[8px] px-1 py-0.5 bg-amber-100 text-amber-700 rounded-full">未审校</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* View mode toggle — only meaningful once streaming is done and there
          is an existing body to diff against. */}
      {!streaming && hasExistingContent && content.length > 0 && (
        <div className="flex items-center gap-1 px-6 py-2 border-b border-border-subtle bg-secondary/10">
          <button
            onClick={() => setViewMode("preview")}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors ${
              viewMode === "preview"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            候选稿
          </button>
          <button
            onClick={() => setViewMode("diff")}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors ${
              viewMode === "diff"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            }`}
            title="对比当前正文与候选稿的行级差异"
          >
            与正文对比
          </button>
        </div>
      )}

      {/* Candidate body preview */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {streaming && content.length === 0 ? (
          <div className="text-center py-12 text-sm text-text-muted flex flex-col items-center gap-3">
            <svg aria-hidden="true" className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            等待首段内容…
          </div>
        ) : (criticLoading || revisionLoading) && content.length > 0 ? (
          <div className="space-y-4 py-4">
            <article className="font-serif text-[15px] leading-[1.9] text-text-primary whitespace-pre-wrap break-words">
              {activeContent}
            </article>
            <div className="relative h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/40 via-primary to-primary/40 rounded-full animate-progress-slide" />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-text-muted animate-pulse">
              <svg aria-hidden="true" className="w-3.5 h-3.5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {revisionLoading ? "模型正在思考修订方案，可能需要 1–2 分钟，请耐心等待…" : "正在分析候选稿质量，即将完成…"}
            </div>
          </div>
        ) : viewMode === "diff" && !streaming && hasExistingContent ? (
          <DiffView before={currentContent} after={content} />
        ) : (
          <article className="font-serif text-[15px] leading-[1.9] text-text-primary whitespace-pre-wrap break-words">
            {activeContent}
            {streaming && <span className="inline-block w-1 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />}
          </article>
        )}
      </div>

      {/* Footer actions */}
      <footer className="border-t border-border-subtle bg-secondary/10 px-6 py-4">
        <div className="flex items-center justify-between mb-3 text-[10px] font-bold text-text-muted uppercase tracking-wider">
          <span>{charCount} 字</span>
          <span className="flex items-center gap-1.5">
            {streaming ? (
              <>
                <svg aria-hidden="true" className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                生成中
              </>
            ) : revisionLoading ? (
              <>
                <svg aria-hidden="true" className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                修订中
              </>
            ) : criticLoading ? (
              <>
                <svg aria-hidden="true" className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                审校中
              </>
            ) : "可处理"}
          </span>
        </div>
        {(criticLoading || revisionLoading) && (
          <div className="relative h-1 w-full bg-secondary rounded-full overflow-hidden mb-3">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/40 via-primary to-primary/40 rounded-full animate-progress-slide" />
          </div>
        )}
        {canRevise && (
          <button
            onClick={onRevise}
            disabled={!canRevise}
            title="让 AI 根据上方审校建议修订当前候选稿，并重新审校"
            className="mb-2 w-full px-3 py-2.5 text-[12px] font-bold rounded-lg transition bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            按建议修订候选稿
          </button>
        )}
        {canFeedbackRevise && !canRevise && (
          <div className="mb-2">
            <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1 block">
              反馈修订
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="描述您希望 AI 如何调整候选稿…"
              rows={2}
              className="w-full text-sm bg-white border border-border-subtle rounded-lg px-3 py-2 focus:outline-none focus:border-accent/40 resize-none leading-relaxed placeholder:text-text-dim/40"
            />
            <button
              onClick={() => { if (feedbackText.trim() && onFeedbackRevise) { onFeedbackRevise(feedbackText.trim()); setFeedbackText(""); } }}
              disabled={!feedbackText.trim() || revisionLoading}
              className="mt-1.5 w-full px-3 py-2 text-[12px] font-bold rounded-lg transition bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              按反馈修订
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            label="覆盖正文"
            tooltip={hasExistingContent ? "用候选稿替换当前正文（先自动存版本）" : "写入正文"}
            disabled={!canAccept}
            danger={hasExistingContent}
            onClick={() => handleAccept("replace")}
          />
          <ActionButton
            label="追加到末尾"
            tooltip="把候选稿接在当前正文末尾"
            disabled={!canAccept}
            onClick={() => handleAccept("append")}
          />
          <ActionButton
            label="插入到光标"
            tooltip={cursorPos === null ? "需先在正文中点击定位光标" : "在当前光标处插入候选稿"}
            disabled={!canAccept || cursorPos === null}
            onClick={() => handleAccept("insert")}
          />
          <ActionButton
            label="放弃候选稿"
            tooltip="丢弃这次生成结果，正文保持不变"
            disabled={streaming}
            danger
            outline
            onClick={() => handleAccept("discard")}
          />
        </div>
      </footer>

      {/* Confirm overwrite modal */}
      {confirmingOverwrite && (
        <div
          className="absolute inset-0 z-10 bg-black/30 flex items-center justify-center p-6"
          onClick={() => setConfirmingOverwrite(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h4 className="text-base font-bold text-text-primary mb-2">
                {confirmingOverwrite === "replace" ? "确认覆盖正文？" : "审校已发现冲突，仍要应用？"}
              </h4>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {hasBlockingIssue
                  ? "AI 审校检出严重 / 重要冲突。应用候选稿前会先把当前正文存为版本，可在历史中恢复。"
                  : "应用前会先把当前正文存为版本，方便恢复。"}
              </p>
            </div>
            <div className="px-5 py-3 bg-secondary/20 flex justify-end gap-2 border-t border-border-subtle">
              <button
                onClick={() => setConfirmingOverwrite(null)}
                className="px-3 py-1.5 text-xs font-bold text-text-secondary hover:bg-secondary rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleConfirmOverwrite}
                className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white hover:bg-red-700 rounded-lg"
              >
                继续
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function ActionButton({
  label,
  tooltip,
  disabled,
  danger,
  outline,
  onClick,
}: {
  label: string;
  tooltip?: string;
  disabled?: boolean;
  danger?: boolean;
  outline?: boolean;
  onClick(): void;
}) {
  const base = "px-3 py-2.5 text-[12px] font-bold rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed";
  const style = outline
    ? "border border-border-strong text-text-secondary hover:bg-secondary"
    : danger
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-text-primary text-white hover:bg-text-primary/90";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`${base} ${style}`}
    >
      {label}
    </button>
  );
}
