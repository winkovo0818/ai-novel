"use client";

import Link from "next/link";

import type { BibleDraft, Volume } from "@/lib/validation/schemas";
import { getVolumes } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

import { useBibleEdit } from "./useBibleEdit";
import { SaveBar } from "./SaveBar";

interface OutlineEditorProps {
  novelId: string;
  bible: BibleDraft;
  /** Set of chapter_index values that already have a saved ChapterDraft. */
  draftedIndexes: number[];
}

export function OutlineEditor({ novelId, bible: initialBible, draftedIndexes }: OutlineEditorProps) {
  const { bible, setBible, dirty, status, error, save } = useBibleEdit(novelId, initialBible);
  const volumes = getVolumes(bible);
  const draftedSet = new Set(draftedIndexes);

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

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-5xl mx-auto min-h-full pb-32">
        <PageHeader
          title="大纲"
          description="按卷分组的章节大纲。已起草的章节会标注，点击可直接进入编辑。"
          breadcrumb={
            <span className="flex items-center gap-2">
              <Link href={`/novels/${novelId}`} className="hover:text-text-primary">{bible.meta.suggested_title}</Link>
              <span>·</span>
              <span>大纲</span>
            </span>
          }
        />

        <div className="mt-12 space-y-10">
          {volumes.map((volume, vi) => (
            <section key={vi}>
              <header className="flex items-baseline gap-3 mb-4">
                {volumes.length > 1 ? (
                  <h3 className="text-lg font-serif font-bold text-text-primary">
                    第 {vi + 1} 卷 · {volume.name}
                  </h3>
                ) : (
                  <h3 className="text-lg font-serif font-bold text-text-primary">章节大纲</h3>
                )}
                <span className="text-[11px] text-text-muted">
                  共 {volume.chapters.length} 章 · 主题：{volume.theme || "未填"}
                </span>
              </header>
              <ol className="space-y-3">
                {volume.chapters.map((chapter, ci) => {
                  const isDrafted = draftedSet.has(chapter.index);
                  return (
                    <li
                      key={chapter.index}
                      className="card bg-white grid gap-3 md:grid-cols-[100px_1fr_120px] md:items-start"
                    >
                      <div>
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                          Unit {String(chapter.index).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <input
                          value={chapter.title}
                          onChange={(e) => updateChapter(vi, ci, { title: e.target.value })}
                          placeholder="章节标题"
                          className="w-full text-base font-bold text-text-primary bg-transparent border-b border-border-subtle focus:border-primary focus:outline-none py-1"
                        />
                        <textarea
                          value={chapter.summary}
                          onChange={(e) => updateChapter(vi, ci, { summary: e.target.value })}
                          rows={2}
                          placeholder="章节摘要（20-120 字）"
                          className="w-full text-[13px] text-text-secondary bg-white border border-border-subtle rounded-md px-3 py-2 leading-relaxed focus:border-primary focus:outline-none resize-none"
                        />
                        <p className="text-[10px] text-text-muted">{chapter.summary.length} 字</p>
                      </div>
                      <div className="flex flex-col gap-2 items-start md:items-end">
                        {isDrafted ? (
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full font-bold uppercase tracking-wider">已起草</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 bg-secondary text-text-muted border border-border-subtle rounded-full font-bold uppercase tracking-wider">待起草</span>
                        )}
                        <Link
                          href={`/editor/${novelId}?chapter=${chapter.index}`}
                          className="text-[11px] text-primary hover:underline"
                        >
                          {isDrafted ? "继续编辑" : "进入起草"} →
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>

      <SaveBar dirty={dirty} status={status} error={error} onSave={save} />
    </div>
  );
}
