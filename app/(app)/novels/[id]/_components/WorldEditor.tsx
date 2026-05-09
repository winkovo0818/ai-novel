"use client";

import Link from "next/link";

import type { BibleDraft } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

import { useBibleEdit } from "./useBibleEdit";
import { SaveBar } from "./SaveBar";

interface WorldEditorProps {
  novelId: string;
  bible: BibleDraft;
}

export function WorldEditor({ novelId, bible: initialBible }: WorldEditorProps) {
  const { bible, setBible, dirty, status, error, save } = useBibleEdit(novelId, initialBible);
  const world = bible.world;

  const updateWorld = (patch: Partial<typeof world>) => {
    setBible({ ...bible, world: { ...world, ...patch } });
  };

  const updateRule = (idx: number, value: string) => {
    updateWorld({ rules: world.rules.map((r, i) => (i === idx ? value : r)) });
  };

  const addRule = () => {
    if (world.rules.length >= 10) return;
    updateWorld({ rules: [...world.rules, ""] });
  };

  const removeRule = (idx: number) => {
    if (world.rules.length <= 2) return;
    updateWorld({ rules: world.rules.filter((_, i) => i !== idx) });
  };

  const updateGeo = (idx: number, value: string) => {
    updateWorld({ geography: world.geography.map((g, i) => (i === idx ? value : g)) });
  };

  const addGeo = () => {
    if (world.geography.length >= 10) return;
    updateWorld({ geography: [...world.geography, ""] });
  };

  const removeGeo = (idx: number) => {
    if (world.geography.length <= 2) return;
    updateWorld({ geography: world.geography.filter((_, i) => i !== idx) });
  };

  const updateFaction = (idx: number, patch: Partial<(typeof world.factions)[number]>) => {
    updateWorld({
      factions: world.factions.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    });
  };

  const addFaction = () => {
    if (world.factions.length >= 4) return;
    updateWorld({
      factions: [...world.factions, { name: "新势力", alignment: "中立", role: "" }],
    });
  };

  const removeFaction = (idx: number) => {
    if (world.factions.length <= 2) return;
    updateWorld({ factions: world.factions.filter((_, i) => i !== idx) });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-5xl mx-auto min-h-full pb-32">
        <PageHeader
          title="世界观"
          description="背景、规则、势力与地理。这些会被注入每次 AI 起草的 prompt。"
          breadcrumb={
            <span className="flex items-center gap-2">
              <Link href={`/novels/${novelId}`} className="hover:text-text-primary">{bible.meta.suggested_title}</Link>
              <span>·</span>
              <span>世界观</span>
            </span>
          }
        />

        <div className="mt-12 space-y-8">
          {/* Setting summary */}
          <Section title="背景设定" hint="40-180 字">
            <textarea
              value={world.setting_summary}
              onChange={(e) => updateWorld({ setting_summary: e.target.value })}
              rows={4}
              className="w-full text-sm bg-white border border-border-subtle rounded-md px-3 py-2.5 leading-relaxed focus:border-primary focus:outline-none resize-none"
            />
            <p className="mt-2 text-[11px] text-text-muted">
              当前 {world.setting_summary.length} 字
            </p>
          </Section>

          {/* World rules */}
          <Section title="世界规则" hint={`${world.rules.length} / 10`}>
            <div className="space-y-2">
              {world.rules.map((rule, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={rule}
                    onChange={(e) => updateRule(i, e.target.value)}
                    className="flex-1 text-sm bg-white border border-border-subtle rounded-md px-3 py-2 focus:border-primary focus:outline-none"
                    placeholder={`规则 ${i + 1}（不超过 40 字）`}
                  />
                  {world.rules.length > 2 && (
                    <button
                      onClick={() => removeRule(i)}
                      className="p-2 text-text-muted hover:text-red-500"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {world.rules.length < 10 && (
                <button
                  onClick={addRule}
                  className="w-full py-2 border border-dashed border-border-subtle rounded-md text-[11px] font-bold text-text-muted hover:border-primary/30 hover:text-primary"
                >
                  + 新增规则
                </button>
              )}
            </div>
          </Section>

          {/* Geography */}
          <Section title="地理 / 重要地点" hint={`${world.geography.length} / 10`}>
            <div className="space-y-2">
              {world.geography.map((geo, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={geo}
                    onChange={(e) => updateGeo(i, e.target.value)}
                    className="flex-1 text-sm bg-white border border-border-subtle rounded-md px-3 py-2 focus:border-primary focus:outline-none"
                  />
                  {world.geography.length > 2 && (
                    <button
                      onClick={() => removeGeo(i)}
                      className="p-2 text-text-muted hover:text-red-500"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {world.geography.length < 10 && (
                <button
                  onClick={addGeo}
                  className="w-full py-2 border border-dashed border-border-subtle rounded-md text-[11px] font-bold text-text-muted hover:border-primary/30 hover:text-primary"
                >
                  + 新增地点
                </button>
              )}
            </div>
          </Section>

          {/* Factions */}
          <Section title="势力" hint={`${world.factions.length} / 4`}>
            <div className="space-y-3">
              {world.factions.map((faction, i) => (
                <div key={i} className="border border-border-subtle rounded-md p-4 bg-white space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      value={faction.name}
                      onChange={(e) => updateFaction(i, { name: e.target.value })}
                      placeholder="势力名称"
                      className="text-base font-bold text-text-primary bg-transparent border-b border-border-subtle focus:border-primary focus:outline-none flex-1"
                    />
                    {world.factions.length > 2 && (
                      <button
                        onClick={() => removeFaction(i)}
                        className="p-1 text-text-muted hover:text-red-500"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">阵营</label>
                      <input
                        value={faction.alignment}
                        onChange={(e) => updateFaction(i, { alignment: e.target.value })}
                        className="w-full text-sm bg-white border border-border-subtle rounded-md px-3 py-2 mt-1 focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">在故事中的作用</label>
                      <input
                        value={faction.role}
                        onChange={(e) => updateFaction(i, { role: e.target.value })}
                        className="w-full text-sm bg-white border border-border-subtle rounded-md px-3 py-2 mt-1 focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {world.factions.length < 4 && (
                <button
                  onClick={addFaction}
                  className="w-full py-2.5 border border-dashed border-border-subtle rounded-md text-[11px] font-bold text-text-muted hover:border-primary/30 hover:text-primary"
                >
                  + 新增势力
                </button>
              )}
            </div>
          </Section>
        </div>
      </div>

      <SaveBar dirty={dirty} status={status} error={error} onSave={save} />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card bg-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
        {hint && <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
