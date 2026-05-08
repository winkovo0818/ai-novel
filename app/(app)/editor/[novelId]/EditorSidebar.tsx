import type { BibleDraft } from "@/lib/validation/schemas";
import type { ChapterDraftView } from "./EditorClient";

interface EditorSidebarProps {
  title: string;
  bible: BibleDraft;
  chapters: ChapterDraftView[];
  selectedIndex: number;
  isBusy: boolean;
  onSelectChapter(index: number): void;
}

export function EditorSidebar({
  title,
  bible,
  chapters,
  selectedIndex,
  isBusy,
  onSelectChapter,
}: EditorSidebarProps) {
  const totalChapters = bible.outline.volume_1.chapters.length;
  const savedCount = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.status === "done").length;

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="p-20 border-b border-border-subtle bg-secondary/20">
        <h2 className="text-sm font-bold text-text-primary mb-4 truncate">{title}</h2>
        <div className="flex items-center gap-12">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            已存 {savedCount}/{totalChapters}
          </span>
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-4">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            完成 {doneCount}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-12 custom-scrollbar">
        <div className="space-y-4">
          <div className="px-12 py-8 text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">章节目录 / UNITS</div>
          {bible.outline.volume_1.chapters.map((chapter) => {
            const draft = chapters.find((d) => d.chapter_index === chapter.index);
            const isSelected = chapter.index === selectedIndex;
            return (
              <button
                key={chapter.index}
                className={`group w-full text-left p-12 rounded-sm transition-all duration-200 ${
                  isSelected 
                    ? "bg-primary/5 border border-primary/20" 
                    : "hover:bg-secondary border border-transparent"
                }`}
                disabled={isBusy}
                onClick={() => onSelectChapter(chapter.index)}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-[10px] font-bold tracking-widest ${isSelected ? "text-primary" : "text-text-muted"}`}>
                    UNIT {String(chapter.index).padStart(2, "0")}
                  </span>
                  {draft && (
                    <span className={`h-1.5 w-1.5 rounded-full ${draft.status === "done" ? "bg-emerald-500" : "bg-primary/40"}`} />
                  )}
                </div>
                <p className={`text-sm font-medium leading-tight ${isSelected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}>
                  {chapter.title}
                </p>
                <p className="mt-8 text-[11px] text-text-muted line-clamp-2 leading-relaxed italic">
                  {chapter.summary}
                </p>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="p-16 border-t border-border-subtle bg-secondary/10">
        <button className="w-full btn-secondary text-xs font-bold py-10 gap-8">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          查看全书设定
        </button>
      </div>
    </div>
  );
}
