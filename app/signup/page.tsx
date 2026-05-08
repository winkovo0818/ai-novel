"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    let authError: { message: string } | null = null;

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      authError = error;
    } catch {
      setError("无法连接认证服务，请检查网络连接");
      setLoading(false);
      return;
    }

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-32">
        <div className="w-full max-w-[500px] bg-surface border border-border-strong p-48 text-center rounded-md shadow-lg animate-fade">
          <div className="flex justify-center mb-32">
             <div className="h-16 w-16 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
               </svg>
             </div>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">注册请求已发送</h1>
          <p className="mt-24 text-sm text-text-secondary leading-relaxed">
            确认邮件已发送至 <br />
            <span className="font-bold text-text-primary text-base">{email}</span>
            <br /><br />
            请点击邮件中的链接以完成账号激活及身份授权。
          </p>
          <a
            href="/login"
            className="btn-primary mt-40 inline-block px-32"
          >
            返回登录门户
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-32">
      <div className="w-full max-w-[440px] animate-fade">
        <div className="bg-surface border border-border-strong p-40 md:p-56 rounded-md shadow-lg">
          <div className="flex justify-center mb-40">
             <div className="h-48 w-48 rounded-sm bg-primary flex items-center justify-center text-white font-bold text-xl">A</div>
          </div>

          <div className="text-center mb-40">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">初始化创作账号</h1>
            <p className="mt-8 text-sm text-text-secondary leading-relaxed">开启您的 AI 协同创作之旅。</p>
          </div>

          {error ? (
            <div className="mb-32 border border-red-200 bg-red-50 p-16 rounded-sm text-xs font-bold text-red-600 uppercase tracking-widest flex items-center gap-8">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="grid gap-24">
            <div className="grid gap-8">
              <label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">身份标识 / Identifier</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base h-48"
                placeholder="您的常用邮箱"
              />
            </div>
            <div className="grid gap-8">
              <label htmlFor="password" title="password" className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">访问密钥 / Access Key</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base h-48"
                placeholder="至少 6 位字符"
              />
            </div>
            <div className="grid gap-8">
              <label htmlFor="confirmPassword" title="confirmPassword" className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">密钥确认 / Confirm</label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-base h-48"
                placeholder="重复输入密钥"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-52 mt-16 text-base font-bold shadow-md shadow-primary/20"
            >
              {loading ? "正在同步..." : "确认注册"}
            </button>
          </form>

          <div className="mt-48 pt-24 border-t border-border-subtle text-center">
             <p className="text-sm text-text-muted">
              已经有账号了？
              <a href="/login" title="login" className="ml-8 text-primary font-bold hover:underline transition-colors">
                立即登录
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
