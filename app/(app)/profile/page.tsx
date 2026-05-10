"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/StatusStates";

export default function ProfilePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? "");
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="py-24">
        <LoadingState message="加载中..." />
      </div>
    );
  }

  return (
    <div className="p-8 md:p-12 max-w-4xl mx-auto animate-fade">
      <PageHeader title="个人设置" description="管理你的账户、安全和创作身份。" />

      <div className="grid gap-6 mt-8">
        <section className="card">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">账户</p>
          <div className="grid gap-2">
            <label className="text-xs text-text-muted">登录邮箱</label>
            <p className="text-lg font-semibold text-text-primary">{email || "未绑定邮箱"}</p>
          </div>
        </section>

        <section className="card flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">密码</p>
            <p className="text-base font-semibold text-text-primary">修改登录密码</p>
            <p className="text-xs text-text-muted mt-1">建议定期更新以保护账户安全。</p>
          </div>
          <a href="/reset-password" className="btn-secondary whitespace-nowrap">
            重置密码
          </a>
        </section>

        <section className="card border-red-100 bg-red-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-red-600 mb-2">退出登录</p>
            <p className="text-base font-semibold text-text-primary">结束当前会话</p>
            <p className="text-xs text-text-muted mt-1">退出后会清除本地缓存。</p>
          </div>
          <button
            onClick={handleLogout}
            className="btn-ghost !border !border-red-200 !text-red-600 hover:!bg-red-100 whitespace-nowrap"
          >
            退出登录
          </button>
        </section>
      </div>
    </div>
  );
}
