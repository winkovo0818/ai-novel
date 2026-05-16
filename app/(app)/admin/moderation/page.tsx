"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, LoadingState } from "@/components/ui/StatusStates";

interface ModerationAuditRow {
  id: string;
  user_id: string | null;
  novel_id: string | null;
  route: string;
  source: string;
  action: string;
  outcome: string;
  mode: string | null;
  code: string | null;
  reason: string | null;
  matched_pattern: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  text_hash: string;
  text_chars: number;
  created_at: string;
}

type ReviewStatus = "pending" | "confirmed" | "false_positive" | "ignored";

const statusLabels: Record<ReviewStatus, string> = {
  pending: "待复核",
  confirmed: "确认违规",
  false_positive: "误杀",
  ignored: "忽略",
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: ReviewStatus): string {
  if (status === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "confirmed") return "bg-red-50 text-red-700 border-red-200";
  if (status === "false_positive") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-secondary/70 text-text-secondary border-border-subtle";
}

export default function AdminModerationPage() {
  const [rows, setRows] = useState<ModerationAuditRow[]>([]);
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ review_status: status, perPage: "50" });
    return params.toString();
  }, [status]);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function fetchRows() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/moderation-audits?${query}`);
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
        return;
      }
      setRows(json.data.items);
      setTotal(json.data.total);
    } catch {
      setError("无法连接到服务器");
    } finally {
      setLoading(false);
    }
  }

  async function review(row: ModerationAuditRow, nextStatus: ReviewStatus) {
    setActingId(row.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/moderation-audits/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: nextStatus }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "更新失败");
        return;
      }
      setRows((current) => current.filter((item) => item.id !== row.id));
      setTotal((current) => Math.max(0, current - 1));
    } finally {
      setActingId(null);
    }
  }

  if (forbidden) {
    return (
      <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
        <div className="p-8 md:p-12 lg:p-16 max-w-3xl mx-auto min-h-full pb-24">
          <PageHeader title="内容审核队列" description="该模块仅对管理员开放。" />
          <div className="card bg-white mt-8 border-red-100 p-8 shadow-premium text-center">
            <h3 className="text-xl font-bold text-text-primary mb-2">访问权限不足</h3>
            <p className="text-text-secondary">当前账号没有访问内容审核队列的权限。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-32">
        <PageHeader
          title="内容审核队列"
          description="复核 ModerationAudit 决策。记录只包含审核元数据与文本哈希，不保存原文。"
        />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-2xl border border-border-subtle bg-white p-1 shadow-sm">
            {(Object.keys(statusLabels) as ReviewStatus[]).map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={`px-4 py-2 rounded-xl text-[12px] font-bold transition ${
                  status === item
                    ? "bg-text-primary text-white"
                    : "text-text-secondary hover:bg-secondary/70"
                }`}
              >
                {statusLabels[item]}
              </button>
            ))}
          </div>
          <div className="text-[12px] font-bold text-text-dim">当前筛选：{total} 条</div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-[12px] font-bold text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8">
          {loading ? (
            <div className="py-20">
              <LoadingState message="正在加载审核队列…" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="没有待显示记录" description="当前筛选下没有 ModerationAudit 记录。" />
          ) : (
            <div className="grid gap-4">
              {rows.map((row) => {
                const acting = actingId === row.id;
                return (
                  <article
                    key={row.id}
                    className="card bg-white p-5 rounded-3xl border border-border-subtle shadow-sm"
                  >
                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${statusClass(row.review_status)}`}>
                            {statusLabels[row.review_status]}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-secondary/70 text-text-secondary text-[10px] font-bold">
                            {row.source} / {row.action} / {row.outcome}
                          </span>
                          {row.mode && (
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold">
                              mode: {row.mode}
                            </span>
                          )}
                        </div>

                        <h3 className="text-[15px] font-bold text-text-primary mb-2">{row.route}</h3>
                        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 text-[11px] text-text-dim">
                          <div>创建：{formatDate(row.created_at)}</div>
                          <div>字符数：{row.text_chars}</div>
                          <div>用户：<span className="font-mono">{row.user_id ?? "-"}</span></div>
                          <div>作品：<span className="font-mono">{row.novel_id ?? "-"}</span></div>
                        </div>
                        <div className="mt-3 text-[11px] text-text-dim font-mono break-all">
                          sha256: {row.text_hash}
                        </div>
                        {(row.reason || row.matched_pattern || row.code) && (
                          <div className="mt-4 rounded-2xl border border-border-subtle bg-secondary/30 p-4 text-[12px] text-text-secondary">
                            {row.code && <div className="font-bold text-text-primary mb-1">{row.code}</div>}
                            {row.reason && <div>{row.reason}</div>}
                            {row.matched_pattern && (
                              <div className="mt-1 font-mono text-[11px]">pattern: {row.matched_pattern}</div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap xl:flex-col gap-2 xl:w-36">
                        <button
                          onClick={() => review(row, "confirmed")}
                          disabled={acting}
                          className="px-4 py-2 rounded-xl bg-red-600 text-white text-[11px] font-bold disabled:opacity-50"
                        >
                          确认违规
                        </button>
                        <button
                          onClick={() => review(row, "false_positive")}
                          disabled={acting}
                          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50"
                        >
                          标记误杀
                        </button>
                        <button
                          onClick={() => review(row, "ignored")}
                          disabled={acting}
                          className="px-4 py-2 rounded-xl border border-border-subtle bg-white text-text-secondary text-[11px] font-bold disabled:opacity-50"
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
