"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";

import type { BibleDraft, Volume } from "@/lib/validation/schemas";
import { getVolumes } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

import { useBibleEdit } from "./useBibleEdit";
import { SaveBar } from "./SaveBar";

interface OutlineEditorProps {
  novelId: string;
  bible: BibleDraft;
  draftedIndexes: number[];
}

export function OutlineEditor({ novelId, bible: initialBible, draftedIndexes }: OutlineEditorProps) {
  const { bible, setBible, dirty, status, error, save } = useBibleEdit(novelId, initialBible);
  const volumes = getVolumes(bible);
  const draftedSet = new Set(draftedIndexes);

  const [reordering, setReordering] = useState(false);
  const [dragVolumeIdx, setDragVolumeIdx] = useState<number | null>(null);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const updateChapter = (
    volumeIdx: number,
    chapterIdx: number,
    patch: Partial<{ title: string; summary: string }>,
  ) => {
    const updatedVolume: Volume = {
      ...volumes[volumeIdx],
      chapters: volumes[volumeIdx].chapters.map((ch, ci) =>
        ci === chapterIdx ? { ...ch, ...patch } : ch,
      ),
    };
    if (volumeIdx === 0) {
      setBible({
        ...bible,
        outline: { ...bible.outline, volume_1: { ...bible.outline.volume_1, ...updatedVolume } },
      });
    } else {
      const extra = [...(bible.outline.volumes ?? [])];
      extra[volumeIdx - 1] = updatedVolume;
      setBible({ ...bible, outline: { ...bible.outline, volumes: extra } });
    }
  };

  const applyReorder = useCallback(
    (volumeIdx: number, fromIdx: number, toIdx: number) => {
      const volume = volumes[volumeIdx];
      const chapters = [...volume.chapters];
      const [moved] = chapters.splice(fromIdx, 1);
      chapters.splice(toIdx, 0, moved);
      const reindexed = chapters.map((ch, i) => ({ ...ch, index: i + 1 }));

      const updatedVolume: Volume = { ...volume, chapters: reindexed };
      if (volumeIdx === 0) {
        setBible({
          ...bible,
          outline: { ...bible.outline, volume_1: { ...bible.outline.volume_1, ...updatedVolume } },
        });
      } else {
        const extra = [...(bible.outline.volumes ?? [])];
        extra[volumeIdx - 1] = updatedVolume;
        setBible({ ...bible, outline: { ...bible.outline, volumes: extra } });
      }
    },
    [volumes, bible, setBible],
  );

  const handleDragStart = (volumeIdx: number, chapterIdx: number) => {
    setDragVolumeIdx(volumeIdx);
    setDragFromIdx(chapterIdx);
  };

  const handleDragOver = (e: React.DragEvent, chapterIdx: number) => {
    e.preventDefault();
    setDragOverIdx(chapterIdx);
  };

  const handleDrop = (volumeIdx: number, toIdx: number) => {
    if (dragVolumeIdx !== null && dragFromIdx !== null && dragVolumeIdx === volumeIdx && dragFromIdx !== toIdx) {
      applyReorder(volumeIdx, dragFromIdx, toIdx);
    }
    setDragVolumeIdx(null);
    setDragFromIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragVolumeIdx(null);
    setDragFromIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full pb-32">
        <PageHeader
          title="叙事大纲"
          description="拖拽可调整章节顺序，编辑标题和摘要后保存。已起草的章节会标注状态。"
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: bible.meta.suggested_title, href: `/novels/${novelId}` },
            { label: "叙事大纲" },
          ]}
        />

        <div className="mt-12 space-y-12">
          {volumes.map((volume, vi) => (
            <section key={vi} className="animate-fade-in">
              <header className="flex items-center justify-between mb-6 border-b border-border-strong/50 pb-4">
                <div className="flex items-baseline gap-4">
                  <h3 className="text-xl font-serif font-bold text-text-primary">
                    {volumes.length > 1 ? `第 ${vi + 1} 卷 · ${volume.name}` : "全书大纲"}
                  </h3>
                  <span className="text-[11px] font-bold text-text-dim uppercase tracking-widest">
                    {volume.chapters.length} 章节
                  </span>
                </div>
                {volume.theme && (
                  <span className="text-[11px] px-3 py-1 bg-primary/5 text-primary rounded-full border border-primary/10 font-bold uppercase tracking-wider">
                    主题：{volume.theme}
                  </span>
                )}
              </header>

              <div className="grid gap-4">
                {volume.chapters.map((chapter, ci) => {
                  const isDrafted = draftedSet.has(chapter.index);
                  const isDragging = dragVolumeIdx === vi && dragFromIdx === ci;
                  const isOver = dragVolumeIdx === vi && dragOverIdx === ci && dragFromIdx !== ci;

                  return (
                    <div
                      key={chapter.index}
                      draggable
                      onDragStart={() => handleDragStart(vi, ci)}
                      onDragOver={(e) => handleDragOver(e, ci)}
                      onDrop={() => handleDrop(vi, ci)}
                      onDragEnd={handleDragEnd}
                      className={`card bg-white grid gap-6 md:grid-cols-[28px_100px_1fr_140px] md:items-start p-6 rounded-2xl border-border-subtle/50 shadow-sm hover:shadow-md transition-all group cursor-grab active:cursor-grabbing ${
                        isDragging ? "opacity-40 scale-[0.98]" : ""
                      } ${isOver ? "ring-2 ring-primary/40 shadow-lg" : ""}`}
                    >
                      <div className="flex items-center pt-1 opacity-30 group-hover:opacity-70 transition-opacity">
                        <svg aria-hidden="true" className="w-5 h-5 text-text-dim" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                        </svg>
                      </div>
                      <div className="pt-1">
                        <span className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] group-hover:text-primary transition-colors">
                          UNIT {String(chapter.index).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="space-y-4">
                        <input
                          value={chapter.title}
                          onChange={(e) => updateChapter(vi, ci, { title: e.target.value })}
                          placeholder="未命名章节"
                          className="w-full text-lg font-serif font-bold text-text-primary bg-transparent border-none focus:ring-0 p-0 placeholder:opacity-30"
                        />
                        <div className="relative">
                          <textarea
                            value={chapter.summary}
                            onChange={(e) => updateChapter(vi, ci, { summary: e.target.value })}
                            rows={3}
                            placeholder="描述本章的核心事件与转折点（20-120 字）…"
                            className="w-full text-[14px] text-text-secondary bg-secondary/30 border-none rounded-xl px-4 py-3 leading-relaxed focus:ring-2 focus:ring-primary/20 focus:bg-white transition resize-none shadow-inner"
                          />
                          <span className="absolute bottom-2 right-4 text-[9px] font-bold text-text-dim uppercase">
                            {chapter.summary.length} / 120
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 items-start md:items-end">
                        {isDrafted ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm">
                             <div className="h-1 w-1 rounded-full bg-emerald-500" />
                             已同步
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-text-dim border border-border-subtle rounded-lg text-[10px] font-bold uppercase tracking-wider">
                             <div className="h-1 w-1 rounded-full bg-text-dim/40" />
                             待起草
                          </div>
                        )}
                        <Link
                          href={`/editor/${novelId}?chapter=${chapter.index}`}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline group/link"
                        >
                          {isDrafted ? "进入编辑" : "开始起草"}
                          <svg aria-hidden="true" className="w-3.5 h-3.5 group-hover/link:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <SaveBar dirty={dirty} status={status} error={error} onSave={save} />
    </div>
  );
}