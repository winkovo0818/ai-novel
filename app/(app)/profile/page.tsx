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
      const { data: { user } } = await supabase.auth.getUser();
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
      <div className="py-96">
        <LoadingState message="正在同步个人信息..." />
      </div>
    );
  }

  return (
    <div className="p-32 md:p-48 max-w-4xl mx-auto animate-fade">
      <PageHeader 
        title="个人设置" 
        description="管理您的账户信息、安全偏好及创作身份。"
      />

      <div className="grid gap-24">
        <section className="card bg-surface shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-24">身份识别</p>
          <div className="grid gap-12">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">登录邮箱 (主标识)</label>
            <p className="text-xl font-semibold text-text-primary">{email || "未绑定邮箱"}</p>
          </div>
        </section>

        <section className="card flex flex-col md:flex-row md:items-center justify-between gap-24">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-8">安全协议</p>
            <p className="text-base font-semibold text-text-primary">访问密钥保护</p>
            <p className="text-xs text-text-muted mt-4">定期更新密码以保障您的创作资产安全</p>
          </div>
          <a
            href="/reset-password"
            className="btn-secondary whitespace-nowrap"
          >
            重置登录密码
          </a>
        </section>

        <section className="card border-red-100 bg-red-50/30 flex flex-col md:flex-row md:items-center justify-between gap-24">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500 mb-8">会话终止</p>
            <p className="text-base font-semibold text-text-primary">当前活跃会话</p>
            <p className="text-xs text-text-muted mt-4">退出后将清除本地缓存并断开 AI 引擎连接</p>
          </div>
          <button
            onClick={handleLogout}
            className="btn-ghost !border-red-200 !text-red-600 hover:!bg-red-100 whitespace-nowrap"
          >
            终止当前会话
          </button>
        </section>
      </div>
    </div>
  );
}
