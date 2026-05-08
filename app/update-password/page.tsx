"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function UpdatePasswordPage() {
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
    const { error: authError } = await supabase.auth.updateUser({ password });

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
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">密钥重置成功</h1>
          <p className="mt-24 text-sm text-text-secondary leading-relaxed">
            您的访问密钥已成功更新。 <br />
            新的安全协议现已生效。
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
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">更新访问密钥</h1>
            <p className="mt-8 text-sm text-text-secondary leading-relaxed">初始化您的新安全凭据。</p>
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
              <label htmlFor="password" title="password" className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">新访问密钥 / New Key</label>
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
                placeholder="重复输入新密钥"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-52 mt-16 text-base font-bold shadow-md shadow-primary/20"
            >
              {loading ? "正在同步..." : "确认更新"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
