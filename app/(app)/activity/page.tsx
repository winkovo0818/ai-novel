"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState, ErrorState } from "@/components/ui/StatusStates";
import { formatDate } from "@/lib/format/datetime";

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

const agentLabels: Record<string, string> = {
  writer: "Writer", critic: "Critic", state_updater: "StateUpdater",
  outline: "Outline", summarizer: "Summarizer", tiered_summarizer: "TieredSum",
  consistency: "Consistency", logline: "Logline", questions: "Questions", bible: "Bible",
};

export default function ActivityPage() {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => { fetchRecords(); }, []);

  async function fetchRecords() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filterAgent !== "all") params.set("agent", filterAgent);
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/llm-usage?${params}`);
      if (res.status === 403) { setForbidden(true); return; }
      const json = await res.json();
      if (!json.ok) { setError(json.error?.message ?? "加载失败"); return; }
      setRecords(json.data.records);
    } catch { setError("网络连接异常"); } finally { setLoading(false); }
  }

  function applyFilter() { fetchRecords(); }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-24">
        <PageHeader title="AI 调用日志" description={forbidden ? "该模块仅对管理员开放。" : "查看所有 Chat 和 Embedding 模型调用记录、耗时与用量。"} />

        {forbidden ? (
          <div className="card bg-white mt-8 border-red-100 p-8 shadow-premium text-center">
            <div className="h-16 w-16 bg-red-100 rounded-3xl flex items-center justify-center text-red-600 mx-auto mb-6">
              <svg aria-hidden="true" className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">访问权限不足</h3>
            <p className="text-text-secondary max-w-sm mx-auto">AI 调用日志仅对管理员开放。请联系系统管理员进行授权。</p>
          </div>
        ) : (<>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}
            className="input-base w-40 text-sm">
            <option value="all">全部 Agent</option>
            {Object.entries(agentLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="input-base w-40 text-sm">
            <option value="all">全部状态</option>
            <option value="ok">成功</option>
            <option value="err">异常</option>
          </select>
          <button onClick={applyFilter} className="btn-primary px-6 h-10 text-sm rounded-xl">筛选</button>
        </div>

        {/* Table */}
        <div className="mt-8">
          {loading ? (
            <div className="py-20"><LoadingState message="正在加载活动记录…" /></div>
          ) : error ? (
            <ErrorState title="加载失败" message={error} onRetry={fetchRecords} />
          ) : records.length === 0 ? (
            <div className="py-20 text-center bg-secondary/10 rounded-2xl border border-dashed border-border-subtle">
              <p className="text-sm text-text-dim italic">暂无 AI 调用记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar rounded-xl border border-border-subtle">
              <table className="w-full text-left text-sm border-collapse bg-white">
                <thead>
                  <tr className="bg-secondary/50 text-[11px] font-bold text-text-dim uppercase tracking-wider">
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">Agent</th>
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">路由</th>
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">模型</th>
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">状态</th>
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap text-right">Token 入/出</th>
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap text-right">费用</th>
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap text-right">耗时</th>
                    <th className="px-5 py-3 border-b border-border-subtle whitespace-nowrap">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-text-primary">{r.agent ? (agentLabels[r.agent] ?? r.agent) : "—"}</td>
                      <td className="px-5 py-3.5 text-text-secondary font-mono text-xs">{r.route}</td>
                      <td className="px-5 py-3.5 text-text-secondary text-xs">{r.model}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          r.status === "ok" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                        }`}>{r.status === "ok" ? "OK" : (r.error_code ?? "ERR")}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-text-secondary text-xs">{r.token_in.toLocaleString()} / {r.token_out.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-text-primary font-bold text-xs">¥{r.cost_cny.toFixed(4)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-text-secondary text-xs">{r.took_ms != null ? `${(r.took_ms / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="px-5 py-3.5 text-text-dim text-xs whitespace-nowrap">{formatDate(new Date(r.created_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}
