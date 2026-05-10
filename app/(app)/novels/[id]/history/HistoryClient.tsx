"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/PageHeader";

interface GenerationRow {
  id: string;
  agent: string;
  route: string;
  model: string;
  status: string;
  error_code?: string;
  token_in: number;
  token_out: number;
  cost_cny: number;
  took_ms?: number;
  created_at: string;
}

interface HistoryClientProps {
  novelId: string;
  initialData: GenerationRow[];
  initialAgent: string;
  initialStatus: string;
  breadcrumb: { label: string; href?: string }[];
}

const AGENT_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "全部 Agent" },
  { key: "writer", label: "起草" },
  { key: "critic", label: "审校" },
  { key: "state_updater", label: "状态" },
  { key: "outline", label: "节拍" },
  { key: "summarizer", label: "摘要" },
  { key: "tiered_summarizer", label: "卷/书摘要" },
  { key: "consistency", label: "一致性" },
  { key: "logline", label: "Logline" },
  { key: "questions", label: "追问" },
  { key: "bible", label: "Bible" },
];

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "全部状态" },
  { key: "ok", label: "成功" },
  { key: "err", label: "失败" },
];

const AGENT_LABELS: Record<string, string> = Object.fromEntries(
  AGENT_FILTERS.filter((f) => f.key !== "all").map((f) => [f.key, f.label]),
);

export function HistoryClient({
  novelId,
  initialData,
  initialAgent,
  initialStatus,
  breadcrumb,
}: HistoryClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [agent, setAgent] = useState(initialAgent);
  const [status, setStatus] = useState(initialStatus);
  const [active, setActive] = useState<GenerationRow>();

  const updateUrl = (nextAgent: string, nextStatus: string) => {
    const params = new URLSearchParams();
    if (nextAgent !== "all") params.set("agent", nextAgent);
    if (nextStatus !== "all") params.set("status", nextStatus);
    const qs = params.toString();
    startTransition(() =>
      router.replace(`/novels/${novelId}/history${qs ? `?${qs}` : ""}`),
    );
  };

  const totalCost = initialData.reduce((sum, r) => sum + r.cost_cny, 0);
  const failedCount = initialData.filter((r) => r.status === "err").length;

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full">
        <PageHeader
          title="生成历史"
          description={`最近 ${initialData.length} 次 AI 调用 · 失败 ${failedCount} 次 · 累计 ¥${totalCost.toFixed(4)}`}
          breadcrumb={breadcrumb}
        />

        {/* Filters */}
        <div className="mt-10 flex flex-wrap gap-3">
          <FilterGroup
            label="Agent"
            filters={AGENT_FILTERS}
            active={agent}
            onChange={(next) => {
              setAgent(next);
              updateUrl(next, status);
            }}
          />
          <FilterGroup
            label="状态"
            filters={STATUS_FILTERS}
            active={status}
            onChange={(next) => {
              setStatus(next);
              updateUrl(agent, next);
            }}
          />
        </div>

        {/* Table */}
        <div className="mt-8 card bg-white p-0 overflow-hidden">
          {initialData.length === 0 ? (
            <div className="text-center py-16 text-sm text-text-muted">
              当前筛选下没有调用记录。
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-secondary/40 text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
                <tr>
                  <th className="text-left px-5 py-3 font-bold">时间</th>
                  <th className="text-left px-5 py-3 font-bold">Agent</th>
                  <th className="text-left px-5 py-3 font-bold">状态</th>
                  <th className="text-right px-5 py-3 font-bold">Token</th>
                  <th className="text-right px-5 py-3 font-bold">耗时</th>
                  <th className="text-right px-5 py-3 font-bold">费用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {initialData.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setActive(row)}
                    className="cursor-pointer hover:bg-secondary/40 transition-colors"
                  >
                    <td className="px-5 py-3 text-text-secondary whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] px-2 py-0.5 bg-secondary text-text-secondary border border-border-subtle rounded-full font-bold uppercase tracking-wider">
                        {AGENT_LABELS[row.agent] ?? row.agent}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                          row.status === "ok"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-red-50 text-red-700 border-red-100"
                        }`}
                      >
                        {row.status === "ok" ? "成功" : row.error_code ?? "失败"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-text-secondary tabular-nums">
                      {row.token_in.toLocaleString()} / {row.token_out.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-text-muted tabular-nums">
                      {row.took_ms != null ? `${(row.took_ms / 1000).toFixed(1)} s` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-text-secondary tabular-nums">
                      ¥{row.cost_cny.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {active && (
        <div
          className="fixed inset-0 z-40 bg-black/30 flex items-end md:items-center justify-end"
          onClick={() => setActive(undefined)}
        >
          <div
            className="w-full md:max-w-md md:h-auto md:m-6 md:rounded-xl bg-white shadow-2xl border border-border-strong p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-text-primary">调用详情</h3>
              <button onClick={() => setActive(undefined)} className="text-text-muted hover:text-text-primary">×</button>
            </div>
            <dl className="space-y-3 text-[13px]">
              <DetailRow label="时间" value={new Date(active.created_at).toLocaleString("zh-CN")} />
              <DetailRow label="Agent" value={`${AGENT_LABELS[active.agent] ?? active.agent} (${active.agent})`} />
              <DetailRow label="路由" value={<code className="text-[12px]">{active.route}</code>} />
              <DetailRow label="模型" value={active.model} />
              <DetailRow label="状态" value={active.status === "ok" ? "成功" : `失败：${active.error_code ?? "-"}`} />
              <DetailRow label="Token in / out" value={`${active.token_in} / ${active.token_out}`} />
              <DetailRow label="耗时" value={active.took_ms != null ? `${active.took_ms} ms` : "未记录"} />
              <DetailRow label="费用" value={`¥${active.cost_cny.toFixed(6)}`} />
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  filters,
  active,
  onChange,
}: {
  label: string;
  filters: Array<{ key: string; label: string }>;
  active: string;
  onChange(next: string): void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-colors ${
              active === f.key
                ? "bg-text-primary text-white"
                : "bg-white text-text-secondary border border-border-subtle hover:border-primary/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-text-muted self-center">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
