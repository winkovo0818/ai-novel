"use client";

import { useCallback, useEffect, useState } from "react";

import type { BibleDraft } from "@/lib/validation/schemas";

interface ChapterDraftView {
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
  const totalChapters = bible.outline.volume_1.chapters.length;
  const savedCount = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.status === "done").length;
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
        <aside className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-neutral-400">Novel Bible</p>
          <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
            <ProgressStat label="章节" value={`${totalChapters}`} />
            <ProgressStat label="已存" value={`${savedCount}`} />
            <ProgressStat label="完成" value={`${doneCount}`} />
          </div>
          <section className="mt-6 grid gap-4 text-sm text-neutral-300">
            <BibleSection title="主角">
              <p className="font-medium text-white">{bible.characters.find((c) => c.role === "protagonist")?.name ?? "未命名"}</p>
              <p className="mt-1">{bible.characters.find((c) => c.role === "protagonist")?.motivation}</p>
            </BibleSection>
            <BibleSection title="世界规则">
              <ul className="list-inside list-disc space-y-1">
                {bible.world.rules.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
            </BibleSection>
            <BibleSection title="第一章节拍">
              <ol className="list-inside list-decimal space-y-2">
                {bible.first_chapter_beats.map((beat) => (
                  <li key={beat.beat}>
                    <span className="text-white">{beat.scene}</span>
                    <p className="ml-5 text-neutral-400">{beat.purpose}</p>
                  </li>
                ))}
              </ol>
            </BibleSection>
            <BibleSection title="首卷章节">
              <div className="grid gap-2">
                {bible.outline.volume_1.chapters.map((chapter) => (
                  <button
                    key={chapter.index}
                    className={chapter.index === selectedIndex
                      ? "rounded-xl border border-white/30 bg-white/15 p-3 text-left"
                      : "rounded-xl border border-transparent bg-white/5 p-3 text-left hover:bg-white/10"}
                    disabled={status === "drafting" || status === "saving"}
                    onClick={() => selectChapter(chapter.index)}
                  >
                    <p className="text-white">
                      {chapter.index}. {chapter.title}
                      {chapters.some((draft) => draft.chapter_index === chapter.index) ? (
                        <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-200">已存</span>
                      ) : null}
                      {chapters.some((draft) => draft.chapter_index === chapter.index && draft.status === "done") ? (
                        <span className="ml-2 rounded-full bg-blue-400/15 px-2 py-0.5 text-xs text-blue-200">完成</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">{chapter.summary}</p>
                  </button>
                ))}
              </div>
            </BibleSection>
          </section>
        </aside>

        <section className="rounded-3xl border border-white/10 bg-white p-5 text-neutral-950">
          <div className="flex flex-col gap-3 border-b border-neutral-200 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-500">Chapter Draft</p>
              <p className="mt-1 text-sm text-neutral-500">
                第 {selectedIndex} 章 · {selectedOutline?.summary ?? "暂无章节梗概"}
                {selectedDraft ? <span className="ml-2 text-emerald-700">已保存</span> : null}
                {chapterStatus === "done" ? <span className="ml-2 text-blue-700">已完成</span> : null}
                <span className="ml-2 text-neutral-400">{characterCount} 字</span>
              </p>
              <input
                className="mt-1 w-full rounded-xl border border-transparent text-3xl font-semibold outline-none focus:border-neutral-300 md:min-w-[28rem]"
                value={chapterTitle}
                onChange={(event) => {
                  setChapterTitle(event.target.value);
                  if (status === "saved") setStatus("idle");
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              {message ? <span className={status === "error" ? "text-sm text-red-600" : "text-sm text-neutral-500"}>{message}</span> : null}
              {hasUnsavedChanges && status !== "saving" && status !== "drafting" ? (
                <span className="text-sm text-amber-600">有未保存修改</span>
              ) : null}
              <button
                className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium text-neutral-700 disabled:opacity-50"
                disabled={status === "drafting" || status === "saving" || !chapterTitle.trim()}
                onClick={draftChapter}
              >
                {status === "drafting" ? "起草中..." : `AI 起草第 ${selectedIndex} 章`}
              </button>
              <button
                className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium text-neutral-700 disabled:opacity-50"
                disabled={status === "saving" || status === "drafting" || !chapterTitle.trim()}
                onClick={() => {
                  setChapterStatus((current) => current === "done" ? "draft" : "done");
                  if (status === "saved") setStatus("idle");
                }}
              >
                {chapterStatus === "done" ? "恢复草稿" : "标记完成"}
              </button>
              <button
                className="rounded-2xl bg-neutral-950 px-5 py-3 font-medium text-white disabled:opacity-50"
                disabled={status === "saving" || status === "drafting" || !chapterTitle.trim()}
                onClick={saveChapter}
              >
                {status === "saving" ? "保存中..." : "保存草稿"}
              </button>
            </div>
          </div>

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

interface StreamEvent {
  event: string;
  data: unknown;
}

async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event);
    }
  }
}

function parseSseBlock(block: string): StreamEvent | null {
  if (block.startsWith(":")) return null;
  const event = block.match(/^event: (.+)$/m)?.[1];
  const data = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !data) return null;
  return { event, data: JSON.parse(data) };
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-2">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-neutral-500">{label}</div>
    </div>
  );
}

function BibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-neutral-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
