import React, { useCallback, useMemo, useState } from "react";
import type { BibleDraft, ChapterRevisionOperation } from "@/lib/validation/schemas";
import type { ChapterEditorStatus, EditorSelection } from "@/lib/editor/chapterUtils";
import type { ConsistencyResult } from "./useChapterActions";
import { BeatSheetPanel, type BeatItem } from "./BeatSheetPanel";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MemoryPreviewItem {
  source: string;
  text: string;
  reason: string;
  score: number;
}

interface AIPanelProps {
  show: boolean;
  isCompact?: boolean;
  onClose(): void;
  bible: BibleDraft;
  novelId: string;
  status: ChapterEditorStatus;
  message?: string;
  selectedOutline?: { summary?: string } | null;
  selectedChapterIndex: number;
  chapterTitle: string;
  editorSelection: EditorSelection | null;
  content?: string;
  onDraftChapter(): void;
  onReviseSelection(operation: ChapterRevisionOperation): void;
  localRevisionLoading?: boolean;
  localRevisionError?: string;
  onReviseWithInstruction?(instruction: string): void;
  onDraftWithMemories(memories: MemoryPreviewItem[]): void;
  onRunConsistency(): void;
  consistencyRunning: boolean;
  consistencyResult?: ConsistencyResult;
  consistencyError?: string;
  onGenerateStateDiff(): void;
  stateDiffLoading: boolean;
  beats: BeatItem[];
  beatsLoading: boolean;
  beatsError?: string;
  onGenerateBeats(chapterGoal?: string): void;
  onUpdateBeats(beats: BeatItem[]): void;
  onClearBeats(): void;
  onDraftWithBeats(): void;
}

/* ------------------------------------------------------------------ */
/*  Local revision actions                                             */
/* ------------------------------------------------------------------ */

const LOCAL_REVISION_ACTIONS: Array<{ operation: ChapterRevisionOperation; label: string }> = [
  { operation: "polish", label: "润色" },
  { operation: "humanize", label: "去AI味" },
  { operation: "expand", label: "扩写" },
  { operation: "shorten", label: "缩写" },
  { operation: "dialogue", label: "对白" },
  { operation: "intensify_conflict", label: "冲突" },
  { operation: "continue", label: "续写" },
];

const QUICK_ACTIONS: Array<{ operation: ChapterRevisionOperation; label: string }> = [
  { operation: "polish", label: "润色" },
  { operation: "expand", label: "扩写" },
  { operation: "shorten", label: "缩写" },
  { operation: "continue", label: "续写" },
];

/* ------------------------------------------------------------------ */
/*  InstructionInput                                                   */
/* ------------------------------------------------------------------ */

function InstructionInput({
  editorSelection,
  onReviseWithInstruction,
  loading,
}: {
  editorSelection: { selectedText: string } | null;
  onReviseWithInstruction?(instruction: string): void;
  loading: boolean;
}) {
  const [value, setValue] = useState("");
  const handleSubmit = useCallback(() => {
    const instruction = value.trim();
    if (!instruction || !onReviseWithInstruction) return;
    onReviseWithInstruction(instruction);
    setValue("");
  }, [value, onReviseWithInstruction]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    },
    [handleSubmit],
  );
  const hasSelection = editorSelection?.selectedText?.trim();

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          hasSelection
            ? `改写选中的 ${hasSelection.length} 字…`
            : "描述你想怎么改，或选中文字后输入指令…"
        }
        disabled={loading || !onReviseWithInstruction}
        className="w-full bg-white border border-border-strong rounded-2xl px-5 py-4 pr-12 text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:ring-0 focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all duration-200 disabled:opacity-40"
      />
      <button
        onClick={handleSubmit}
        disabled={loading || !value.trim() || !onReviseWithInstruction}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl bg-text-primary text-white flex items-center justify-center hover:bg-accent transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
        aria-label="发送指令"
      >
        {loading ? (
          <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
          </svg>
        )}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible section                                                */
