"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message === "Invalid login credentials" ? "邮箱或密码错误" : authError.message);
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("next") || "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-32">
      <div className="w-full max-w-[440px] animate-fade">
        <div className="bg-surface border border-border-strong p-40 md:p-56 rounded-md shadow-lg">
          <div className="flex justify-center mb-40">
             <div className="h-48 w-48 rounded-sm bg-primary flex items-center justify-center text-white font-bold text-xl">A</div>
          </div>
          
          <div className="text-center mb-40">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">登录创作工作台</h1>
            <p className="mt-8 text-sm text-text-secondary leading-relaxed">
              欢迎回来。请同步您的身份凭据以继续创作。
            </p>
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
                placeholder="您的注册邮箱"
              />
            </div>
            <div className="grid gap-8">
              <div className="flex items-center justify-between">
                <label htmlFor="password" title="password" className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">访问密钥 / Access Key</label>
                <a href="/reset-password" title="reset-password" className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest transition-colors">
                  找回密钥
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base h-48"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-52 mt-16 text-base font-bold shadow-md shadow-primary/20"
            >
              {loading ? (
                <span className="flex items-center gap-8">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  正在同步...
                </span>
              ) : "立即登录"}
            </button>
          </form>

          <div className="mt-48 pt-24 border-t border-border-subtle text-center">
            <p className="text-sm text-text-muted">
              还没有创作账号？
              <a href="/signup" title="signup" className="ml-8 text-primary font-bold hover:underline transition-colors">
                初始化新账号
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
