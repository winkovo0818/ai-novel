"use client";

import { useEffect, useState } from "react";
import type { BibleDraft } from "@/lib/validation/schemas";
import { applyStateDiff } from "@/lib/validation/stateDiffMerge";
import { EditorSidebar } from "./EditorSidebar";
import { EditorToolbar } from "./EditorToolbar";
import { useChapterEditor } from "./useChapterEditor";
import { StatusTag } from "@/components/ui/StatusTag";
import { StateDiffPanel } from "./StateDiffPanel";
import { CandidatePanel } from "./CandidatePanel";
import { AIPanel } from "./AIPanel";
import { VersionsModal } from "./VersionsModal";
import { ExportMenu } from "./ExportMenu";
import { JobsBadge } from "./JobsBadge";

export interface ChapterDraftView {
  id: string;
  chapter_index: number;
  title: string;
  content: string;
  status: string;
  target_words?: number | null;
  /** Optimistic-lock counter, sent back as expected_version on PATCH. */
  version?: number;
  updated_at?: string;
}

interface EditorClientProps {
  novelId: string;
  title: string;
  bible: BibleDraft;
  initialChapters: ChapterDraftView[];
  initialChapterIndex?: number;
}

// M3.4.4 reading font scale. Tailwind classes pre-bundled so the build
// can still tree-shake; storing strings here means the textarea swap is
// just a className flip with no runtime style injection.
type FontScale = "sm" | "md" | "lg";

const FONT_SCALES: Record<FontScale, { textareaClass: string; label: string }> = {
  sm: { textareaClass: "text-lg leading-[2.0]", label: "小" },
  md: { textareaClass: "text-2xl leading-[2.2]", label: "中" },
  lg: { textareaClass: "text-3xl leading-[2.4]", label: "大" },
};

const FONT_STORAGE_KEY = "ai-novel:editor-font-scale";

function readStoredFontScale(): FontScale {
  if (typeof window === "undefined") return "md";
  const v = window.localStorage.getItem(FONT_STORAGE_KEY);
  return v === "sm" || v === "md" || v === "lg" ? v : "md";
}

