"use client";

import { useState } from "react";
import { getVolumes } from "@/lib/validation/schemas";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { ChapterDraftView } from "./EditorClient";
import { BibleEditorPanel } from "./BibleEditorPanel";

interface EditorSidebarProps {
  novelId: string;
  title: string;
  bible: BibleDraft;
  chapters: ChapterDraftView[];
  selectedIndex: number;
  isBusy: boolean;
  onSelectChapter(index: number): void;
  onBibleUpdate(updated: BibleDraft): void;
  onCollapse?(): void;
}

export function EditorSidebar({
  novelId,
  title,
  bible,
  chapters,
  selectedIndex,
  isBusy,
  onSelectChapter,
  onBibleUpdate,
  onCollapse,
}: EditorSidebarProps) {
  const [view, setView] = useState<"chapters" | "bible">("chapters");
  const volumes = getVolumes(bible);
  const totalChapters = volumes.reduce((sum, v) => sum + v.chapters.length, 0);
  const savedCount = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.status === "done").length;

  if (view === "bible") {
    return (
      <BibleEditorPanel
        novelId={novelId}
        bible={bible}
        onUpdate={(updated) => {
          onBibleUpdate(updated);
        }}
        onBack={() => setView("chapters")}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-white/90">
      <div className="editor-sidebar-header border-b border-border-subtle px-4 py-4">
        <div className="mb-3 flex items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate font-serif text-[19px] leading-tight text-text-primary" title={title}>{title}</h2>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="editor-drawer-collapse-button"
              aria-label="收起章节目录"
              title="收起章节目录"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">
              存 {savedCount}/{totalChapters}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(99,102,241,0.4)]" />
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">
              完 {doneCount}
            </span>
          </div>
        </div>
      </div>

      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-text-dim/70">Manuscript</div>
          {volumes.flatMap((volume, volumeIdx) => [
            volumes.length > 1 ? (
              <div
                key={`vol-${volumeIdx}`}
                className="mt-3 border-t border-border-subtle/60 px-2 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-primary first:mt-0 first:border-none"
              >
                VOL {volumeIdx + 1} · {volume.name}
              </div>
            ) : null,
            ...volume.chapters.map((chapter) => {
            const draft = chapters.find((d) => d.chapter_index === chapter.index);
            const isSelected = chapter.index === selectedIndex;
            return (
              <button
                key={chapter.index}
                className={`editor-chapter-item group w-full rounded-xl px-3 py-2.5 text-left transition duration-200 ${
                  isSelected
                    ? "is-selected"
                    : "hover:bg-white/70"
                }`}
                disabled={isBusy}
                onClick={() => onSelectChapter(chapter.index)}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className={`text-[10px] font-bold tracking-widest ${isSelected ? "text-accent" : "text-text-dim"}`}>
                    {String(chapter.index).padStart(2, "0")}
                  </span>
                  {draft && (
                    <div className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${draft.status === "done" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                       {draft.status === "done" ? "Done" : "Draft"}
                    </div>
                  )}
                </div>
                <p className={`line-clamp-1 text-[13px] font-bold leading-snug ${isSelected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}>
                  {chapter.title}
                </p>
                {chapter.summary && (
                  <p className={`mt-1.5 text-[11px] leading-relaxed text-text-dim opacity-80 ${isSelected ? "line-clamp-2" : "line-clamp-1"}`}>
                    {chapter.summary}
                  </p>
                )}
              </button>
            );
          }),
          ])}
        </div>
      </nav>

      <div className="border-t border-border-subtle bg-white p-3">
        <button
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-text-primary py-3 text-[12px] font-bold text-white shadow-md shadow-primary/10 transition-all hover:bg-primary-hover active:scale-[0.98]"
          onClick={() => setView("bible")}
        >
          <svg aria-hidden="true" className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          查看全书作品设定
        </button>
      </div>
    </div>
  );
}
