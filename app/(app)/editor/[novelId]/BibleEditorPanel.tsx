"use client";

import { useState, useCallback } from "react";
import type { BibleDraft, Character, Volume } from "@/lib/validation/schemas";
import { getVolumes } from "@/lib/validation/schemas";

interface BibleEditorPanelProps {
  novelId: string;
  bible: BibleDraft;
  onUpdate: (updated: BibleDraft) => void;
  onBack: () => void;
}

export function BibleEditorPanel({ novelId, bible, onUpdate, onBack }: BibleEditorPanelProps) {
  const [workingBible, setWorkingBible] = useState<BibleDraft>(bible);
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
      if (prev.world.rules.length >= 4) return prev;
      return { ...prev, world: { ...prev.world, rules: [...prev.world.rules, ""] } };
    });
  }, []);

  const removeWorldRule = useCallback((index: number) => {
    setWorkingBible((prev) => {
      if (prev.world.rules.length <= 2) return prev;
      const nextRules = prev.world.rules.filter((_, i) => i !== index);
      return { ...prev, world: { ...prev.world, rules: nextRules } };
    });
  }, []);

  const updateChapter = useCallback((volumeIndex: number, chapterIndex: number, patch: Partial<{ title: string; summary: string }>) => {
    setWorkingBible((prev) => {
      const volumes = getVolumes(prev);
      const targetVolume = { ...volumes[volumeIndex], chapters: volumes[volumeIndex].chapters.map((ch, ci) => (ci === chapterIndex ? { ...ch, ...patch } : ch)) };
      if (volumeIndex === 0) {
        return { ...prev, outline: { ...prev.outline, volume_1: targetVolume } };
      }
      const extraVolumes = [...(prev.outline.volumes ?? [])];
      extraVolumes[volumeIndex - 1] = targetVolume;
      return { ...prev, outline: { ...prev.outline, volumes: extraVolumes } };
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [novelId, workingBible, onUpdate]);

  const volumes = getVolumes(workingBible);

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="p-20 border-b border-border-subtle bg-secondary/20 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <button
            onClick={onBack}
            className="p-6 text-text-muted hover:text-text-primary hover:bg-secondary rounded-sm transition-colors"
            title="返回章节目录"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-sm font-bold text-text-primary">全书设定</h2>
        </div>
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">BIBLE EDITOR</span>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-16">
        {/* Characters */}
        <section>
          <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-12 flex items-center gap-8">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            角色设定
          </h3>
          <div className="space-y-12">
            {workingBible.characters.map((char, idx) => (
              <div key={idx} className="p-12 bg-secondary/20 border border-border-subtle rounded-sm space-y-10">
                <div className="flex items-center gap-8">
                  <span className="text-[9px] px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold uppercase tracking-wider border border-primary/10">{char.role}</span>
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) => updateCharacter(idx, { name: e.target.value })}
                    className="text-sm font-bold text-text-primary bg-transparent border-b border-border-subtle focus:border-primary focus:outline-none flex-1"
                    placeholder="角色姓名"
                  />
                </div>
                <TextField label="性格" value={char.personality} onChange={(v) => updateCharacter(idx, { personality: v })} />
                <TextField label="动机" value={char.motivation} onChange={(v) => updateCharacter(idx, { motivation: v })} />
                <TextField label="目标" value={char.goals} onChange={(v) => updateCharacter(idx, { goals: v })} />
              </div>
            ))}
          </div>
        </section>

        {/* World Rules */}
        <section>
          <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-12 flex items-center gap-8">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            世界规则
          </h3>
          <div className="space-y-8">
            {workingBible.world.rules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-8">
                <input
                  type="text"
                  value={rule}
                  onChange={(e) => updateWorldRule(idx, e.target.value)}
                  className="flex-1 text-[12px] text-text-secondary bg-white border border-border-subtle rounded-sm px-10 py-8 focus:border-primary focus:outline-none"
                  placeholder="世界规则..."
                />
                {workingBible.world.rules.length > 2 && (
                  <button
                    onClick={() => removeWorldRule(idx)}
                    className="p-6 text-text-muted hover:text-red-500 transition-colors"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
            {workingBible.world.rules.length < 4 && (
              <button
                onClick={addWorldRule}
                className="w-full py-8 border border-dashed border-border-subtle rounded-sm text-[11px] font-bold text-text-muted hover:border-primary/30 hover:text-primary transition-all flex items-center justify-center gap-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                新增规则
              </button>
            )}
          </div>
        </section>

        {/* Outline Chapters */}
        <section>
          <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-12 flex items-center gap-8">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            章节大纲
          </h3>
          <div className="space-y-16">
            {volumes.map((vol, volIdx) => (
              <div key={volIdx}>
                {volumes.length > 1 && (
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-8 px-12 py-6 border-b border-border-subtle">
                    第 {volIdx + 1} 卷 / {vol.name}
                  </div>
                )}
                <div className="space-y-8">
                  {vol.chapters.map((ch, chIdx) => (
                    <div key={ch.index} className="p-10 bg-secondary/20 border border-border-subtle rounded-sm space-y-8">
                      <div className="flex items-center gap-8">
                        <span className="text-[9px] font-bold text-text-muted tracking-widest">UNIT {String(ch.index).padStart(2, "0")}</span>
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => updateChapter(volIdx, chIdx, { title: e.target.value })}
                          className="flex-1 text-[12px] font-bold text-text-primary bg-transparent border-b border-border-subtle focus:border-primary focus:outline-none"
                          placeholder="章节标题"
                        />
                      </div>
                      <textarea
                        value={ch.summary}
                        onChange={(e) => updateChapter(volIdx, chIdx, { summary: e.target.value })}
                        className="w-full text-[11px] text-text-secondary bg-white border border-border-subtle rounded-sm px-10 py-8 focus:border-primary focus:outline-none resize-none leading-relaxed"
                        rows={2}
                        placeholder="章节摘要..."
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom actions */}
      <div className="p-16 border-t border-border-subtle bg-secondary/10 space-y-8">
        {error && (
          <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-sm px-10 py-8 flex items-center gap-6">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}
        {success && (
          <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm px-10 py-8 flex items-center gap-6">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            设定已保存，下次 AI 起草将生效
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full btn-primary text-xs font-bold py-10 gap-8 disabled:opacity-50"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              保存中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              保存设定
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-6">
      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[12px] text-text-secondary bg-white border border-border-subtle rounded-sm px-10 py-8 focus:border-primary focus:outline-none"
        placeholder={label}
      />
    </div>
  );
}
