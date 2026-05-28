"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/StatusStates";
import { formatDate } from "@/lib/format/datetime";

interface UsageSummary {
  totalCalls: number;
  totalTokenIn: number;
  totalTokenOut: number;
  totalCostCny: number;
  byRoute: Record<string, { calls: number; tokenIn: number; tokenOut: number; costCny: number }>;
  byAgent: Record<string, { calls: number; tokenIn: number; tokenOut: number; costCny: number }>;
}

interface QuotaInfo {
  allowed: boolean;
  reason?: string;
  limitType?: string;
  dailyCostCny: number;
  monthlyCostCny: number;
  dailyLimitCny: number;
  monthlyLimitCny: number;
  dailyCalls: number;
  monthlyCalls: number;
  dailyCallLimit: number;
  monthlyCallLimit: number;
  singleRequestLimitCny: number;
  nextDailyResetAt: string;
  nextMonthlyResetAt: string;
}

interface UsageRecord {
  id: string;
  novel_id: string | null;
  agent: string | null;
  route: string;
  model: string;
  status: string;
  error_code: string | null;
  token_in: number;
  token_out: number;
  cost_cny: number;
  took_ms: number | null;
  created_at: string;
}

interface TrendPoint {
  date: string;
  calls: number;
  failures: number;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
}

interface UsageData {
  daily: UsageSummary;
  monthly: UsageSummary;
  quota: QuotaInfo;
  monthlyStatus: { ok: number; err: number; failureRate: number };
  records: UsageRecord[];
  trend: TrendPoint[];
}

const agentLabels: Record<string, string> = {
  writer: "起草",
  critic: "审校",
  state_updater: "状态更新",
  outline: "节拍",
  summarizer: "摘要",
  tiered_summarizer: "卷/书摘要",
  consistency: "一致性",
  logline: "灵感",
  questions: "追问",
  bible: "设定",
};

const routeLabels: Array<[string, string]> = [
  ["/chapters/draft/revise", "章节修订"],
  ["/chapters/draft", "章节起草"],
  ["/chapters/critic", "章节审校"],
  ["/chapters/outline", "节拍生成"],
  ["/state-diff", "状态分析"],
  ["/summarize", "章节摘要"],
  ["/consistency", "一致性检查"],
  ["/loglines", "灵感推荐"],
  ["/questions", "追问生成"],
  ["/bible", "设定生成"],
  ["/embedding", "记忆索引"],
];

