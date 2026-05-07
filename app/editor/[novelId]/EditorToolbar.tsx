interface EditorToolbarProps {
  selectedIndex: number;
  summary?: string;
  chapterTitle: string;
  chapterStatus: "draft" | "done";
  isSaved: boolean;
  characterCount: number;
  status: "idle" | "saving" | "saved" | "drafting" | "error";
  message?: string;
  hasUnsavedChanges: boolean;
  onTitleChange(title: string): void;
  onDraftChapter(): void;
  onToggleStatus(): void;
  onSave(): void;
}

export function EditorToolbar({
  selectedIndex,
  summary,
  chapterTitle,
  chapterStatus,
  isSaved,
  characterCount,
  status,
  message,
  hasUnsavedChanges,
  onTitleChange,
  onDraftChapter,
  onToggleStatus,
  onSave,
}: EditorToolbarProps) {
  const isBusy = status === "saving" || status === "drafting";
  const titleInvalid = !chapterTitle.trim();

  return (
    <div className="flex flex-col gap-3 border-b border-neutral-200 pb-5 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-medium text-neutral-500">Chapter Draft</p>
        <p className="mt-1 text-sm text-neutral-500">
          第 {selectedIndex} 章 · {summary ?? "暂无章节梗概"}
          {isSaved ? <span className="ml-2 text-emerald-700">已保存</span> : null}
          {chapterStatus === "done" ? <span className="ml-2 text-blue-700">已完成</span> : null}
          <span className="ml-2 text-neutral-400">{characterCount} 字</span>
        </p>
        <input
          className="mt-1 w-full rounded-xl border border-transparent text-3xl font-semibold outline-none focus:border-neutral-300 md:min-w-[28rem]"
          value={chapterTitle}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        {message ? <span className={status === "error" ? "text-sm text-red-600" : "text-sm text-neutral-500"}>{message}</span> : null}
        {hasUnsavedChanges && !isBusy ? <span className="text-sm text-amber-600">有未保存修改</span> : null}
        <button
          className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium text-neutral-700 disabled:opacity-50"
          disabled={isBusy || titleInvalid}
          onClick={onDraftChapter}
        >
          {status === "drafting" ? "起草中..." : `AI 起草第 ${selectedIndex} 章`}
        </button>
        <button
          className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium text-neutral-700 disabled:opacity-50"
          disabled={isBusy || titleInvalid}
          onClick={onToggleStatus}
        >
          {chapterStatus === "done" ? "恢复草稿" : "标记完成"}
        </button>
        <button
          className="rounded-2xl bg-neutral-950 px-5 py-3 font-medium text-white disabled:opacity-50"
          disabled={isBusy || titleInvalid}
          onClick={onSave}
        >
          {status === "saving" ? "保存中..." : "保存草稿"}
        </button>
      </div>
    </div>
  );
}
