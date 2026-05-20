"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const GENRE_MAIN_OPTIONS = [
  { value: "web", label: "网文" },
  { value: "literary", label: "严肃文学" },
  { value: "script", label: "剧本" },
  { value: "fanfic", label: "同人" },
  { value: "shortstory", label: "短篇集" },
] as const;

const AUDIENCE_OPTIONS = [
  { value: "male", label: "男性向" },
  { value: "female", label: "女性向" },
  { value: "general", label: "普遍" },
] as const;

const LENGTH_OPTIONS = [
  { value: "short", label: "短篇 (≤5万字)" },
  { value: "mid", label: "中篇 (5-20万字)" },
  { value: "long", label: "长篇 (20-60万字)" },
  { value: "super_long", label: "超长篇 (60万字+)" },
] as const;

const TONE_OPTIONS = [
  { value: "cool", label: "冷静" },
  { value: "serious", label: "严肃" },
  { value: "healing", label: "治愈" },
  { value: "dark", label: "暗黑" },
  { value: "comedy", label: "喜剧" },
] as const;

const PACE_OPTIONS = [
  { value: "fast", label: "快节奏" },
  { value: "mid", label: "中等" },
  { value: "slow", label: "慢节奏" },
] as const;

const POV_OPTIONS = [
  { value: "first", label: "第一人称" },
  { value: "third_limited", label: "第三人称限知" },
  { value: "omniscient", label: "全知视角" },
] as const;

const CHAPTER_WORD_COUNT_OPTIONS = [
  { value: "2000", label: "2,000 字/章" },
  { value: "3000", label: "3,000 字/章" },
  { value: "5000", label: "5,000 字/章" },
] as const;

const AI_FREEDOM_OPTIONS = [
  { value: "conservative", label: "保守（贴合设定）" },
  { value: "mid", label: "均衡" },
  { value: "wild", label: "大胆（更多创意发散）" },
] as const;

interface ProfileData {
  genre_main: string;
  genre_sub: string;
  description?: string;
  audience: string;
  length: string;
  tone: string;
  pace: string;
  pov: string;
  chapter_word_count: number;
  ai_freedom: string;
}

export default function NovelSettingsClient({ novelId }: { novelId: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/novels/${novelId}`);
        const json = await res.json();
        if (!json.ok) { setError(json.error?.message ?? "加载失败"); return; }
        setProfile(json.data.profile as ProfileData);
      } catch {
        setError("网络连接异常");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [novelId]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/novels/${novelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error?.message ?? "保存失败"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("网络连接异常");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
        <div className="p-8 md:p-12 lg:p-16 max-w-3xl mx-auto">
          <p className="text-sm text-text-muted">加载中…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
        <div className="p-8 md:p-12 lg:p-16 max-w-3xl mx-auto">
          <p className="text-sm text-red-600">{error || "无法加载设置"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-3xl mx-auto pb-32">
        <nav className="flex items-center gap-2 text-[11px] font-bold text-text-dim uppercase tracking-wider mb-6">
          <button type="button" onClick={() => router.push(`/novels/${novelId}`)} className="hover:text-primary transition-colors">
            返回作品
          </button>
        </nav>

        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary mb-2">写作偏好设置</h1>
        <p className="text-sm text-text-muted mb-10">调整 AI 生成时的风格、节奏和自由度参数。修改后仅影响后续生成，不影响已有内容。</p>

        <div className="grid gap-8">
          <section className="bg-white border border-border-subtle rounded-2xl p-6 shadow-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-5">基础属性</h2>
            <div className="grid gap-5">
              <SelectField label="作品类型" value={profile.genre_main} onChange={(v) => setProfile({ ...profile, genre_main: v })} options={GENRE_MAIN_OPTIONS} />
              <InputField label="细分题材" value={profile.genre_sub} onChange={(v) => setProfile({ ...profile, genre_sub: v })} maxLength={40} />
              <TextareaField label="作品简介" value={profile.description ?? ""} onChange={(v) => setProfile({ ...profile, description: v })} maxLength={500} />
              <SelectField label="目标受众" value={profile.audience} onChange={(v) => setProfile({ ...profile, audience: v })} options={AUDIENCE_OPTIONS} />
              <SelectField label="作品篇幅" value={profile.length} onChange={(v) => setProfile({ ...profile, length: v })} options={LENGTH_OPTIONS} />
            </div>
          </section>

          <section className="bg-white border border-border-subtle rounded-2xl p-6 shadow-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-5">风格与节奏</h2>
            <div className="grid gap-5">
              <SelectField label="叙事基调" value={profile.tone} onChange={(v) => setProfile({ ...profile, tone: v })} options={TONE_OPTIONS} />
              <SelectField label="节奏" value={profile.pace} onChange={(v) => setProfile({ ...profile, pace: v })} options={PACE_OPTIONS} />
              <SelectField label="视角" value={profile.pov} onChange={(v) => setProfile({ ...profile, pov: v })} options={POV_OPTIONS} />
            </div>
          </section>

          <section className="bg-white border border-border-subtle rounded-2xl p-6 shadow-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-5">AI 参数</h2>
            <div className="grid gap-5">
              <SelectField label="章节字数目标" value={String(profile.chapter_word_count)} onChange={(v) => setProfile({ ...profile, chapter_word_count: Number(v) })} options={CHAPTER_WORD_COUNT_OPTIONS} />
              <SelectField label="AI 创作自由度" value={profile.ai_freedom} onChange={(v) => setProfile({ ...profile, ai_freedom: v })} options={AI_FREEDOM_OPTIONS} />
            </div>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary gap-2 px-8 disabled:opacity-40"
            >
              {saving ? "保存中…" : saved ? "已保存" : "保存设置"}
            </button>
            {saved && <span className="text-sm text-emerald-600">设置已更新</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-bold text-text-secondary">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-secondary/50 border border-transparent rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function InputField({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (v: string) => void; maxLength: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-bold text-text-secondary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="bg-secondary/50 border border-transparent rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition"
      />
    </div>
  );
}

function TextareaField({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (v: string) => void; maxLength: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-bold text-text-secondary">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={4}
        className="bg-secondary/50 border border-transparent rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition resize-y"
      />
      <span className="text-[11px] text-text-dim text-right">{value.length}/{maxLength}</span>
    </div>
  );
}