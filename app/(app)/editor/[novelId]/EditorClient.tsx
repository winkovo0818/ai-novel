"use client";

import { useState } from "react";
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
}

interface EditorClientProps {
  novelId: string;
  title: string;
  bible: BibleDraft;
  initialChapters: ChapterDraftView[];
}

export function EditorClient({ novelId, title, bible: initialBible, initialChapters }: EditorClientProps) {
  const [bible, setBible] = useState(initialBible);
  const editor = useChapterEditor({ novelId, bible, initialChapters });
  const [showBible, setShowBible] = useState(true);
  const [showAI, setShowAI] = useState(true);
  const [cursorPos, setCursorPosState] = useState<number | null>(null);

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
        className={`bg-surface border-r border-border-strong transition-all duration-300 overflow-y-auto ${
          showBible ? "w-320 opacity-100" : "w-0 opacity-0 invisible"
        }`}
      >
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
      </aside>

      {/* Middle: Writing Canvas */}
      <main className="flex-1 flex flex-col min-w-0 bg-secondary/20 relative overflow-y-auto custom-scrollbar">
        {/* Top Control Bar */}
        <div className="sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-border-strong/50 px-8 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowBible(!showBible)}
              className={`p-2 rounded-lg transition-all ${
                showBible ? "bg-primary/5 text-primary" : "text-text-muted hover:bg-secondary hover:text-text-primary"
              }`}
              title="作品设定"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </button>
            <div className="h-4 w-px bg-border-strong mx-2" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em] leading-none mb-1">正在创作</span>
              <h2 className="text-[13px] font-bold text-text-primary truncate max-w-[240px] leading-none">{title}</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {editor.pendingStateDiff && (
              <button
                onClick={editor.openPendingStateDiff}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors"
                title="查看状态变更建议"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                第 {editor.pendingStateDiffChapterIndex} 章状态分析完成
              </button>
            )}
            <StatusTag type={editor.status === "drafting" ? "drafting" : editor.status === "saving" ? "saving" : editor.chapterStatus === "done" ? "done" : "idle"} />
            <JobsBadge novelId={novelId} />
            <div className="h-4 w-px bg-border-strong mx-2" />
            <ExportMenu novelId={novelId} />
            <button 
              onClick={() => setShowAI(!showAI)}
              className={`p-2 rounded-lg transition-all ${
                showAI ? "bg-primary text-white shadow-md shadow-primary/20" : "text-text-muted hover:bg-secondary hover:text-text-primary"
              }`}
              title="AI 助手"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Editor Area with Paper Look */}
        <div className="flex-1 py-16 px-4 md:px-8">
          <div className="writing-canvas p-12 md:p-20 lg:p-24 animate-fade-in-up">
            <EditorToolbar
              selectedIndex={editor.selectedIndex}
              summary={editor.selectedOutline?.summary}
              chapterTitle={editor.chapterTitle}
              chapterStatus={editor.chapterStatus}
              isSaved={Boolean(editor.selectedDraft)}
              characterCount={editor.characterCount}
              status={editor.status}
              message={editor.message}
              hasUnsavedChanges={editor.hasUnsavedChanges}
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
            />

            <div className="mt-16 relative">
              <textarea
                className="w-full min-h-[800px] resize-none border-none bg-transparent p-0 font-serif text-2xl leading-[2.2] text-text-primary placeholder:text-text-dim/50 focus:outline-none selection:bg-primary/10"
                placeholder={`在此输入第 ${editor.selectedIndex} 章内容...`}
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
              
              {/* Context Floating Info */}
              <div className="mt-16 pt-10 border-t border-border-subtle flex items-center justify-between text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">
                <div className="flex items-center gap-6">
                   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                   <span>累计 {editor.characterCount} 字</span>
                </div>
                <span className="flex items-center gap-2 text-emerald-600">
                  <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                  云端同步协议已激活
                </span>
              </div>
            </div>
          </div>
          
          {/* Bottom Margin for comfort */}
          <div className="h-32" />
        </div>
      </main>

      {/* Right: AI Assistant */}
      <AIPanel
        show={showAI}
        onClose={() => setShowAI(false)}
        bible={bible}
        status={editor.status}
        message={editor.message}
        selectedOutline={editor.selectedOutline}
        onDraftChapter={editor.draftChapter}
        onRunConsistency={editor.runConsistency}
        consistencyRunning={editor.consistencyRunning}
        consistencyResult={editor.consistencyResult}
        consistencyError={editor.consistencyError}
        onGenerateStateDiff={editor.generateStateDiff}
        stateDiffLoading={editor.stateDiffLoading}
      />

      <VersionsModal
        open={editor.versionsOpen}
        selectedIndex={editor.selectedIndex}
        versions={editor.versions}
        loading={editor.versionsLoading}
        error={editor.versionsError}
        onClose={editor.closeVersions}
      />

      {editor.stateDiffOpen && (
        <StateDiffPanel
          loading={editor.stateDiffLoading}
          error={editor.stateDiffError}
          diff={editor.stateDiff}
          onClose={editor.closeStateDiff}
          onAccept={(diff) => {
            const updated = applyStateDiff(bible, diff, editor.selectedIndex);
            // Persist updated Bible
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
          cursorPos={cursorPos}
          onAccept={(mode) => editor.acceptCandidate(mode)}
          onClose={() => editor.acceptCandidate("discard")}
        />
      )}
    </div>
  );
}