/* ------------------------------------------------------------------ */

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border-subtle pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <svg
          aria-hidden="true"
          className={`w-3 h-3 text-text-dim transition-transform duration-300 ${open ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim group-hover:text-text-secondary transition-colors">
          {title}
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ${
          open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AIPanel({
  show,
  isCompact,
  onClose,
  bible,
  status,
  message,
  selectedOutline,
  selectedChapterIndex,
  chapterTitle,
  editorSelection,
  content = "",
  onDraftChapter,
  onReviseSelection,
  localRevisionLoading = false,
  localRevisionError,
  onReviseWithInstruction,
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
  /* ---- derived state ---- */
  const selectedText = editorSelection?.selectedText ?? "";
  const hasSelectedText = selectedText.trim().length > 0;
  const isEmpty = !content.trim();
  const isDrafting = status === "drafting";
  const localRevisionDisabled = !hasSelectedText || localRevisionLoading;
  const hasBeats = beats.length > 0;

  const panelMode = useMemo(() => (isEmpty ? "empty" : "editing"), [isEmpty]);

  /* ---- render ---- */
  const w = isCompact ? "w-[300px]" : "w-80 lg:w-96";

  return (
    <aside
      className={`editor-ai-panel h-full flex flex-col transition-all duration-500 ease-in-out relative z-20 ${
        show ? w : "w-0 opacity-0 invisible"
      }`}
    >
      <div className={`${w} h-full flex flex-col flex-shrink-0`}>
        {/* ---- header ---- */}
        <header className="editor-ai-header px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-text-primary text-xs font-bold text-white shadow-sm">
              墨
            </span>
            <div>
              <p className="text-xs font-bold text-text-primary">写作助手</p>
              <p className="text-[10px] text-text-dim">
                {isEmpty ? "开始新章" : hasSelectedText ? `已选中 ${selectedText.length} 字` : "准备就绪"}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="关闭写作助手" className="editor-icon-button !h-8 !w-8">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* ---- body ---- */}
        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-5">
          {/* ================================================================ */}
          {/*  MODE: EMPTY                                                      */}
          {/* ================================================================ */}
          {panelMode === "empty" && (
            <div className="animate-fade-in space-y-6">
              {/* Hero CTA */}
              <div className="text-center py-8">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-5 ring-1 ring-primary/10">
                  <svg aria-hidden="true" className="w-8 h-8 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-base font-serif font-bold text-text-primary mb-2">本章尚为空</h3>
                <p className="text-xs text-text-dim leading-relaxed max-w-[220px] mx-auto">
                  AI 将基于大纲和角色设定自动起草本章初稿，你也可以先生成节拍再起草。
                </p>
              </div>


              {/* Primary CTA */}
              <button
                onClick={hasBeats ? onDraftWithBeats : onDraftChapter}
                disabled={isDrafting}
                className={`w-full py-4 rounded-2xl text-sm font-bold transition-all duration-300 active:scale-[0.98] ${
                  isDrafting
                    ? "bg-secondary text-text-muted cursor-wait"
                    : "bg-text-primary text-white hover:bg-accent hover:shadow-[0_8px_32px_-8px_rgba(99,102,241,0.35)]"
                }`}
              >
                {isDrafting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 正在起草…
                  </span>
                ) : hasBeats ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    基于 {beats.length} 个节拍起草
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    生成本章初稿
                  </span>
                )}
              </button>
              {hasBeats && (
                <p className="text-center text-[10px] text-text-dim mt-2">
                  已生成 {beats.length} 个节拍，起草时将按节拍逐段写作。
                  <button onClick={onClearBeats} className="ml-1.5 text-text-muted underline hover:text-text-primary">清除节拍</button>
                </p>
              )}

              {/* Beat Sheet (folded) */}
              <Collapsible title="先规划章节节奏" defaultOpen={false}>
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
              </Collapsible>

              {/* Reference: outline */}
              <Collapsible title="本章大纲摘要">
                <div className="p-4 rounded-xl bg-secondary/40 border border-border-subtle text-[12px] text-text-secondary leading-relaxed">
                  {selectedOutline?.summary || "当前章节暂无大纲摘要。"}
                </div>
              </Collapsible>

              {/* Reference: characters */}
              <Collapsible title={`活跃角色（${bible.characters.length} 位）`}>
                <div className="space-y-2">
                  {bible.characters.slice(0, 5).map((char) => (
                    <div key={char.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-border-subtle">
                      <span className="text-xs font-bold text-text-primary">{char.name}</span>
                      <span className="text-[10px] text-text-dim uppercase">{char.role}</span>
                      <span className="text-[10px] text-text-muted ml-auto truncate max-w-[120px]">{char.personality}</span>
                    </div>
                  ))}
                </div>
              </Collapsible>
            </div>
          )}

          {/* ================================================================ */}
          {/*  MODE: EDITING                                                    */}
          {/* ================================================================ */}
          {panelMode === "editing" && (
            <div className="animate-fade-in space-y-5">
              {/* ---- Instruction input (HERO) ---- */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg aria-hidden="true" className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim">
                    自然语言指令
                  </span>
                </div>
                <InstructionInput
                  editorSelection={editorSelection}
                  onReviseWithInstruction={onReviseWithInstruction}
                  loading={localRevisionLoading}
                />
                {localRevisionError && (
                  <p className="mt-2 text-[11px] text-red-500 font-medium">{localRevisionError}</p>
                )}
              </div>

              {/* ---- Quick actions (chips) ---- */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2.5">
                  {hasSelectedText ? "快捷操作选中文字" : "快捷操作（需先选中正文）"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.operation}
                      type="button"
                      onClick={() => onReviseSelection(action.operation)}
                      disabled={localRevisionDisabled}
                      className={`px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all duration-200 ${
                        hasSelectedText && !localRevisionLoading
                          ? "border-border-strong bg-white text-text-secondary hover:border-primary/30 hover:text-primary hover:bg-primary/[0.04] active:scale-95"
                          : "border-border-subtle bg-secondary/30 text-text-dim cursor-not-allowed"
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                  {/* More dropdown */}
                  <div className="relative group">
                    <button
                      type="button"
                      disabled={localRevisionDisabled}
                      className={`px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all duration-200 ${
                        hasSelectedText && !localRevisionLoading
                          ? "border-border-strong bg-white text-text-dim hover:border-primary/30 hover:text-primary"
                          : "border-border-subtle bg-secondary/30 text-text-dim cursor-not-allowed"
                      }`}
                    >
                      更多
                    </button>
                    <div className="absolute bottom-full left-0 mb-1 w-36 bg-white border border-border-strong rounded-2xl shadow-lg p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                      {LOCAL_REVISION_ACTIONS.filter((a) => !QUICK_ACTIONS.find((q) => q.operation === a.operation)).map((action) => (
                        <button
                          key={action.operation}
                          type="button"
                          onClick={() => onReviseSelection(action.operation)}
                          disabled={localRevisionDisabled}
                          className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-medium text-text-secondary hover:bg-secondary hover:text-text-primary transition disabled:opacity-30"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ---- Tools ---- */}
              <div className="border-t border-border-subtle pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-3">工具</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onRunConsistency}
                    disabled={consistencyRunning}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-border-subtle hover:border-primary/20 hover:bg-primary/[0.02] transition text-left disabled:opacity-40 group"
                  >
                    <svg aria-hidden="true" className="w-4 h-4 text-text-dim group-hover:text-primary transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <div>
                      <p className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary">一致性检查</p>
                    </div>
                  </button>
                  <button
                    onClick={onGenerateStateDiff}
                    disabled={stateDiffLoading}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-border-subtle hover:border-primary/20 hover:bg-primary/[0.02] transition text-left disabled:opacity-40 group"
                  >
                    <svg aria-hidden="true" className="w-4 h-4 text-text-dim group-hover:text-primary transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary">状态分析</p>
                    </div>
                  </button>
                  <button
                    onClick={onDraftChapter}
                    disabled={isDrafting}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-border-subtle hover:border-amber-200 hover:bg-amber-50/30 transition text-left disabled:opacity-40 group col-span-2"
                  >
                    <svg aria-hidden="true" className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <div>
                      <p className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary">重新起草本章</p>
                      <p className="text-[10px] text-text-dim">覆盖当前正文，生成新候选稿</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* ---- Reference (collapsible) ---- */}
              <Collapsible title={`活跃角色（${bible.characters.length} 位）`}>
                <div className="space-y-2">
                  {bible.characters.slice(0, 5).map((char) => (
                    <div key={char.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-border-subtle">
                      <span className="text-xs font-bold text-text-primary">{char.name}</span>
                      <span className="text-[10px] text-text-dim uppercase">{char.role}</span>
                      <span className="text-[10px] text-text-muted ml-auto truncate max-w-[120px]">{char.personality}</span>
                    </div>
                  ))}
                </div>
              </Collapsible>

              {/* Chapter outline */}
              <Collapsible title="本章大纲摘要">
                <div className="p-4 rounded-xl bg-secondary/40 border border-border-subtle text-[12px] text-text-secondary leading-relaxed">
                  {selectedOutline?.summary || "当前章节暂无大纲摘要。"}
                </div>
              </Collapsible>

              {/* Beat Sheet (collapsible) */}
              <Collapsible title="章节节拍" defaultOpen={beats.length > 0}>
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
              </Collapsible>

              {/* ---- Consistency result (if present) ---- */}
              {(consistencyRunning || consistencyResult || consistencyError) && (
                <div className="border-t border-border-subtle pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-3">一致性检查结果</p>
                  {consistencyRunning && (
                    <div className="p-4 rounded-xl bg-primary/[0.04] border border-primary/10 text-xs text-primary flex items-center gap-2">
                      <svg aria-hidden="true" className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      正在检查全文设定一致性…
                    </div>
                  )}
                  {!consistencyRunning && consistencyError && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">{consistencyError}</div>
                  )}
                  {!consistencyRunning && consistencyResult?.consistent && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 font-medium flex items-center gap-2">
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      逻辑严密，暂未发现设定矛盾。
                    </div>
                  )}
                  {!consistencyRunning && consistencyResult && !consistencyResult.consistent && (
                    <ul className="space-y-2">
                      {(consistencyResult.issues ?? []).map((issue, i) => (
                        <li key={i} className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
                          <span className="font-bold">{issue.type}</span> · 第{issue.chapter}章：{issue.description}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- Status message ---- */}
          {message && (
            <div
              className={`p-4 rounded-2xl text-xs font-bold animate-slide-in ${
                status === "error"
                  ? "bg-red-50 text-red-600 border border-red-100"
                  : "bg-text-primary text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full border border-white/30 ${status === "error" ? "bg-red-400" : "bg-white animate-pulse"}`} />
                {message}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
