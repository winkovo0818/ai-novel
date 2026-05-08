"use client";

import { useState } from "react";
import type { BibleDraft } from "@/lib/validation/schemas";
import { EditorSidebar } from "./EditorSidebar";
import { EditorToolbar } from "./EditorToolbar";
import { useChapterEditor } from "./useChapterEditor";
import { StatusTag } from "@/components/ui/StatusTag";

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
  const editor = useChapterEditor({ novelId, bible, initialChapters });
  const [showBible, setShowBible] = useState(true);
  const [showAI, setShowAI] = useState(true);

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
          title={title}
          bible={bible}
          chapters={editor.chapters}
          selectedIndex={editor.selectedIndex}
          isBusy={editor.status === "drafting" || editor.status === "saving"}
          onSelectChapter={(index) => {
            editor.selectChapter(index);
          }}
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
            <StatusTag type={editor.status === "drafting" ? "drafting" : editor.status === "saving" ? "saving" : editor.chapterStatus === "done" ? "done" : "idle"} />
            <div className="h-4 w-px bg-border-strong mx-2" />
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
                  if (editor.status === "saved") editor.setStatus("idle");
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
      <aside 
        className={`bg-white border-l border-border-strong transition-all duration-500 ease-out shadow-2xl z-20 ${
          showAI ? "w-[360px] opacity-100" : "w-0 opacity-0 invisible"
        }`}
      >
        <div className="h-full flex flex-col w-[360px]">
          <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-secondary/20">
            <span className="text-[11px] font-bold text-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-primary flex items-center justify-center text-white shadow-sm">
                 <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                   <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                 </svg>
              </div>
              AI 灵感引擎
            </span>
            <button onClick={() => setShowAI(false)} className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
            <section className="animate-fade-in-up">
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">智能指令</h3>
              <div className="grid grid-cols-2 gap-3">
                <AIActionBtn label="全文续写" icon="⚡" onClick={editor.draftChapter} disabled={editor.status === "drafting"} />
                <AIActionBtn label="文本润色" icon="✨" />
                <AIActionBtn label="扩充细节" icon="📝" />
                <AIActionBtn label="逻辑审计" icon="🔍" onClick={editor.runConsistency} disabled={editor.consistencyRunning} />
              </div>
            </section>

            <section className="animate-fade-in-up delay-100">
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">本章叙事蓝图</h3>
              <div className="p-5 bg-secondary/20 border border-border-strong rounded-xl text-[13px] text-text-secondary leading-relaxed italic relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
                {editor.selectedOutline?.summary || "当前章节暂无梗概引导"}
              </div>
            </section>

            <section className="animate-fade-in-up delay-200">
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">活跃角色设定</h3>
              <div className="space-y-3">
                {bible.characters.slice(0, 2).map(char => (
                  <div key={char.name} className="p-5 bg-white border border-border-subtle hover:border-primary/30 rounded-xl transition-all duration-300 shadow-sm hover:shadow-md group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-text-primary">{char.name}</span>
                      <span className="text-[9px] px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold uppercase tracking-wider border border-primary/10">{char.role}</span>
                    </div>
                    <p className="text-[12px] text-text-secondary line-clamp-2 leading-relaxed opacity-80 group-hover:line-clamp-none transition-all">
                      {char.personality}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {(editor.consistencyRunning || editor.consistencyResult || editor.consistencyError) && (
              <section className="animate-fade-in-up">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-4 opacity-70">逻辑审计报告</h3>
                {editor.consistencyRunning && (
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs text-primary flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 正在审阅全文一致性...
                  </div>
                )}
                {!editor.consistencyRunning && editor.consistencyError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">
                    {editor.consistencyError}
                  </div>
                )}
                {!editor.consistencyRunning && editor.consistencyResult?.consistent && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    暂未发现矛盾
                  </div>
                )}
                {!editor.consistencyRunning && editor.consistencyResult && !editor.consistencyResult.consistent && (
                  <ul className="space-y-2">
                    {(editor.consistencyResult.issues ?? []).map((issue, i) => (
                      <li key={i} className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-amber-200/60 text-amber-900 rounded-full font-bold uppercase tracking-wider text-[9px]">
                            {issue.type}
                          </span>
                          <span className="font-bold">第 {issue.chapter} 章</span>
                        </div>
                        <p className="leading-relaxed text-amber-900/80">{issue.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {editor.message && (
              <div className={`p-4 rounded-xl text-xs font-bold animate-slide ${
                editor.status === "error" ? "bg-red-50 text-red-600 border border-red-100" : "bg-primary/5 text-primary border border-primary/10"
              }`}>
                <div className="flex items-center gap-2">
                   <div className={`h-1.5 w-1.5 rounded-full ${editor.status === "error" ? 'bg-red-500' : 'bg-primary animate-pulse'}`} />
                   {editor.message}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-border-subtle bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
            <button 
              className="w-full btn-primary py-3.5 shadow-xl shadow-primary/20 flex items-center justify-center gap-3"
              onClick={editor.draftChapter}
              disabled={editor.status === "drafting"}
            >
              {editor.status === "drafting" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>AI 思考中...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  <span>立即启动起草协议</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {editor.versionsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={editor.closeVersions}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border-subtle">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-70">
                  Chapter {String(editor.selectedIndex).padStart(2, "0")}
                </p>
                <h3 className="text-lg font-serif font-bold text-text-primary">历史版本</h3>
              </div>
              <button
                onClick={editor.closeVersions}
                className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
                aria-label="关闭"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
              {editor.versionsLoading && (
                <div className="text-center py-12 text-sm text-text-muted">加载中...</div>
              )}
              {!editor.versionsLoading && editor.versionsError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
                  {editor.versionsError}
                </div>
              )}
              {!editor.versionsLoading && !editor.versionsError && editor.versions.length === 0 && (
                <div className="text-center py-12 text-sm text-text-muted">暂无历史版本</div>
              )}
              {!editor.versionsLoading && editor.versions.map((version) => (
                <article key={version.id} className="border border-border-subtle rounded-xl p-5 hover:border-border-strong transition-colors">
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-primary">{version.title}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border bg-secondary text-text-secondary border-border-strong">
                        {version.source}
                      </span>
                      {version.status === "done" && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          done
                        </span>
                      )}
                    </div>
                    <time className="text-[11px] text-text-muted">
                      {new Date(version.created_at).toLocaleString()}
                    </time>
                  </header>
                  <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {version.content || "（空）"}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AIActionBtn({ label, icon, onClick, disabled }: { label: string; icon: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-4 p-12 bg-background border border-border-subtle hover:border-primary/50 hover:bg-primary/5 rounded-sm transition-all group disabled:opacity-50"
    >
      <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-[10px] font-bold text-text-secondary group-hover:text-primary">{label}</span>
    </button>
  );
}
