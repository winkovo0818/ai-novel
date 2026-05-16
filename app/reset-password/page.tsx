"use client";

import { useState } from "react";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error?.message ?? "发送失败");
      setLoading(false);
      return;
    }

    const payload = await response.json().catch(() => null);
    setResetUrl(payload?.data?.resetUrl ?? "");
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md bg-surface border border-border-subtle p-8 md:p-10 text-center rounded-2xl shadow-xl animate-fade">
          <div className="flex justify-center mb-6">
            <div className="h-12 w-12 bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/30">
              <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">重置链接已发送</h1>
          <p className="mt-4 text-sm text-text-secondary leading-relaxed">
            我们已经把重置链接发到 <br />
            <span className="font-bold text-text-primary text-base">{email}</span>
            <br />
            <br />
            按照邮件里的指引重置密码即可。
          </p>
          {resetUrl && (
            <p className="mt-4 rounded-md bg-secondary px-3 py-2 text-xs text-text-muted break-all">
              本地开发重置链接：{resetUrl}
            </p>
          )}
          <Link href="/login" className="btn-primary mt-8 inline-block px-6 h-11">
            返回登录
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md animate-fade">
        <div className="bg-surface border border-border-subtle p-8 md:p-10 rounded-2xl shadow-xl">
          <div className="flex justify-center mb-6">
            <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center text-white font-bold">
              A
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">找回密码</h1>
            <p className="mt-2 text-sm text-text-secondary">输入注册邮箱，我们会发送重置链接给你。</p>
          </div>

          {error && (
            <div className="mb-5 border border-red-200 bg-red-50 px-3 py-2.5 rounded-md text-sm text-red-700 flex items-start gap-2">
              <svg aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-text-secondary">
                邮箱
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-11 mt-2 text-base shadow-md shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  发送中…
                </span>
              ) : (
                "发送重置链接"
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border-subtle text-center">
            <Link href="/login" className="text-sm text-primary font-bold hover:underline transition-colors">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