function formatCost(value: number): string {
  if (value < 0.01) return `¥${value.toFixed(4)}`;
  return `¥${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function displayAgent(agent: string | null): string {
  if (!agent) return "未分类";
  return agentLabels[agent] ?? agent;
}

function displayRoute(route: string): string {
  return routeLabels.find(([pattern]) => route.includes(pattern))?.[1] ?? route;
}

function quotaTone(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 1) return "danger";
  if (percent >= 0.8) return "warn";
  return "ok";
}

function statusText(tone: "ok" | "warn" | "danger"): string {
  if (tone === "danger") return "已达到限制";
  if (tone === "warn") return "接近限制";
  return "余量充足";
}

export default function ActivityPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/usage?limit=120");
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "用量数据加载失败");
        return;
      }
      setData(json.data);
    } catch {
      setError("网络连接异常");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const filteredRecords = useMemo(() => {
    const records = data?.records ?? [];
    return records.filter((record) => {
      const agentOk = filterAgent === "all" || record.agent === filterAgent;
      const statusOk = filterStatus === "all" || record.status === filterStatus;
      return agentOk && statusOk;
    });
  }, [data?.records, filterAgent, filterStatus]);

  const maxTrendCost = Math.max(0.0001, ...(data?.trend.map((point) => point.costCny) ?? [0]));
  const quota = data?.quota;
  const monthlyCostRatio = quota ? quota.monthlyCostCny / quota.monthlyLimitCny : 0;
  const monthlyCallRatio = quota ? quota.monthlyCalls / quota.monthlyCallLimit : 0;
  const monthlyTone = quotaTone(Math.max(monthlyCostRatio, monthlyCallRatio));
  const availableAgents = Object.entries(data?.monthly.byAgent ?? {})
    .sort((a, b) => b[1].costCny - a[1].costCny)
    .slice(0, 8);

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-24">
        <PageHeader
          title="我的 AI 用量"
          description="查看本月调用、token、费用趋势和失败情况。"
          actions={
            <button onClick={loadUsage} className="btn-secondary gap-2 px-5">
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M20 8A8 8 0 006.34 4.69M4 16a8 8 0 0013.66 3.31" />
              </svg>
              刷新
            </button>
          }
        />

        {loading ? (
          <div className="py-24">
            <LoadingState message="正在加载用量数据…" />
          </div>
        ) : error ? (
          <div className="mt-10">
            <ErrorState title="用量数据加载失败" message={error} onRetry={loadUsage} />
          </div>
        ) : !data || !quota ? (
          <div className="mt-10">
            <EmptyState title="暂无用量数据" description="开始使用 AI 起草或审校后，这里会显示你的调用记录。" />
          </div>
        ) : (
          <div className="mt-10 grid gap-8">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="今日调用"
                value={data.daily.totalCalls.toLocaleString()}
                sub={`${data.daily.totalTokenIn + data.daily.totalTokenOut} tokens`}
              />
              <MetricCard
                label="本月调用"
                value={data.monthly.totalCalls.toLocaleString()}
                sub={`失败率 ${formatPercent(data.monthlyStatus.failureRate)}`}
              />
              <MetricCard
                label="本月费用"
                value={formatCost(data.monthly.totalCostCny)}
                sub={`日额度 ${formatCost(quota.dailyLimitCny)} · 月额度 ${formatCost(quota.monthlyLimitCny)}`}
              />
              <MetricCard
                label="单次预算"
                value={formatCost(quota.singleRequestLimitCny)}
                sub={quota.allowed ? statusText(monthlyTone) : quota.reason ?? "当前不可继续调用"}
                tone={quota.allowed ? monthlyTone : "danger"}
              />
            </section>

            <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="card bg-white border-border-subtle p-0 overflow-hidden">
                <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-border-subtle bg-secondary/20">
                  <div>
                    <h2 className="text-base font-bold text-text-primary">额度状态</h2>
                    <p className="text-xs text-text-muted mt-1">超额前会优先拦截高成本生成请求。</p>
                  </div>
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                    quota.allowed
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : "bg-red-50 text-red-700 border-red-100"
                  }`}>
                    {quota.allowed ? "可继续调用" : "已暂停调用"}
                  </span>
                </div>
                <div className="grid gap-5 p-6">
                  <QuotaMeter
                    label="今日费用"
                    value={quota.dailyCostCny}
                    limit={quota.dailyLimitCny}
                    resetAt={quota.nextDailyResetAt}
                  />
                  <QuotaMeter
                    label="本月费用"
                    value={quota.monthlyCostCny}
                    limit={quota.monthlyLimitCny}
                    resetAt={quota.nextMonthlyResetAt}
                  />
                  <QuotaMeter
                    label="本月调用次数"
                    value={quota.monthlyCalls}
                    limit={quota.monthlyCallLimit}
                    resetAt={quota.nextMonthlyResetAt}
                    unit=""
                  />
                </div>
              </div>

              <div className="card bg-white border-border-subtle p-0 overflow-hidden">
                <div className="px-6 py-5 border-b border-border-subtle bg-secondary/20">
                  <h2 className="text-base font-bold text-text-primary">近 14 天费用</h2>
                  <p className="text-xs text-text-muted mt-1">按调用完成时间聚合。</p>
                </div>
                <div className="p-6">
                  <div className="h-44 flex items-end gap-2">
                    {data.trend.map((point) => (
                      <div key={point.date} className="flex-1 min-w-0 flex flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t bg-primary/70 min-h-[4px]"
                          style={{ height: `${Math.max(4, (point.costCny / maxTrendCost) * 144)}px` }}
                          title={`${point.date} · ${point.calls} 次 · ${formatCost(point.costCny)}`}
                        />
                        <span className="text-[10px] text-text-dim tabular-nums">
                          {point.date.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-8 xl:grid-cols-[0.82fr_1.18fr]">
              <div className="card bg-white border-border-subtle p-0 overflow-hidden">
                <div className="px-6 py-5 border-b border-border-subtle bg-secondary/20">
                  <h2 className="text-base font-bold text-text-primary">Agent 分布</h2>
                  <p className="text-xs text-text-muted mt-1">按本月费用排序。</p>
                </div>
                <div className="p-6 space-y-4">
                  {availableAgents.length === 0 ? (
                    <EmptyState
                      size="compact"
                      title="暂无 Agent 用量"
                      description="本月还没有产生 AI 调用。"
                      className="bg-secondary/10 border-border-subtle rounded-xl"
                    />
                  ) : (
                    availableAgents.map(([agent, summary]) => (
                      <div key={agent} className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text-primary">{displayAgent(agent)}</p>
                          <p className="text-xs text-text-muted">{summary.calls} 次 · {(summary.tokenIn + summary.tokenOut).toLocaleString()} tokens</p>
                        </div>
                        <span className="text-sm font-bold text-text-primary tabular-nums">
                          {formatCost(summary.costCny)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card bg-white border-border-subtle p-0 overflow-hidden">
                <div className="flex flex-col gap-4 px-6 py-5 border-b border-border-subtle bg-secondary/20 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-text-primary">最近调用</h2>
                    <p className="text-xs text-text-muted mt-1">仅显示当前账号的最近 120 条记录。</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <select value={filterAgent} onChange={(event) => setFilterAgent(event.target.value)} className="input-base h-10 w-36 text-sm">
                      <option value="all">全部 Agent</option>
                      {Object.entries(agentLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="input-base h-10 w-32 text-sm">
                      <option value="all">全部状态</option>
                      <option value="ok">成功</option>
                      <option value="err">失败</option>
                    </select>
                  </div>
                </div>

                {filteredRecords.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      size="compact"
                      title="暂无匹配记录"
                      description="当前筛选条件下没有调用记录。"
                      className="bg-secondary/10 border-border-subtle rounded-xl"
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
                        <tr>
                          <th className="px-5 py-3 border-b border-border-subtle">时间</th>
                          <th className="px-5 py-3 border-b border-border-subtle">用途</th>
                          <th className="px-5 py-3 border-b border-border-subtle">状态</th>
                          <th className="px-5 py-3 border-b border-border-subtle text-right">Token</th>
                          <th className="px-5 py-3 border-b border-border-subtle text-right">耗时</th>
                          <th className="px-5 py-3 border-b border-border-subtle text-right">费用</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {filteredRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-secondary/30 transition-colors">
                            <td className="px-5 py-3.5 text-xs text-text-dim whitespace-nowrap">
                              {formatDate(new Date(record.created_at))}
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="font-bold text-text-primary">{displayAgent(record.agent)}</p>
                              <p className="text-xs text-text-muted mt-0.5">{displayRoute(record.route)}</p>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                                record.status === "ok"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : "bg-red-50 text-red-700 border-red-100"
                              }`}>
                                {record.status === "ok" ? "成功" : (record.error_code ?? "失败")}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right tabular-nums text-text-secondary text-xs">
                              {record.token_in.toLocaleString()} / {record.token_out.toLocaleString()}
                            </td>
                            <td className="px-5 py-3.5 text-right tabular-nums text-text-secondary text-xs">
                              {formatDuration(record.took_ms)}
                            </td>
                            <td className="px-5 py-3.5 text-right tabular-nums text-text-primary font-bold text-xs">
                              {formatCost(record.cost_cny)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone = "ok",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const toneClass = {
    ok: "text-primary bg-primary/10 border-primary/10",
    warn: "text-amber-700 bg-amber-50 border-amber-100",
    danger: "text-red-700 bg-red-50 border-red-100",
  }[tone];
  return (
    <div className="card bg-white border-border-subtle min-h-[132px] flex flex-col justify-between">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">{label}</p>
        <span className={`h-8 w-8 rounded-xl border flex items-center justify-center ${toneClass}`}>
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </span>
      </div>
      <div>
        <p className="text-3xl font-serif font-bold text-text-primary tabular-nums">{value}</p>
        <p className="mt-2 text-[11px] font-bold text-text-muted uppercase tracking-wider">{sub}</p>
      </div>
    </div>
  );
}

function QuotaMeter({
  label,
  value,
  limit,
  resetAt,
  unit = "¥",
}: {
  label: string;
  value: number;
  limit: number;
  resetAt: string;
  unit?: string;
}) {
  const ratio = limit > 0 ? Math.min(1, value / limit) : 0;
  const tone = quotaTone(ratio);
  const barClass = {
    ok: "bg-primary",
    warn: "bg-amber-500",
    danger: "bg-red-500",
  }[tone];
  const valueText = unit === "¥"
    ? `${formatCost(value)} / ${formatCost(limit)}`
    : `${value.toLocaleString()} / ${limit.toLocaleString()}`;
  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div>
          <p className="text-sm font-bold text-text-primary">{label}</p>
          <p className="text-xs text-text-muted mt-0.5">重置时间 {formatDate(new Date(resetAt))}</p>
        </div>
        <span className="text-sm font-bold tabular-nums text-text-primary">{valueText}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
      </div>
    </div>
  );
}
