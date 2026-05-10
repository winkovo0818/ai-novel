"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState, EmptyState } from "@/components/ui/StatusStates";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface AdminUser {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  roles: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminUsersPage() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users?perPage=100");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "加载失败");
      } else {
        setUsers(json.data.users);
      }
    } catch {
      setError("无法连接到服务器");
    } finally {
      setLoading(false);
    }
  }

  async function handleGrantAdmin(user: AdminUser) {
    setError("");
    setActingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "授权失败");
        return;
      }
      fetchUsers();
    } finally {
      setActingId(null);
    }
  }

  async function handleRevokeAdmin(user: AdminUser) {
    const ok = await confirm({
      title: `移除「${user.email ?? user.id}」的 admin 权限？`,
      message: "移除后该用户立即失去模型与权限管理页访问。如果意外删完所有 admin，可通过 .env 的 ADMIN_EMAILS 恢复。",
      confirmLabel: "移除权限",
      danger: true,
    });
    if (!ok) return;
    setError("");
    setActingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/roles/admin`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "移除失败");
        return;
      }
      fetchUsers();
    } finally {
      setActingId(null);
    }
  }

  if (forbidden) {
    return (
      <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
        <div className="p-8 md:p-12 lg:p-16 max-w-3xl mx-auto min-h-full pb-24">
          <PageHeader title="用户与权限" description="该模块仅对管理员开放。" />
          <div className="card bg-white mt-8 border-red-100 p-8 shadow-premium text-center">
            <div className="h-16 w-16 bg-red-100 rounded-3xl flex items-center justify-center text-red-600 mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">访问权限不足</h3>
            <p className="text-text-secondary max-w-sm mx-auto">
              当前账号没有访问用户与权限管理的权限。请联系系统管理员，或通过 .env 的 ADMIN_EMAILS 临时授权。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full pb-32">
        <PageHeader
          title="用户与权限"
          description="管理 admin 角色授权。env allowlist (ADMIN_EMAILS / ADMIN_USER_IDS) 仍作为永久兜底。"
        />

        {error && (
          <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-[12px] font-bold text-red-700">{error}</p>
          </div>
        )}

        <div className="mt-12">
          {loading ? (
            <div className="py-20">
              <LoadingState message="正在加载用户列表..." />
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="暂无用户" description="Supabase 项目下还没有任何注册用户。" />
          ) : (
            <div className="grid gap-4 animate-fade-in-up">
              {users.map((user) => {
                const isAdmin = user.roles.includes("admin");
                const acting = actingId === user.id;
                return (
                  <div
                    key={user.id}
                    className="card bg-white p-6 rounded-3xl border border-border-subtle hover:border-primary/30 shadow-sm hover:shadow-premium transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-6"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-text-primary truncate">{user.email ?? "（未绑定邮箱）"}</h3>
                        {isAdmin && (
                          <span className="px-2.5 py-1 bg-primary text-white text-[9px] font-bold rounded-lg uppercase tracking-widest ring-4 ring-primary/10">
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-text-dim">
                        <span>ID: <span className="font-mono">{user.id}</span></span>
                        <span>注册：{formatDate(user.created_at)}</span>
                        <span>上次登录：{formatDate(user.last_sign_in_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isAdmin ? (
                        <button
                          onClick={() => handleRevokeAdmin(user)}
                          disabled={acting}
                          className="px-5 py-2.5 text-[11px] font-bold rounded-xl border bg-white border-border-strong text-text-dim hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-all"
                        >
                          {acting ? "处理中..." : "移除 Admin"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGrantAdmin(user)}
                          disabled={acting}
                          className="px-5 py-2.5 text-[11px] font-bold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all"
                        >
                          {acting ? "处理中..." : "授权 Admin"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
