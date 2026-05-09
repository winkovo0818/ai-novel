"use client";

import { useState } from "react";

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
  criticResult?: CandidateCriticResult;
  criticError?: string;
  /** Whether the editor currently holds a non-empty body the candidate would overwrite. */
  hasExistingContent: boolean;
  cursorPos: number | null;
  /** Status of the RAG retrieval used for this draft (success/empty/error). */
  retrievalStatus?: string;
  onAccept(mode: CandidateMode): void;
  onClose(): void;
}

export function CandidatePanel({
  content,
  streaming,
  criticLoading,
  criticResult,
  criticError,
  hasExistingContent,
  cursorPos,
  retrievalStatus,
  onAccept,
  onClose,
}: CandidatePanelProps) {
  const [confirmingOverwrite, setConfirmingOverwrite] = useState<CandidateMode | null>(null);

  const hasBlockingIssue = criticResult?.issues.some(
    (i) => i.severity === "critical" || i.severity === "major",
  );
  const charCount = content.replace(/\s/g, "").length;
  const canAccept = !streaming && !criticLoading;

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
          <h3 className="text-base font-serif font-bold text-text-primary mt-1">
            {streaming ? "AI 正在生成…" : criticLoading ? "AI 正在审校…" : "候选稿就绪"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
          aria-label="关闭候选稿面板"
          disabled={streaming}
          title={streaming ? "生成中无法关闭，请等待完成或放弃" : "关闭"}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            ? "记忆检索失败 · 本次起草未引用历史章节"
            : "未检索到相关记忆 · 模型仅基于 Bible 与最近章节生成"}
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

      {/* Candidate body preview */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {streaming && content.length === 0 ? (
          <div className="text-center py-12 text-sm text-text-muted flex flex-col items-center gap-3">
            <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            等待首段内容…
          </div>
        ) : (
          <article className="font-serif text-[15px] leading-[1.9] text-text-primary whitespace-pre-wrap break-words">
            {content}
            {streaming && <span className="inline-block w-1 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />}
          </article>
        )}
      </div>

      {/* Footer actions */}
      <footer className="border-t border-border-subtle bg-secondary/10 px-6 py-4">
        <div className="flex items-center justify-between mb-3 text-[10px] font-bold text-text-muted uppercase tracking-wider">
          <span>{charCount} 字</span>
          <span>{streaming ? "生成中" : criticLoading ? "审校中" : "可处理"}</span>
        </div>
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
  const base = "px-3 py-2.5 text-[12px] font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed";
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
