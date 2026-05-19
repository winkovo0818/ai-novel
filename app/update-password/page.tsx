"use client";

import { useState } from "react";
import Link from "next/link";

import { Field, ErrorBanner, Spinner } from "@/components/auth/AuthForm";

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
    const params = new URLSearchParams(window.location.search);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        token: params.get("token"),
        email: params.get("email"),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error?.message ?? "更新失败");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md bg-surface border border-border-subtle p-8 md:p-10 text-center rounded-2xl shadow-xl animate-fade">
          <div className="flex justify-center mb-6">
            <div className="h-12 w-12 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
              <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">密码已更新</h1>
          <p className="mt-4 text-sm text-text-secondary leading-relaxed">
            新密码已生效，下次用它登录即可。
          </p>
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
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">设置新密码</h1>
            <p className="mt-2 text-sm text-text-secondary">为账号设置一个新的访问密码。</p>
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <form onSubmit={handleSubmit} className="grid gap-5">
            <Field label="新密码" id="password" hint="至少 6 位字符">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base"
                placeholder="••••••••"
              />
            </Field>
            <Field label="确认新密码" id="confirmPassword">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-base"
                placeholder="再次输入新密码"
              />
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-11 mt-2 text-base shadow-md shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner label="更新中…" /> : "更新密码"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
