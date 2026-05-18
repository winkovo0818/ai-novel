"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/StatusStates";

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/user/profile");
        const json = await res.json();
        if (!json.ok) { setError(json.error?.message ?? "加载失败"); return; }
        setProfile(json.data);
        setEditName(json.data.name ?? "");
        setEditImage(json.data.image ?? "");
      } catch {
        setError("网络连接异常");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload: Record<string, string> = {};
      if (editName !== (profile?.name ?? "")) payload.name = editName;
      if (editImage !== (profile?.image ?? "")) payload.image = editImage;

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error?.message ?? "保存失败"); return; }
      setProfile(json.data);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("网络连接异常");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="py-24">
        <LoadingState message="加载中…" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 md:p-12 max-w-5xl mx-auto">
        <p className="text-sm text-red-600">{error || "无法加载用户信息"}</p>
      </div>
    );
  }

  const avatarFallback = (profile.name?.[0] ?? profile.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <PageHeader 
          title="个人设置" 
          description="管理你的账户、安全和创作身份。" 
        />
        <button
          onClick={handleLogout}
          className="btn-secondary !px-6 !py-2.5 text-xs text-red-600 hover:text-red-700 hover:border-red-200"
        >
          退出当前账号
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-4 sticky top-12">
          <div className="card overflow-hidden !p-0 border-none shadow-premium bg-gradient-to-br from-white to-secondary/30">
            <div className="h-32 bg-text-primary/5 border-b border-border-subtle" />
            <div className="px-10 pb-10 -mt-16 text-center">
              <div className="relative inline-block group">
                {profile.image ? (
                  <img
                    src={profile.image}
                    alt="头像"
                    className="w-32 h-32 rounded-[2.5rem] object-cover ring-8 ring-white shadow-xl group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-[2.5rem] bg-text-primary text-white flex items-center justify-center text-4xl font-serif ring-8 ring-white shadow-xl group-hover:scale-105 transition-transform duration-500">
                    {avatarFallback}
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-white border border-border-subtle flex items-center justify-center text-text-primary shadow-md group-hover:shadow-lg transition-shadow">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
              
              <h2 className="mt-8 text-3xl font-serif text-text-primary tracking-tight">
                {profile.name || "未设置笔名"}
              </h2>
              <p className="text-base text-text-muted mt-2 font-medium">{profile.email}</p>
              
              <div className="mt-10 grid grid-cols-2 gap-4">
                <div className="bg-white/50 border border-border-subtle rounded-3xl p-4 text-center shadow-sm">
                  <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-1">身份</p>
                  <p className="text-sm font-bold text-text-secondary">创作者</p>
                </div>
                <div className="bg-white/50 border border-border-subtle rounded-3xl p-4 text-center shadow-sm">
                  <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-1">权限</p>
                  <p className="text-sm font-bold text-emerald-600">已激活</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Settings */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          {/* Identity Settings */}
          <section className="card animate-fade-in-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-serif text-text-primary">创作身份</h3>
                <p className="text-sm text-text-muted mt-1">展示在作品扉页和社区中的公开信息。</p>
              </div>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-bold text-accent hover:underline decoration-accent/30 underline-offset-4"
                >
                  编辑资料
                </button>
              )}
            </div>

            {editing ? (
              <div className="grid gap-8">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.1em] px-1">公开笔名</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={60}
                      placeholder="输入你的创作笔名"
                      className="input-base"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.1em] px-1">头像链接</label>
                    <input
                      type="url"
                      value={editImage}
                      onChange={(e) => setEditImage(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                      className="input-base"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-4 pt-4 border-t border-border-subtle/30">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary"
                  >
                    {saving ? "保存中..." : "保存更改"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setEditName(profile.name ?? ""); setEditImage(profile.image ?? ""); }}
                    className="btn-secondary"
                  >
                    取消
                  </button>
                  {saved && <span className="text-sm font-medium text-emerald-600 animate-slide-in">更改已保存</span>}
                  {error && <p className="text-sm font-medium text-red-600">{error}</p>}
                </div>
              </div>
            ) : (
              <div className="grid gap-6">
                <div className="flex items-center justify-between py-4 border-b border-border-subtle/30">
                  <span className="text-sm font-medium text-text-muted">笔名</span>
                  <span className="text-sm font-bold text-text-primary">{profile.name || "未设置"}</span>
                </div>
                <div className="flex items-center justify-between py-4 border-b border-border-subtle/30">
                  <span className="text-sm font-medium text-text-muted">作品主页</span>
                  <span className="text-sm font-bold text-text-primary">ai-novel.com/u/{profile.id.slice(0, 8)}</span>
                </div>
              </div>
            )}
          </section>

          {/* Account & Security */}
          <section className="card animate-fade-in-up delay-100">
            <h3 className="text-xl font-serif text-text-primary mb-8">账户与安全</h3>
            <div className="grid gap-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 border-b border-border-subtle/30">
                <div>
                  <p className="text-sm font-bold text-text-primary">绑定邮箱</p>
                  <p className="text-xs text-text-muted mt-0.5">用于登录和接收系统通知。</p>
                </div>
                <p className="text-sm font-mono text-text-secondary bg-secondary px-3 py-1 rounded-lg">{profile.email}</p>
              </div>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-bold text-text-primary">登录密码</p>
                  <p className="text-xs text-text-muted mt-0.5">建议每 90 天更新一次密码。</p>
                </div>
                <button
                  onClick={() => window.location.href = "/reset-password"}
                  className="btn-secondary !px-6 !py-2 text-xs"
                >
                  修改密码
                </button>
              </div>
            </div>
          </section>

          {/* Notifications Placeholder */}
          <section className="card animate-fade-in-up delay-200 opacity-60">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-serif text-text-primary">通知设置</h3>
              <span className="text-[10px] font-bold bg-secondary text-text-muted px-2 py-0.5 rounded uppercase tracking-wider">即将推出</span>
            </div>
            <p className="text-sm text-text-muted">管理作品更新、互动评论和系统消息的通知方式。</p>
          </section>
        </div>
      </div>
    </div>
  );
}