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
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-6 py-12 relative overflow-hidden">
      {/* Decorative Blur */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

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
                type="email"
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
                <a
                  href="/reset-password"
                  className="text-[11px] font-bold text-primary hover:underline transition-colors uppercase tracking-wider"
                >
                  忘记密钥？
                </a>
              }
            >
              <input
                id="password"
                type="password"
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
              className="btn-primary h-14 mt-4 text-base font-bold shadow-xl shadow-primary/20 rounded-2xl active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner label="正在校验权限..." /> : "进入创作空间"}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-border-strong text-center">
            <p className="text-[13px] font-medium text-text-muted leading-relaxed">
              尚未加入创作协议？
              <br />
              <a href="/signup" className="mt-2 inline-block text-primary font-bold hover:underline transition-colors uppercase tracking-widest text-[11px]">
                立即建立新档案 →
              </a>
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

function Field({
  label,
  id,
  right,
  children,
}: {
  label: string;
  id: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
          {label}
        </label>
        {right}
      </div>
      {children}
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-8 border border-red-100 bg-red-50/50 p-4 rounded-2xl text-[12px] text-red-700 flex items-start gap-3 animate-slide-in">
      <div className="h-5 w-5 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-600">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <span className="font-bold leading-relaxed">{children}</span>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-3">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {label}
    </span>
  );
}
