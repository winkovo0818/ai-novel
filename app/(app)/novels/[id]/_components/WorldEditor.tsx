"use client";

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
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full pb-32">
        <PageHeader
          title="世界观规则"
          description="背景、规则、势力与地理。这些设定将被注入 AI 创作引擎，确保叙事逻辑的严密与一致。"
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: bible.meta.suggested_title, href: `/novels/${novelId}` },
            { label: "世界观规则" }
          ]}
        />

        <div className="mt-12 space-y-10">
          {/* Setting summary */}
          <Section title="时空背景设定" hint="40-180 字" icon="globe">
            <textarea
              value={world.setting_summary}
              onChange={(e) => updateWorld({ setting_summary: e.target.value })}
              rows={4}
              className="w-full text-[14px] font-medium text-text-primary bg-secondary/30 border-none rounded-2xl px-5 py-4 leading-relaxed focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all resize-none shadow-inner"
              placeholder="描述故事发生的时间、地点及其核心特征..."
            />
            <div className="mt-3 flex justify-end">
               <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest bg-white px-2 py-0.5 rounded border border-border-subtle shadow-sm">
                 {world.setting_summary.length} / 180 CHARS
               </span>
            </div>
          </Section>

          {/* World rules */}
          <Section title="底层运行规则" hint={`${world.rules.length} / 10`} icon="rules">
            <div className="space-y-3">
              {world.rules.map((rule, i) => (
                <div key={i} className="flex gap-3 group">
                  <input
                    value={rule}
                    onChange={(e) => updateRule(i, e.target.value)}
                    className="flex-1 text-sm font-medium bg-secondary/30 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all shadow-inner"
                    placeholder={`定义一条世界法则（例如：魔法的代价、社会等级制度等）`}
                  />
                  {world.rules.length > 2 && (
                    <button
                      onClick={() => removeRule(i)}
                      className="p-2 text-text-dim hover:text-red-500 transition-colors"
                      title="移除规则"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {world.rules.length < 10 && (
                <button
                  onClick={addRule}
                  className="w-full py-4 bg-white border border-dashed border-border-strong rounded-2xl text-[11px] font-bold text-text-dim hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm"
                >
                  + 增添世界法则
                </button>
              )}
            </div>
          </Section>

          {/* Factions */}
          <Section title="活跃势力图谱" hint={`${world.factions.length} / 4`} icon="factions">
            <div className="grid gap-6 md:grid-cols-2">
              {world.factions.map((faction, i) => (
                <div key={i} className="card bg-white p-6 rounded-3xl border-border-subtle shadow-sm hover:shadow-md transition-all space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                       <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-text-dim mb-1 block">势力名称</label>
                       <input
                        value={faction.name}
                        onChange={(e) => updateFaction(i, { name: e.target.value })}
                        placeholder="例如：反抗军、议会"
                        className="text-lg font-bold text-text-primary bg-transparent border-b border-border-strong/50 focus:border-primary focus:outline-none w-full py-1"
                      />
                    </div>
                    {world.factions.length > 2 && (
                      <button
                        onClick={() => removeFaction(i)}
                        className="p-2 text-text-dim hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-text-dim mb-1 block">阵营倾向</label>
                      <input
                        value={faction.alignment}
                        onChange={(e) => updateFaction(i, { alignment: e.target.value })}
                        className="w-full text-xs font-bold bg-secondary/50 border-none rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-text-dim mb-1 block">叙事作用</label>
                      <textarea
                        value={faction.role}
                        onChange={(e) => updateFaction(i, { role: e.target.value })}
                        rows={2}
                        className="w-full text-xs font-medium bg-secondary/50 border-none rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all shadow-inner resize-none"
                        placeholder="描述该势力在故事冲突中的角色..."
                      />
                    </div>
                  </div>
                </div>
              ))}
              {world.factions.length < 4 && (
                <button
                  onClick={addFaction}
                  className="h-full min-h-[200px] bg-white border-2 border-dashed border-border-strong rounded-3xl flex flex-col items-center justify-center gap-3 text-text-dim hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all group"
                >
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                     </svg>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">新增势力节点</span>
                </button>
              )}
            </div>
          </Section>

          {/* Geography */}
          <Section title="关键地标 / 地理" hint={`${world.geography.length} / 10`} icon="map">
            <div className="grid gap-3 sm:grid-cols-2">
              {world.geography.map((geo, i) => (
                <div key={i} className="flex gap-2 group">
                  <input
                    value={geo}
                    onChange={(e) => updateGeo(i, e.target.value)}
                    className="flex-1 text-sm font-medium bg-secondary/30 border-none rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all shadow-inner"
                    placeholder="重要地点名称或地理特征"
                  />
                  {world.geography.length > 2 && (
                    <button
                      onClick={() => removeGeo(i)}
                      className="p-2 text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {world.geography.length < 10 && (
                <button
                  onClick={addGeo}
                  className="py-2.5 border border-dashed border-border-strong rounded-xl text-[11px] font-bold text-text-dim hover:border-primary/40 hover:text-primary transition-all shadow-sm bg-white"
                >
                  + 添加新地点
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

function Section({ title, hint, icon, children }: { title: string; hint?: string; icon: string; children: React.ReactNode }) {
  const iconMap: Record<string, React.ReactNode> = {
    globe: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>,
    rules: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
    factions: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
    map: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
  };

  return (
    <section className="card bg-white p-8 rounded-3xl border-border-subtle shadow-sm animate-fade-in">
      <div className="flex items-center justify-between mb-8 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
           <div className="h-8 w-8 rounded-xl bg-secondary flex items-center justify-center text-text-secondary shadow-inner">
             {iconMap[icon]}
           </div>
           <h3 className="text-base font-bold text-text-primary uppercase tracking-tight">{title}</h3>
        </div>
        {hint && <span className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