export function EditorClient({ novelId, title, bible: initialBible, initialChapters, initialChapterIndex }: EditorClientProps) {
  const [bible, setBible] = useState(initialBible);
  const editor = useChapterEditor({ novelId, bible, initialChapters, initialChapterIndex });
  const [showBible, setShowBible] = useState(true);
  const [showAI, setShowAI] = useState(true);
  const [cursorPos, setCursorPosState] = useState<number | null>(null);
  // Default to "md" on the server render to avoid hydration mismatch; the
  // effect below pulls the persisted preference on the client.
  const [fontScale, setFontScale] = useState<FontScale>("md");

  useEffect(() => {
    setFontScale(readStoredFontScale());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FONT_STORAGE_KEY, fontScale);
  }, [fontScale]);

  const updateCursorPos = (pos: number | null) => {
    setCursorPosState(pos);
    editor.setCursorPos(pos);
  };

  return (
    <div
      className="flex h-screen bg-background overflow-hidden"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (editor.status !== "saving" && editor.status !== "drafting" && editor.chapterTitle.trim()) {
            void editor.saveChapter();
          }
        }
      }}
    >
      {/* Left: Chapter Tree & Bible Context */}
      <aside 
        className={`bg-white border-r border-border-subtle transition-all duration-500 ease-in-out h-full overflow-hidden ${
          showBible ? "w-80 opacity-100" : "w-0 opacity-0"
        }`}
      >
        <div className="w-80 h-full">
          <EditorSidebar
            novelId={novelId}
            title={title}
            bible={bible}
            chapters={editor.chapters}
            selectedIndex={editor.selectedIndex}
            isBusy={editor.status === "drafting" || editor.status === "saving"}
            onSelectChapter={(index) => {
              editor.selectChapter(index);
            }}
            onBibleUpdate={(updated) => setBible(updated)}
          />
        </div>
      </aside>

      {/* Middle: Writing Canvas */}
      <main className="flex-1 flex flex-col min-w-0 bg-secondary/40 relative overflow-hidden">
        {/* Top Control Bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-border-subtle/50 px-6 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowBible(!showBible)}
              className={`p-2 rounded-xl transition-all duration-200 ${
                showBible ? "bg-primary/10 text-primary shadow-inner" : "text-text-dim hover:bg-secondary hover:text-text-primary"
              }`}
              title={showBible ? "收起目录" : "展开目录"}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <div className="h-4 w-px bg-border-strong/50 mx-1" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">当前正在创作</span>
              <h2 className="text-[13px] font-bold text-text-primary truncate max-w-[240px] leading-tight">{title}</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {editor.pendingStateDiff && (
              <button
                onClick={editor.openPendingStateDiff}
                className="relative p-2 rounded-xl text-amber-600 bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors shadow-sm"
                title={`第 ${editor.pendingStateDiffChapterIndex} 章设定冲突 · 点击查看`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-500 border-2 border-white animate-bounce" />
              </button>
            )}
            
            {(editor.status !== "idle" || editor.chapterStatus === "done") && (
              <StatusTag type={editor.status === "drafting" ? "drafting" : editor.status === "saving" ? "saving" : editor.chapterStatus === "done" ? "done" : "idle"} />
            )}
            
            <div className="h-4 w-px bg-border-strong/50 mx-1" />
            
            <JobsBadge novelId={novelId} />

            {/* M3.4.4 reading font scale — small / medium / large. Persisted to
                localStorage so long sessions keep the user's preference across
                refreshes; defaults to medium. */}
            <div
              className="flex items-center rounded-xl border border-border-subtle bg-secondary/30 p-0.5"
              role="group"
              aria-label="正文字号"
            >
              {(Object.keys(FONT_SCALES) as FontScale[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setFontScale(key)}
                  aria-pressed={fontScale === key}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                    fontScale === key
                      ? "bg-white text-text-primary shadow-sm"
                      : "text-text-dim hover:text-text-primary"
                  }`}
                  title={`正文字号：${FONT_SCALES[key].label}`}
                >
                  {FONT_SCALES[key].label}
                </button>
              ))}
            </div>

            <ExportMenu novelId={novelId} />
            
            <button
              onClick={() => setShowAI(!showAI)}
              className={`p-2 rounded-xl transition-all duration-300 ${
                showAI ? "bg-text-primary text-white shadow-premium scale-105" : "text-text-dim hover:bg-secondary hover:text-text-primary"
              }`}
              title="AI 创作助手"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Editor Area with Paper Look */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 py-12 md:py-20 flex flex-col items-center">
          <div className="writing-canvas p-10 md:p-16 lg:p-20 animate-fade-in-up">
            <EditorToolbar
              summary={editor.selectedOutline?.summary}
              chapterTitle={editor.chapterTitle}
              chapterStatus={editor.chapterStatus}
              isSaved={Boolean(editor.selectedDraft)}
              characterCount={editor.characterCount}
              status={editor.status}
              message={editor.message}
              hasUnsavedChanges={editor.hasUnsavedChanges}
              targetWords={editor.targetWords}
              lastSavedAt={editor.lastSavedAt}
              onTitleChange={(nextTitle) => {
                editor.setChapterTitle(nextTitle);
                if (editor.status === "saved") editor.setStatus("idle");
              }}
              onDraftChapter={editor.draftChapter}
              onToggleStatus={() => {
                editor.setChapterStatus((current) => current === "done" ? "draft" : "done");
                if (editor.status === "saved") editor.setStatus("idle");
              }}
              onSave={editor.saveChapter}
              onDeleteChapter={editor.deleteChapter}
              onOpenVersions={editor.openVersions}
              onSetTargetWords={editor.setTargetWords}
            />

            {editor.conflictChapter && (
              <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 flex flex-wrap items-center justify-between gap-4 animate-slide-in">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                   <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                   </div>
                   <div className="min-w-0">
                      <p className="text-[13px] font-bold text-amber-900">检测到内容版本冲突</p>
                      <p className="text-[12px] text-amber-800/80 truncate">云端版本较新，继续保存可能会覆盖他人修改。</p>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={editor.loadLatestChapter}
                    className="px-4 py-1.5 text-[11px] font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm"
                  >
                    同步最新
                  </button>
                  <button
                    onClick={editor.dismissConflict}
                    className="px-4 py-1.5 text-[11px] font-bold rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    忽略
                  </button>
                </div>
              </div>
            )}

            <div className="mt-12 relative">
              <textarea
                className={`w-full min-h-[1000px] resize-none border-none bg-transparent p-0 font-serif ${FONT_SCALES[fontScale].textareaClass} text-text-primary placeholder:text-text-dim/20 focus:outline-none selection:bg-primary/10`}
                placeholder="开始书写故事..."
                spellCheck={false}
                value={editor.content}
                onChange={(event) => {
                  editor.setContent(event.target.value);
                  updateCursorPos(event.target.selectionStart);
                  if (editor.status === "saved") editor.setStatus("idle");
                }}
                onSelect={(event) => {
                  updateCursorPos((event.target as HTMLTextAreaElement).selectionStart);
                }}
                onClick={(event) => {
                  updateCursorPos((event.target as HTMLTextAreaElement).selectionStart);
                }}
                onKeyUp={(event) => {
                  updateCursorPos((event.target as HTMLTextAreaElement).selectionStart);
                }}
              />
            </div>
          </div>
          <div className="h-32 shrink-0" />
        </div>
      </main>

      {/* Right: AI Assistant */}
      <aside 
        className={`bg-white border-l border-border-subtle transition-all duration-500 ease-in-out h-full overflow-hidden ${
          showAI ? "w-96 opacity-100" : "w-0 opacity-0"
        }`}
      >
        <div className="w-96 h-full">
          <AIPanel
            show={showAI}
            onClose={() => setShowAI(false)}
            bible={bible}
            status={editor.status}
            message={editor.message}
            selectedOutline={editor.selectedOutline}
            selectedChapterIndex={editor.selectedIndex}
            chapterTitle={editor.chapterTitle}
            onDraftChapter={editor.draftChapter}
            onRunConsistency={editor.runConsistency}
            consistencyRunning={editor.consistencyRunning}
            consistencyResult={editor.consistencyResult}
            consistencyError={editor.consistencyError}
            onGenerateStateDiff={editor.generateStateDiff}
            stateDiffLoading={editor.stateDiffLoading}
            beats={editor.beats}
            beatsLoading={editor.beatsLoading}
            beatsError={editor.beatsError}
            onGenerateBeats={editor.generateBeatSheet}
            onUpdateBeats={editor.setBeats}
            onClearBeats={editor.clearBeats}
            onDraftWithBeats={editor.draftWithBeats}
          />
        </div>
      </aside>

      {/* Overlays / Modals */}
      <VersionsModal
        open={editor.versionsOpen}
        selectedIndex={editor.selectedIndex}
        versions={editor.versions}
        loading={editor.versionsLoading}
        error={editor.versionsError}
        currentContent={editor.content}
        currentTitle={editor.chapterTitle}
        chapterId={editor.chapterId}
        onClose={editor.closeVersions}
        onRestored={editor.applyRestoredChapter}
      />

      {editor.stateDiffOpen && (
        <StateDiffPanel
          loading={editor.stateDiffLoading}
          error={editor.stateDiffError}
          diff={editor.stateDiff}
          onClose={editor.closeStateDiff}
          onAccept={(diff) => {
            const updated = applyStateDiff(bible, diff, editor.selectedIndex);
            fetch(`/api/novels/${novelId}/bible`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: updated }),
            })
              .then((res) => res.json())
              .then((json) => {
                if (json.ok) {
                  setBible(updated);
                  editor.closeStateDiff();
                } else {
                  throw new Error(json.error?.message ?? "更新失败");
                }
              })
              .catch((err) => {
                alert(err instanceof Error ? err.message : "更新失败");
              });
          }}
        />
      )}

      {editor.candidateOpen && (
        <CandidatePanel
          content={editor.candidateContent}
          streaming={editor.candidateStreaming}
          criticLoading={editor.candidateCriticLoading}
          criticResult={editor.candidateCriticResult}
          criticError={editor.candidateCriticError}
          hasExistingContent={editor.content.trim().length > 0}
          currentContent={editor.content}
          cursorPos={cursorPos}
          retrievalStatus={editor.lastRetrievalStatus}
          retrievedMemories={editor.lastRetrievedMemories}
          retrievalError={editor.lastRetrievalError}
          onAccept={(mode) => editor.acceptCandidate(mode)}
          onClose={() => editor.acceptCandidate("discard")}
        />
      )}
    </div>
  );
}
