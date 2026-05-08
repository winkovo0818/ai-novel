"use client";

interface CriticIssue {
  type: string;
  severity: string;
  description: string;
  suggestion?: string;
}

interface CriticPanelProps {
  loading: boolean;
  error?: string;
  result?: {
    consistent: boolean;
    issues: CriticIssue[];
  };
  onClose: () => void;
  onAccept: () => void;
  onRegenerate?: () => void;
}

export function CriticPanel({ loading, error, result, onClose, onAccept, onRegenerate }: CriticPanelProps) {
  if (!result && !loading && !error) return null;

  const hasCritical = result?.issues.some((i) => i.severity === "critical" || i.severity === "major");

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
              Auto Critic / 自动审校
            </p>
            <h3 className="text-lg font-serif font-bold text-text-primary">AI 起草审校报告</h3>
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
              AI 正在审校草稿一致性...
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          {!loading && !error && result && result.consistent && (
            <div className="text-center py-12 text-sm text-text-muted">
              <svg className="w-8 h-8 mx-auto mb-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              暂未发现明显冲突
            </div>
          )}

          {!loading && !error && result && !result.consistent && (
            <div className="space-y-4">
              {result.issues.map((issue, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border ${
                    issue.severity === "critical"
                      ? "bg-red-50 border-red-100"
                      : issue.severity === "major"
                      ? "bg-amber-50 border-amber-100"
                      : "bg-secondary border-border-subtle"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                      issue.severity === "critical"
                        ? "bg-red-200/60 text-red-900 border-red-300"
                        : issue.severity === "major"
                        ? "bg-amber-200/60 text-amber-900 border-amber-300"
                        : "bg-secondary text-text-muted border-border-strong"
                    }`}>
                      {issue.severity}
                    </span>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                      {issue.type}
                    </span>
                  </div>
                  <p className={`text-sm ${issue.severity === "critical" ? "text-red-800" : issue.severity === "major" ? "text-amber-800" : "text-text-secondary"}`}>
                    {issue.description}
                  </p>
                  {issue.suggestion && (
                    <p className="mt-2 text-[11px] text-text-muted">
                      <span className="font-bold">建议：</span>{issue.suggestion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && result && (
          <div className="p-6 border-t border-border-subtle bg-secondary/10 flex gap-3">
            {hasCritical ? (
              <>
                <button
                  onClick={onAccept}
                  className="flex-1 btn-primary text-xs font-bold py-3 gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  仍要保存
                </button>
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="flex-1 btn-secondary text-xs font-bold py-3 gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    重新生成
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={onAccept}
                className="w-full btn-primary text-xs font-bold py-3 gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                确认保存
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
