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
    <div className="h-full flex flex-col bg-white">
      <div className="p-6 border-b border-border-subtle bg-secondary/30">
        <h2 className="text-[13px] font-bold text-text-primary mb-3 truncate" title={title}>{title}</h2>
        <div className="flex items-center gap-4">
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

      <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <div className="space-y-1">
          <div className="px-3 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] opacity-60">章节目录 / OUTLINE</div>
          {volumes.flatMap((volume, volumeIdx) => [
            volumes.length > 1 ? (
              <div
                key={`vol-${volumeIdx}`}
                className="px-3 pt-6 pb-2 text-[10px] font-bold text-primary uppercase tracking-[0.25em] border-t border-border-subtle/50 mt-4 first:mt-0 first:border-none"
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
                className={`group w-full text-left p-4 rounded-xl transition-all duration-200 ${
                  isSelected
                    ? "bg-primary/5 ring-1 ring-primary/20"
                    : "hover:bg-secondary/60"
                }`}
                disabled={isBusy}
                onClick={() => onSelectChapter(chapter.index)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-bold tracking-widest ${isSelected ? "text-primary" : "text-text-dim"}`}>
                    UNIT {String(chapter.index).padStart(2, "0")}
                  </span>
                  {draft && (
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded uppercase text-[8px] font-bold ${draft.status === "done" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                       {draft.status === "done" ? "Done" : "Draft"}
                    </div>
                  )}
                </div>
                <p className={`text-[13px] font-bold leading-snug ${isSelected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}>
                  {chapter.title}
                </p>
                {chapter.summary && (
                  <p className="mt-2 text-[11px] text-text-dim line-clamp-2 leading-relaxed italic opacity-80">
                    {chapter.summary}
                  </p>
                )}
              </button>
            );
          }),
          ])}
        </div>
      </nav>

      <div className="p-4 border-t border-border-subtle bg-secondary/20">
        <button
          className="w-full btn-secondary text-[11px] font-bold py-2.5 rounded-xl gap-2 shadow-sm"
          onClick={() => setView("bible")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          查看全书作品设定
        </button>
      </div>
    </div>
  );
}
