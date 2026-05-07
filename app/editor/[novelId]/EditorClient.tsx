"use client";

import { useCallback, useEffect, useState } from "react";

import { readSse } from "@/lib/stream/readSse";
import type { BibleDraft } from "@/lib/validation/schemas";
import { EditorSidebar } from "./EditorSidebar";
import { EditorToolbar } from "./EditorToolbar";

export interface ChapterDraftView {
  id: string;
  chapter_index: number;
  title: string;
  content: string;
  status: string;
}

interface EditorClientProps {
  novelId: string;
  title: string;
  bible: BibleDraft;
  initialChapters: ChapterDraftView[];
}

export function EditorClient({ novelId, title, bible, initialChapters }: EditorClientProps) {
  const firstChapter = bible.outline.volume_1.chapters[0];
  const firstDraft = initialChapters.find((chapter) => chapter.chapter_index === 1);
  const [chapters, setChapters] = useState(initialChapters);
  const [selectedIndex, setSelectedIndex] = useState(1);
  const selectedDraft = chapters.find((chapter) => chapter.chapter_index === selectedIndex);
  const selectedOutline = bible.outline.volume_1.chapters.find((chapter) => chapter.index === selectedIndex) ?? firstChapter;
  const [chapterId, setChapterId] = useState(firstDraft?.id);
  const [chapterTitle, setChapterTitle] = useState(firstDraft?.title ?? firstChapter?.title ?? "第一章");
  const [content, setContent] = useState(firstDraft?.content ?? "");
  const [chapterStatus, setChapterStatus] = useState<"draft" | "done">(firstDraft?.status === "done" ? "done" : "draft");
  const [savedTitle, setSavedTitle] = useState(firstDraft?.title ?? firstChapter?.title ?? "第一章");
  const [savedContent, setSavedContent] = useState(firstDraft?.content ?? "");
  const [savedStatus, setSavedStatus] = useState<"draft" | "done">(firstDraft?.status === "done" ? "done" : "draft");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "drafting" | "error">("idle");
  const [message, setMessage] = useState<string>();
  const hasUnsavedChanges = chapterTitle !== savedTitle || content !== savedContent || chapterStatus !== savedStatus;
  const characterCount = content.replace(/\s/g, "").length;

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const persistChapter = useCallback(async (nextContent: string, nextTitle = chapterTitle, nextStatus = chapterStatus) => {
    const payload = {
      title: nextTitle,
      content: nextContent,
      status: nextStatus,
      ...(chapterId ? {} : { chapter_index: selectedIndex }),
    };
    const response = await fetch(
      chapterId ? `/api/chapters/${chapterId}` : `/api/novels/${novelId}/chapters`,
      {
        method: chapterId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = await response.json();

    if (!json.ok) {
      throw new Error(json.error?.message ?? "保存失败");
    }

    setChapterId(json.data.id);
    setSavedTitle(nextTitle);
    setSavedContent(nextContent);
    setSavedStatus(nextStatus);
    setChapters((current) => {
      const nextChapter = json.data as ChapterDraftView;
      const exists = current.some((chapter) => chapter.id === nextChapter.id);
      if (exists) return current.map((chapter) => chapter.id === nextChapter.id ? nextChapter : chapter);
      return [...current, nextChapter].sort((a, b) => a.chapter_index - b.chapter_index);
    });
    return json.data as ChapterDraftView;
  }, [chapterId, chapterStatus, chapterTitle, novelId, selectedIndex]);

  useEffect(() => {
    if (!hasUnsavedChanges || status === "saving" || status === "drafting" || !chapterTitle.trim()) return;

    const timeout = window.setTimeout(async () => {
      setStatus("saving");
      setMessage("自动保存中...");
      try {
        await persistChapter(content, chapterTitle, chapterStatus);
        setStatus("saved");
        setMessage("已自动保存");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "自动保存失败");
      }
    }, 3_000);

    return () => window.clearTimeout(timeout);
  }, [chapterStatus, chapterTitle, content, hasUnsavedChanges, persistChapter, status]);

  function selectChapter(index: number) {
    if (index === selectedIndex) return;
    if (hasUnsavedChanges && !window.confirm("当前章节有未保存修改，切换后会丢失。确定切换吗？")) {
      return;
    }

    const draft = chapters.find((chapter) => chapter.chapter_index === index);
    const outline = bible.outline.volume_1.chapters.find((chapter) => chapter.index === index);
    const nextTitle = draft?.title ?? outline?.title ?? `第 ${index} 章`;
    const nextContent = draft?.content ?? "";
    const nextStatus = draft?.status === "done" ? "done" : "draft";

    setSelectedIndex(index);
    setChapterId(draft?.id);
    setChapterTitle(nextTitle);
    setContent(nextContent);
    setChapterStatus(nextStatus);
    setSavedTitle(nextTitle);
    setSavedContent(nextContent);
    setSavedStatus(nextStatus);
    setStatus("idle");
    setMessage(undefined);
  }

  async function saveChapter() {
    setStatus("saving");
    setMessage(undefined);

    try {
      await persistChapter(content);
      setStatus("saved");
      setMessage("草稿已保存");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function draftChapter() {
    if (hasUnsavedChanges && !window.confirm("AI 起草会覆盖当前未保存内容。确定继续吗？")) {
      return;
    }

    setStatus("drafting");
    setMessage("AI 正在起草...");

    const originalContent = content;
    let generated = "";
    let streamError: string | undefined;

    try {
      const response = await fetch(`/api/novels/${novelId}/chapters/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_index: selectedIndex,
          title: chapterTitle,
          existing_content: content,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`章节起草失败：HTTP ${response.status}`);
      }

      await readSse(response.body, (event) => {
        if (event.event === "chapter_delta") {
          const data = event.data as { delta?: string };
          if (data.delta) {
            generated += data.delta;
            setContent(generated);
          }
          return;
        }

        if (event.event === "error") {
          const data = event.data as { message?: string };
          streamError = data.message ?? "章节起草失败";
          return;
        }

        if (event.event === "done") {
          setMessage("AI 草稿已生成，正在保存...");
        }
      });

      if (streamError) {
        if (!generated) setContent(originalContent);
        throw new Error(streamError);
      }

      if (!generated.trim()) {
        setContent(originalContent);
        throw new Error("AI 未返回章节正文");
      }

      await persistChapter(generated);
      setStatus("saved");
      setMessage("AI 草稿已生成并保存");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setStatus("error");
      setMessage(msg);
    }
  }

  return (
    <main
      className="min-h-screen bg-neutral-950 px-5 py-6 text-white"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (status !== "saving" && status !== "drafting" && chapterTitle.trim()) {
            void saveChapter();
          }
        }
      }}
    >
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[360px_1fr]">
        <EditorSidebar
          title={title}
          bible={bible}
          chapters={chapters}
          selectedIndex={selectedIndex}
          isBusy={status === "drafting" || status === "saving"}
          onSelectChapter={selectChapter}
        />

        <section className="rounded-3xl border border-white/10 bg-white p-5 text-neutral-950">
          <EditorToolbar
            selectedIndex={selectedIndex}
            summary={selectedOutline?.summary}
            chapterTitle={chapterTitle}
            chapterStatus={chapterStatus}
            isSaved={Boolean(selectedDraft)}
            characterCount={characterCount}
            status={status}
            message={message}
            hasUnsavedChanges={hasUnsavedChanges}
            onTitleChange={(nextTitle) => {
              setChapterTitle(nextTitle);
              if (status === "saved") setStatus("idle");
            }}
            onDraftChapter={draftChapter}
            onToggleStatus={() => {
              setChapterStatus((current) => current === "done" ? "draft" : "done");
              if (status === "saved") setStatus("idle");
            }}
            onSave={saveChapter}
          />

          <textarea
            className="mt-5 min-h-[65vh] w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-base leading-8 outline-none focus:border-neutral-950"
            placeholder={`从这里开始写第 ${selectedIndex} 章。你可以参考左侧 Bible 和章节梗概。`}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              if (status === "saved") setStatus("idle");
            }}
          />
        </section>
      </div>
    </main>
  );
}
