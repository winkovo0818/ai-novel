"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/StatusStates";

interface CallRow {
  id: string;
  user_id: string;
  novel_id: string | null;
  route: string;
  agent: string | null;
  model: string;
  token_in: number;
  token_out: number;
  cost_cny: number;
  status: string;
  error_code: string | null;
  took_ms: number | null;
  created_at: string;
}

interface CallData {
  ok: boolean;
  data: {
    rows: CallRow[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
    summary: {
      totalCalls: number;
      totalTokenIn: number;
      totalTokenOut: number;
      totalCostCny: number;
    };
    aggregates: {
      byUser: AggregateUser[];
      byNovel: AggregateNovel[];
      byAgent: AggregateAgent[];
      byModel: AggregateModel[];
    };
  };
}

interface AggregateUser {
  userId: string;
  email: string | null;
  name: string | null;
  calls: number;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
}

interface AggregateNovel {
  novelId: string | null;
  title: string | null;
  userId: string | null;
  calls: number;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
}

interface AggregateAgent {
  agent: string | null;
  calls: number;
  failures: number;
  failureRate: number;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
}

interface AggregateModel {
  model: string;
  calls: number;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
}

const ROUTES = [
  { value: "", label: "全部路由" },
  { value: "/api/novels/[id]/chapters/draft", label: "章节起草" },
  { value: "/api/novels/[id]/chapters/draft/revise", label: "章节修订" },
  { value: "/embedding", label: "向量嵌入" },
  { value: "/api/onboarding/sessions/[id]/bible", label: "Bible 生成" },
  { value: "/api/onboarding/sessions/[id]/loglines", label: "灵感推荐" },
  { value: "/api/onboarding/sessions/[id]/questions", label: "追问生成" },
];

const STATUSES = [
  { value: "", label: "所有状态" },
  { value: "ok", label: "成功" },
  { value: "err", label: "失败" },
];

function formatCost(cny: number): string {
  if (cny < 0.01) return `¥${cny.toFixed(4)}`;
  return `¥${cny.toFixed(2)}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function agentLabel(agent: string | null): string {
  if (!agent) return "未分类";
  const labels: Record<string, string> = {
    writer: "起草",
    critic: "审校",
    state_updater: "状态更新",
    outline: "设定/节拍",
    summarizer: "摘要",
    tiered_summarizer: "卷/书摘要",
    consistency: "一致性",
    logline: "灵感",
    questions: "追问",
    bible: "Bible",
  };
  return labels[agent] ?? agent;
}

export default function AiCallsPage() {
  const [data, setData] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [route, setRoute] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), perPage: "50" });
        if (route) params.set("route", route);
        if (status) params.set("status", status);
        const res = await fetch(`/api/admin/ai-calls?${params}`);
        const json = await res.json();
        if (!json.ok) { setError(json.error?.message ?? "加载失败"); return; }
        setData(json);
      } catch {
        setError("网络连接异常");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page, route, status]);

  const rows = data?.data?.rows ?? [];
  const summary = data?.data?.summary ?? { totalCalls: 0, totalTokenIn: 0, totalTokenOut: 0, totalCostCny: 0 };
  const aggregates = data?.data?.aggregates ?? { byUser: [], byNovel: [], byAgent: [], byModel: [] };
  const totalPages = data?.data?.totalPages ?? 1;

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto animate-fade-in">
      <PageHeader 
        title="AI 调用记录" 
        description="查看系统级模型调用、Token 用量、耗时和成本。" 
      />

      <div className="grid gap-8 mt-10">
        {/* Statistics Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="总调用次数" 
            value={summary.totalCalls.toLocaleString()} 
            sub="本月累计"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          />
          <StatCard 
            label="输入 Token" 
            value={summary.totalTokenIn.toLocaleString()} 
            sub="Prompts"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
          />
          <StatCard 
            label="输出 Token" 
            value={summary.totalTokenOut.toLocaleString()} 
            sub="Generations"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
          />
          <StatCard 
            label="累计成本" 
            value={formatCost(summary.totalCostCny)} 
            sub="CNY"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3 1.343 3 3-1.343 3-3 3m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </section>

        {error && (
          <ErrorState title="调用记录加载失败" message={error} />
        )}

        {!error && (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <AggregatePanel
              title="高成本用户"
              subtitle="按当前筛选范围内费用排序"
              rows={aggregates.byUser.map((row) => ({
                id: row.userId,
                primary: row.email ?? row.name ?? row.userId,
                secondary: `${row.calls.toLocaleString()} 次 · ${(row.tokenIn + row.tokenOut).toLocaleString()} tokens`,
                value: formatCost(row.costCny),
              }))}
            />
            <AggregatePanel
              title="高成本作品"
              subtitle="定位费用集中的作品"
              rows={aggregates.byNovel.map((row) => ({
                id: row.novelId ?? "unknown",
                primary: row.title ?? row.novelId ?? "未关联作品",
                secondary: `${row.calls.toLocaleString()} 次 · 用户 ${row.userId ?? "未知"}`,
                value: formatCost(row.costCny),
              }))}
            />
            <AggregatePanel
              title="Agent 成本与失败率"
              subtitle="优先关注高失败且高成本的 Agent"
              rows={aggregates.byAgent.map((row) => ({
                id: row.agent ?? "unknown",
                primary: agentLabel(row.agent),
                secondary: `${row.calls.toLocaleString()} 次 · 失败 ${row.failures.toLocaleString()} 次 · 失败率 ${formatPercent(row.failureRate)}`,
                value: formatCost(row.costCny),
                danger: row.failureRate >= 0.2,
              }))}
            />
            <AggregatePanel
              title="模型成本"
              subtitle="按模型聚合 token 和费用"
              rows={aggregates.byModel.map((row) => ({
                id: row.model,
                primary: row.model,
                secondary: `${row.calls.toLocaleString()} 次 · ${(row.tokenIn + row.tokenOut).toLocaleString()} tokens`,
                value: formatCost(row.costCny),
              }))}
            />
          </section>
        )}

        {/* Filter & Table Area */}
        {!error && <section className="card !p-0 overflow-hidden shadow-premium bg-white border-border-strong/50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-8 border-b border-border-subtle bg-secondary/20">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <select
                  value={route}
                  onChange={(e) => { setRoute(e.target.value); setPage(1); }}
                  className="appearance-none bg-white border border-border-strong rounded-xl px-5 py-2.5 pr-12 text-sm font-bold text-text-primary focus:ring-2 focus:ring-accent/20 transition-all shadow-sm"
                >
                  {ROUTES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-dim">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>

              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                  className="appearance-none bg-white border border-border-strong rounded-xl px-5 py-2.5 pr-12 text-sm font-bold text-text-primary focus:ring-2 focus:ring-accent/20 transition-all shadow-sm"
                >
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-dim">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-text-muted">
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-4 border-2 border-text-dim border-t-transparent rounded-full animate-spin" />
                  更新中...
                </span>
              ) : (
                <span>共 {data?.data?.total ?? 0} 条记录</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-border-subtle">
                  <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">调用时间</th>
                  <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">Agent / 路由</th>
                  <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">模型</th>
                  <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim text-right">消耗 (In/Out)</th>
                  <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim text-right">响应时长</th>
                  <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim text-right">估算成本</th>
                  <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/40">
                {rows.map((row, idx) => (
                  <tr 
                    key={row.id} 
                    className="group hover:bg-secondary/40 transition-colors animate-fade-in-up"
                    style={{ animationDelay: `${idx * 20}ms` }}
                  >
                    <td className="px-8 py-5 whitespace-nowrap">
                      <p className="text-xs font-bold text-text-primary">
                        {new Date(row.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[13px] font-mono text-text-secondary bg-secondary/60 px-2.5 py-1 rounded-lg border border-border-subtle/50">
                        {row.agent || (row.route.length > 20 ? "..." + row.route.slice(-17) : row.route)}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[13px] font-medium text-text-muted">{row.model}</span>
                    </td>
                    <td className="px-8 py-5 text-right tabular-nums">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-text-primary">{row.token_in.toLocaleString()}</span>
                        <span className="text-[11px] text-text-dim">{(row.token_in + row.token_out).toLocaleString()} total</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right tabular-nums">
                      <span className={`text-[13px] font-medium ${row.took_ms && row.took_ms > 10000 ? "text-amber-600" : "text-text-muted"}`}>
                        {formatDuration(row.took_ms)}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right tabular-nums">
                      <span className="text-sm font-bold text-text-primary">{formatCost(row.cost_cny)}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      {row.status === "ok" ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                          <span className="text-[11px] font-bold tracking-wider">SUCCESS</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 border border-red-100 rounded-xl" title={row.error_code ?? ""}>
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[11px] font-bold tracking-wider">FAILURE</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-10 h-10 text-text-dim/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        <p className="text-sm font-serif text-text-muted">未发现匹配的调用记录</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-8 py-6 border-t border-border-subtle bg-secondary/10">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary !px-5 !py-2 text-[11px] disabled:opacity-40"
              >
                上一页
              </button>
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                  Page <span className="text-text-primary">{page}</span> of {totalPages}
                </span>
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary !px-5 !py-2 text-[11px] disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </section>}
      </div>
    </div>
  );
}

function AggregatePanel({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ id: string; primary: string; secondary: string; value: string; danger?: boolean }>;
}) {
  return (
    <div className="card bg-white border-border-strong/50 !p-0 overflow-hidden shadow-md">
      <div className="px-6 py-5 border-b border-border-subtle bg-secondary/20">
        <h2 className="text-base font-bold text-text-primary">{title}</h2>
        <p className="text-xs text-text-muted mt-1">{subtitle}</p>
      </div>
      <div className="divide-y divide-border-subtle">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-sm text-text-muted text-center">暂无聚合数据</div>
        ) : (
          rows.slice(0, 6).map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">{row.primary}</p>
                <p className={`text-xs mt-1 ${row.danger ? "text-red-600" : "text-text-muted"}`}>{row.secondary}</p>
              </div>
              <span className="text-sm font-bold text-text-primary tabular-nums shrink-0">{row.value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="card !p-7 flex flex-col justify-between group hover:border-accent/30 shadow-md hover:shadow-premium transition-all">
      <div className="flex items-start justify-between mb-6">
        <div className="p-3.5 rounded-2xl bg-secondary text-text-muted group-hover:bg-accent/10 group-hover:text-accent transition-colors shadow-sm">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-text-dim uppercase tracking-[0.25em] mb-2">{label}</p>
        <div className="flex items-baseline gap-2.5">
          <p className="text-3xl font-serif text-text-primary tracking-tight tabular-nums leading-none">{value}</p>
          <span className="text-xs font-bold text-text-muted">{sub}</span>
        </div>
      </div>
    </div>
  );
}
