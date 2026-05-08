"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/update-password` },
    );

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-32">
        <div className="w-full max-w-[500px] bg-surface border border-border-strong p-48 text-center rounded-md shadow-lg animate-fade">
          <div className="flex justify-center mb-32">
             <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/30">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
               </svg>
             </div>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">重置链接已发送</h1>
          <p className="mt-24 text-sm text-text-secondary leading-relaxed">
            恢复协议已发送至 <br />
            <span className="font-bold text-text-primary text-base">{email}</span>
            <br /><br />
            请按照邮件中的指示重置您的访问密钥。
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
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">找回访问密钥</h1>
            <p className="mt-8 text-sm text-text-secondary leading-relaxed">输入您的身份标识以接收恢复指令。</p>
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
            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-52 mt-16 text-base font-bold shadow-md shadow-primary/20"
            >
              {loading ? "正在同步..." : "发送重置链接"}
            </button>
          </form>

          <div className="mt-48 pt-24 border-t border-border-subtle text-center">
            <a href="/login" className="text-sm text-primary font-bold hover:underline transition-colors">
              返回登录门户
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
