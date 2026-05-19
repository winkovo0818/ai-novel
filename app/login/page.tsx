"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { Field, ErrorBanner, Spinner } from "@/components/auth/AuthForm";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("邮箱或密码错误");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("next") || "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-6 py-12 relative overflow-hidden">
      {/* Decorative Blur */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md animate-fade-in relative z-10">
        <div className="bg-white border border-border-subtle p-8 md:p-12 rounded-[32px] shadow-premium">
          <div className="flex flex-col items-center mb-10">
            <div className="h-12 w-12 rounded-2xl bg-text-primary flex items-center justify-center text-white font-bold text-xl shadow-premium mb-6">
              A
            </div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight uppercase">身份认证协议</h1>
            <p className="mt-2 text-[11px] font-bold text-text-dim uppercase tracking-[0.2em]">Identity Authentication</p>
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <form onSubmit={handleSubmit} className="grid gap-6">
            <Field label="访问令牌 (邮箱)" id="email">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base py-3 rounded-xl bg-secondary/50 border-none shadow-inner focus:ring-2 focus:ring-primary/20 focus:bg-white"
                placeholder="you@domain.com"
              />
            </Field>

            <Field
              label="权限密钥 (密码)"
              id="password"
              right={
                <Link
                  href="/reset-password"
                  className="text-[11px] font-bold text-primary hover:underline transition-colors uppercase tracking-wider"
                >
                  忘记密钥？
                </Link>
              }
            >
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base py-3 rounded-xl bg-secondary/50 border-none shadow-inner focus:ring-2 focus:ring-primary/20 focus:bg-white"
                placeholder="••••••••"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-14 mt-4 text-base font-bold shadow-xl shadow-primary/20 rounded-2xl active:scale-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner label="正在校验权限…" /> : "进入创作空间"}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-border-strong text-center">
            <p className="text-[13px] font-medium text-text-muted leading-relaxed">
              尚未加入创作协议？
              <br />
              <Link href="/signup" className="mt-2 inline-block text-primary font-bold hover:underline transition-colors uppercase tracking-widest text-[11px]">
                立即建立新档案 →
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
           <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.3em] opacity-40">AI Novel Studio Core · Ver 1.0.4</p>
        </div>
      </div>
    </main>
  );
}
