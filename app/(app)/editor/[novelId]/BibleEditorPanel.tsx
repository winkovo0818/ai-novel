"use client";

import { useState, useCallback, useMemo } from "react";
import type { BibleDraft, Character } from "@/lib/validation/schemas";
import { getVolumes } from "@/lib/validation/schemas";

interface BibleEditorPanelProps {
  novelId: string;
  bible: BibleDraft;
  onUpdate: (updated: BibleDraft) => void;
  onBack: () => void;
}

type SectionTab = "characters" | "world" | "outline";

export function BibleEditorPanel({ novelId, bible, onUpdate, onBack }: BibleEditorPanelProps) {
  const [workingBible, setWorkingBible] = useState<BibleDraft>(bible);
  const [activeTab, setActiveTab] = useState<SectionTab>("characters");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);

  const updateCharacter = useCallback((index: number, patch: Partial<Character>) => {
    setWorkingBible((prev) => {
      const next = { ...prev, characters: prev.characters.map((c, i) => (i === index ? { ...c, ...patch } : c)) };
      return next;
    });
  }, []);

  const updateWorldRule = useCallback((index: number, value: string) => {
    setWorkingBible((prev) => {
      const nextRules = prev.world.rules.map((r, i) => (i === index ? value : r));
      return { ...prev, world: { ...prev.world, rules: nextRules } };
    });
  }, []);

  const addWorldRule = useCallback(() => {
    setWorkingBible((prev) => {
      if (prev.world.rules.length >= 6) return prev;
      return { ...prev, world: { ...prev.world, rules: [...prev.world.rules, ""] } };
    });
  }, []);

  const removeWorldRule = useCallback((index: number) => {
    setWorkingBible((prev) => {
      if (prev.world.rules.length <= 1) return prev;
      const nextRules = prev.world.rules.filter((_, i) => i !== index);
      return { ...prev, world: { ...prev.world, rules: nextRules } };
    });
  }, []);

  const updateChapter = useCallback((volumeIndex: number, chapterIndex: number, patch: Partial<{ title: string; summary: string }>) => {
    setWorkingBible((prev) => {
      const currentVolumes = getVolumes(prev);
      const targetVolume = {
        ...currentVolumes[volumeIndex],
        chapters: currentVolumes[volumeIndex].chapters.map((ch, ci) => (ci === chapterIndex ? { ...ch, ...patch } : ch))
      };

      if (volumeIndex === 0) {
        return { ...prev, outline: { ...prev.outline, volume_1: targetVolume } };
      }
      const extraVolumes = [...(prev.outline.volumes ?? [])];
      extraVolumes[volumeIndex - 1] = targetVolume;
      return { ...prev, outline: { ...prev.outline, volumes: extraVolumes } };
    });
  }, []);

  /**
   * Recompute global `index` on every chapter so it stays a 1-based monotonic
   * sequence across all volumes. The editor sidebar keys on this; if we
   * appended a chapter without renumbering, two chapters could collide.
   */
  function reindexVolumes<T extends { chapters: Array<{ index: number; title: string; summary: string }> }>(volumes: T[]): T[] {
    let next = 1;
    return volumes.map((vol) => ({
      ...vol,
      chapters: vol.chapters.map((ch) => ({ ...ch, index: next++ })),
    }));
  }

  function applyVolumeListEdit(prev: BibleDraft, mutate: (volumes: ReturnType<typeof getVolumes>) => ReturnType<typeof getVolumes>): BibleDraft {
    const next = reindexVolumes(mutate(getVolumes(prev)));
    const [first, ...rest] = next;
    return {
      ...prev,
      outline: {
        ...prev.outline,
        volume_1: first,
        volumes: rest.length > 0 ? rest : undefined,
      },
    };
  }

  // Schema caps: volume_1 8-80 chapters; up to 20 extra volumes (each 1+).
  // Total cap across all volumes ≈ 80 + 20·N — practically unbounded.
  const TOTAL_CHAPTER_MAX = 1000;

  const totalChapters = useMemo(
    () => getVolumes(workingBible).reduce((sum, v) => sum + v.chapters.length, 0),
    [workingBible],
  );

  const addChapter = useCallback((volumeIndex: number) => {
    setWorkingBible((prev) => {
      const volumes = getVolumes(prev);
      if (volumes.reduce((s, v) => s + v.chapters.length, 0) >= TOTAL_CHAPTER_MAX) return prev;
      return applyVolumeListEdit(prev, (vols) => vols.map((vol, vi) => {
        if (vi !== volumeIndex) return vol;
        const nextLocalIndex = vol.chapters.length + 1;
        return {
          ...vol,
          chapter_count_estimate: Math.max(vol.chapter_count_estimate, nextLocalIndex),
          chapters: [
            ...vol.chapters,
            { index: 0, title: `第 ${nextLocalIndex} 章`, summary: "等待补写本章梗概…" },
          ],
        };
      }));
    });
  }, []);

  const removeChapter = useCallback((volumeIndex: number, chapterIndex: number) => {
    setWorkingBible((prev) => {
      const volumes = getVolumes(prev);
      // volume_1 must keep ≥ 8 (schema). Extra volumes can drop to 1.
      const minLen = volumeIndex === 0 ? 8 : 1;
      if (volumes[volumeIndex].chapters.length <= minLen) return prev;
      return applyVolumeListEdit(prev, (vols) => vols.map((vol, vi) => {
        if (vi !== volumeIndex) return vol;
        return {
          ...vol,
          chapters: vol.chapters.filter((_, ci) => ci !== chapterIndex),
        };
      }));
    });
  }, []);

  const addVolume = useCallback(() => {
    setWorkingBible((prev) => {
      const extras = prev.outline.volumes ?? [];
      if (extras.length >= 20) return prev;
      const volumeNumber = extras.length + 2; // volume_1 + extras
      return applyVolumeListEdit(prev, (vols) => [
        ...vols,
        {
          name: `第${volumeNumber}卷`,
          theme: "待定",
          chapter_count_estimate: 8,
          chapters: Array.from({ length: 8 }, (_, i) => ({
            index: 0,
            title: `第 ${i + 1} 章`,
            summary: "等待补写本章梗概…",
          })),
        },
      ]);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(undefined);
    setSuccess(false);
    try {
      const response = await fetch(`/api/novels/${novelId}/bible`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: workingBible }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? "保存失败");
      }
      setSuccess(true);
      onUpdate(workingBible);
      // Auto-hide success after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [novelId, workingBible, onUpdate]);

  const volumes = useMemo(() => getVolumes(workingBible), [workingBible]);

  const tabs: { id: SectionTab; label: string; icon: React.ReactNode }[] = [
    { 
      id: "characters", 
      label: "角色", 
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
    },
    { 
      id: "world", 
      label: "世界", 
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    { 
      id: "outline", 
      label: "大纲", 
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
    },
  ];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-border-subtle bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-text-muted hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-200"
            title="返回目录"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h2 className="text-[14px] font-bold text-text-primary tracking-tight">全书作品设定</h2>
            <p className="text-[10px] text-text-dim font-medium uppercase tracking-[0.1em]">Narrative Bible</p>
          </div>
        </div>
        <div className="flex items-center">
          <div className={`h-1.5 w-1.5 rounded-full mr-2 ${saving ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 opacity-60'}`} />
          <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Editor</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle/50 px-2 bg-secondary/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-1 flex flex-col items-center gap-1.5 transition-all relative ${
              activeTab === tab.id 
                ? "text-primary" 
                : "text-text-dim hover:text-text-secondary hover:bg-secondary/20"
            }`}
          >
            {tab.icon}
            <span className="text-[10px] font-bold tracking-wider">{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Sections Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-secondary/5">
        {activeTab === "characters" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {workingBible.characters.map((char, idx) => (
              <div key={idx} className="group bg-white border border-border-subtle rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                     {char.role === 'protagonist' ? (
                       <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                     ) : (
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                     )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        char.role === 'protagonist' ? 'bg-primary/10 text-primary' : 'bg-secondary text-text-dim'
                      }`}>
                        {char.role === 'protagonist' ? '主角' : '配角'}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={char.name}
                      onChange={(e) => updateCharacter(idx, { name: e.target.value })}
                      className="w-full text-[15px] font-bold text-text-primary bg-transparent focus:outline-none placeholder:text-text-dim/50"
                      placeholder="点击设置角色姓名"
                    />
                  </div>
                </div>
                
                <div className="space-y-3 pt-3 border-t border-border-subtle/50">
                  <TraitField label="性格" value={char.personality} onChange={(v) => updateCharacter(idx, { personality: v })} icon="🎭" />
                  <TraitField label="动机" value={char.motivation} onChange={(v) => updateCharacter(idx, { motivation: v })} icon="🎯" />
                  <TraitField label="目标" value={char.goals} onChange={(v) => updateCharacter(idx, { goals: v })} icon="🏁" />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "world" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="bg-white border border-border-subtle rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-text-primary">核心世界观</h4>
                    <p className="text-[10px] text-text-dim">核心设定与限制条件</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {workingBible.world.rules.map((rule, idx) => (
                    <div key={idx} className="relative group">
                      <textarea
                        value={rule}
                        onChange={(e) => updateWorldRule(idx, e.target.value)}
                        className="w-full text-[12px] text-text-secondary bg-secondary/20 border border-transparent rounded-xl px-4 py-3 focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all outline-none min-h-[80px] leading-relaxed resize-none"
                        placeholder="输入一条世界规则或背景设定..."
                      />
                      {workingBible.world.rules.length > 1 && (
                        <button
                          onClick={() => removeWorldRule(idx)}
                          className="absolute top-2 right-2 p-1.5 bg-white shadow-sm border border-border-subtle rounded-lg text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {workingBible.world.rules.length < 6 && (
                    <button
                      onClick={addWorldRule}
                      className="w-full py-3 border-2 border-dashed border-border-subtle rounded-2xl text-[12px] font-bold text-text-dim hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group"
                    >
                      <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      添加新规则
                    </button>
                  )}
                </div>
             </div>
          </div>
        )}

        {activeTab === "outline" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">
                共 {totalChapters} 章 / {volumes.length} 卷
              </span>
            </div>
            {volumes.map((vol, volIdx) => {
              const minLen = volIdx === 0 ? 8 : 1;
              const canRemove = vol.chapters.length > minLen;
              return (
              <div key={volIdx} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <div className="h-6 w-1 bg-primary rounded-full" />
                  <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-[0.15em]">
                    VOL {volIdx + 1} <span className="text-text-dim mx-1">/</span> {vol.name}
                  </h4>
                  <span className="text-[10px] text-text-dim ml-auto">{vol.chapters.length} 章</span>
                </div>

                <div className="space-y-4">
                  {vol.chapters.map((ch, chIdx) => (
                    <div key={`${volIdx}-${chIdx}`} className="bg-white border border-border-subtle rounded-2xl p-4 shadow-sm hover:border-primary/20 transition-all group relative">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-[10px] font-black text-text-dim group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          {String(ch.index).padStart(2, "0")}
                        </span>
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => updateChapter(volIdx, chIdx, { title: e.target.value })}
                          className="flex-1 text-[13px] font-bold text-text-primary bg-transparent focus:outline-none placeholder:text-text-dim/50"
                          placeholder="章节名称"
                        />
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => removeChapter(volIdx, chIdx)}
                            title={`从本卷删除该章节（保留 ChapterDraft 数据，仅从大纲移除）`}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            aria-label="删除章节"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                      <textarea
                        value={ch.summary}
                        onChange={(e) => updateChapter(volIdx, chIdx, { summary: e.target.value })}
                        className="w-full text-[11px] text-text-secondary bg-secondary/10 border border-transparent rounded-xl px-3 py-2.5 focus:bg-white focus:border-border-subtle transition-all outline-none resize-none leading-relaxed min-h-[60px]"
                        rows={3}
                        placeholder="本章剧情梗概..."
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addChapter(volIdx)}
                    className="w-full py-2.5 border-2 border-dashed border-border-subtle rounded-2xl text-[12px] font-bold text-text-dim hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    在本卷末尾新增章节
                  </button>
                </div>
              </div>
              );
            })}
            {volumes.length === 1 && (
              <div className="flex items-center gap-3 px-3 py-3 bg-primary/5 border border-primary/10 rounded-2xl">
                <svg className="w-4 h-4 text-primary/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-[11px] text-text-secondary leading-relaxed">当前仅有一卷大纲。若故事需要更多篇章，可添加分卷扩展叙事架构。</span>
              </div>
            )}
            {volumes.length < 21 && (
              <button
                type="button"
                onClick={addVolume}
                className="w-full py-3 border-2 border-dashed border-primary/30 rounded-2xl text-[12px] font-bold text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                新增分卷（含 8 章占位）
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="p-4 border-t border-border-subtle bg-white space-y-3">
        {error && (
          <div className="text-[11px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-3 animate-in shake duration-300">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>设定已同步至云端，下次生成将参考最新数据</span>
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full relative overflow-hidden bg-primary hover:bg-primary-hover disabled:bg-primary/40 text-white text-[13px] font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              正在同步数据...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              保存并应用设定
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function TraitField({ label, value, onChange, icon }: { label: string; value: string; onChange: (v: string) => void; icon: string }) {
  return (
    <div className="flex flex-col gap-1.5 group/field">
      <div className="flex items-center gap-2">
        <span className="text-[10px] grayscale group-focus-within/field:grayscale-0 transition-all">{icon}</span>
        <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">{label}</label>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[12px] text-text-secondary bg-secondary/30 border border-transparent rounded-xl px-3 py-2.5 focus:bg-white focus:border-primary/20 transition-all outline-none"
        placeholder={`设置${label}...`}
      />
    </div>
  );
}

