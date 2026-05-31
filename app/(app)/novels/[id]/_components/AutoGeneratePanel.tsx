"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RunStatus =
  | "planning"
  | "running"
  | "paused"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

interface RunData {
  active: true;
  id: string;
  status: RunStatus;
  current_chapter: number;
  total_chapters: number;
  done_chapters: number;
  cost_cny_spent: number;
  cost_cap_cny: number | null;
  quality_floor: number;
  revision_rounds: number;
  checkpoint_mode: string;
  last_error: string | null;
}

interface ApiResponse {
  active: false;
}

type PollResult = RunData | ApiResponse;

interface StartConfig {
  total_chapters: number;
  quality_floor: number;
  revision_rounds: number;
  cost_cap_cny: number;
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<RunStatus, { label: string; dot: string; ring: string }> = {
  planning: { label: "大纲规划中", dot: "bg-violet-500", ring: "ring-violet-200" },
  running: { label: "自动生成中", dot: "bg-blue-500 animate-pulse", ring: "ring-blue-200" },
  paused: { label: "已暂停", dot: "bg-amber-500", ring: "ring-amber-200" },
  needs_review: { label: "需人工审核", dot: "bg-orange-500", ring: "ring-orange-200" },
  completed: { label: "已完成", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  failed: { label: "失败", dot: "bg-red-500", ring: "ring-red-200" },
  cancelled: { label: "已取消", dot: "bg-zinc-400", ring: "ring-zinc-200" },
};

function isActive(status: RunStatus): boolean {
  return status === "running" || status === "planning";
}

function isPausable(status: RunStatus): boolean {
  return status === "running";
}

function isResumable(status: RunStatus): boolean {
  return status === "paused" || status === "needs_review";
}

function isCancellable(status: RunStatus): boolean {
  return isActive(status) || isResumable(status);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  novelId: string;
}

export default function AutoGeneratePanel({ novelId }: Props) {
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [acting, setActing] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  /* ---- fetch ---- */
  const fetchRun = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const res = await fetch(`/api/novels/${novelId}/auto-generate`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "请求失败");
      if (json.data.active) {
        setRun(json.data as RunData);
      } else {
        setRun(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络异常");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [novelId]);

  /* ---- polling ---- */
  useEffect(() => {
    mountedRef.current = true;
    fetchRun();
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [fetchRun]);

  useEffect(() => {
    if (run && isActive(run.status)) {
      pollingRef.current = setTimeout(fetchRun, 5_000);
      return () => {
        if (pollingRef.current) clearTimeout(pollingRef.current);
      };
    }
  }, [run, fetchRun]);

  /* ---- actions ---- */
  const doAction = async (action: "pause" | "cancel" | "resume") => {
    setActing(true);
    try {
      if (action === "resume") {
        const res = await fetch(`/api/novels/${novelId}/auto-generate/resume`, { method: "POST" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error?.message ?? "操作失败");
      } else {
        const res = await fetch(`/api/novels/${novelId}/auto-generate`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error?.message ?? "操作失败");
      }
      await fetchRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      if (mountedRef.current) setActing(false);
    }
  };

  const startRun = async (config: StartConfig) => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/auto-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "启动失败");
      setShowForm(false);
      await fetchRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : "启动失败");
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  };

  /* ---- render helpers ---- */
  const progressPct =
    run && run.total_chapters > 0 ? Math.min(100, Math.round((run.current_chapter / run.total_chapters) * 100)) : 0;

  const meta = run ? STATUS_META[run.status] : null;

  /* ---- initial loading ---- */
  if (loading) {
    return (
      <section className="mt-12 card bg-white/60 animate-pulse">
        <div className="h-6 w-48 bg-secondary rounded mb-4" />
        <div className="h-4 w-72 bg-secondary rounded" />
      </section>
    );
  }

  return (
    <section className="mt-12">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">
        全自动生成引擎 / AUTO-PILOT
      </h2>

      {/* Error toast */}
      {error && (
        <div className="mb-6 px-5 py-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4 font-bold">
            ×
          </button>
        </div>
      )}

      {/* ---- No active run: launch card ---- */}
      {!run && (
        <div className="card bg-white/80 border-dashed hover:border-accent/30 hover:shadow-premium transition-all duration-500 group">
          {!showForm ? (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-serif font-bold text-text-primary mb-2">
                  尚未启动自动生成
                </h3>
                <p className="text-sm text-text-dim leading-relaxed max-w-md">
                  配置章数、质量阈值和成本上限后，系统将无人值守逐章生成整本小说。中断后可随时恢复。
                </p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="btn-primary gap-2 shrink-0"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                启动全自动生成
              </button>
            </div>
          ) : (
            <StartForm
              onStart={startRun}
              onCancel={() => setShowForm(false)}
              loading={starting}
            />
          )}
        </div>
      )}

      {/* ---- Active run ---- */}
      {run && meta && (
        <div className="card bg-white/80 shadow-sm">
          {/* Status header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold ring-1 ${meta.ring}`}>
                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                <span className="text-text-primary">{meta.label}</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim">
                {run.current_chapter} / {run.total_chapters} 章
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-dim">
              <span className="tabular-nums text-text-secondary font-bold">
                ¥{run.cost_cny_spent.toFixed(2)}
              </span>
              {run.cost_cap_cny != null && (
                <span>
                  上限 ¥{run.cost_cap_cny.toFixed(0)}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">
              <span>生成进度</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  run.status === "completed" ? "bg-emerald-500" : "bg-accent"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-text-dim">
              <span>已入库 {run.done_chapters} 章</span>
              <span>目标 {run.total_chapters} 章</span>
            </div>
          </div>

          {/* Cost sub-info */}
          <div className="grid grid-cols-3 gap-4 mb-6 text-center">
            <div className="bg-secondary/50 rounded-2xl py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">质量门</div>
              <div className="text-sm font-bold text-text-primary tabular-nums">{run.quality_floor}%</div>
            </div>
            <div className="bg-secondary/50 rounded-2xl py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">自修轮数</div>
              <div className="text-sm font-bold text-text-primary tabular-nums">{run.revision_rounds}</div>
            </div>
            <div className="bg-secondary/50 rounded-2xl py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">检查点</div>
              <div className="text-sm font-bold text-text-primary">
                {run.checkpoint_mode === "on_fail" ? "异常时" : run.checkpoint_mode === "per_volume" ? "每卷" : "关闭"}
              </div>
            </div>
          </div>

          {/* needs_review banner */}
          {run.status === "needs_review" && run.last_error && (
            <div className="mb-6 p-5 rounded-2xl bg-orange-50 border border-orange-100">
              <div className="flex items-start gap-3">
                <svg aria-hidden="true" className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-sm font-bold text-orange-800 mb-1">自动挂起 — 需人工介入</p>
                  <p className="text-xs text-orange-600 leading-relaxed">{run.last_error}</p>
                </div>
              </div>
            </div>
          )}

          {/* completed banner */}
          {run.status === "completed" && (
            <div className="mb-6 p-5 rounded-2xl bg-emerald-50 border border-emerald-100">
              <div className="flex items-center gap-3">
                <svg aria-hidden="true" className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-bold text-emerald-800">全本生成完毕</p>
                  <p className="text-xs text-emerald-600">
                    {run.total_chapters} 章全部完成，总成本 ¥{run.cost_cny_spent.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {isPausable(run.status) && (
              <button
                onClick={() => doAction("pause")}
                disabled={acting}
                className="btn-secondary gap-2"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {acting ? "处理中…" : "暂停"}
              </button>
            )}
            {isResumable(run.status) && (
              <button
                onClick={() => doAction("resume")}
                disabled={acting}
                className="btn-primary gap-2"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {acting ? "处理中…" : "恢复生成"}
              </button>
            )}
            {isCancellable(run.status) && (
              <button
                onClick={() => doAction("cancel")}
                disabled={acting}
                className="btn-ghost text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                取消
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Start form (inline, inside the card)                              */
/* ------------------------------------------------------------------ */

const CHECKPOINT_OPTIONS = [
  { value: "on_fail", label: "异常时暂停（推荐）" },
  { value: "per_volume", label: "每卷暂停" },
  { value: "none", label: "完全自动" },
] as const;

function StartForm({
  onStart,
  onCancel,
  loading,
}: {
  onStart: (c: StartConfig) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [chapters, setChapters] = useState(40);
  const [floor, setFloor] = useState(85);
  const [rounds, setRounds] = useState(2);
  const [costCap, setCostCap] = useState(5);
  const [checkpoint, setCheckpoint] = useState("on_fail");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart({
      total_chapters: chapters,
      quality_floor: floor,
      revision_rounds: rounds,
      cost_cap_cny: costCap,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3 className="text-lg font-serif font-bold text-text-primary mb-6">配置自动生成参数</h3>

      <div className="grid gap-5 sm:grid-cols-2 mb-8">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">
            目标章数
          </label>
          <input
            type="number"
            value={chapters}
            onChange={(e) => setChapters(Math.max(1, Math.min(80, Number(e.target.value))))}
            className="input-base tabular-nums"
            min={1}
            max={80}
            required
          />
          <p className="text-[10px] text-text-dim mt-1">1-80 章，建议 40</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">
            质量阈值 (%)
          </label>
          <input
            type="number"
            value={floor}
            onChange={(e) => setFloor(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="input-base tabular-nums"
            min={0}
            max={100}
            required
          />
          <p className="text-[10px] text-text-dim mt-1">低于此值的章节挂起待审</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">
            自修轮数
          </label>
          <input
            type="number"
            value={rounds}
            onChange={(e) => setRounds(Math.max(0, Math.min(5, Number(e.target.value))))}
            className="input-base tabular-nums"
            min={0}
            max={5}
            required
          />
          <p className="text-[10px] text-text-dim mt-1">每章最多审校→修订轮次</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">
            成本上限 (元)
          </label>
          <input
            type="number"
            value={costCap}
            onChange={(e) => setCostCap(Math.max(1, Math.min(50, Number(e.target.value))))}
            className="input-base tabular-nums"
            min={1}
            max={50}
            required
          />
          <p className="text-[10px] text-text-dim mt-1">超限后自动暂停</p>
        </div>
      </div>

      <div className="mb-8">
        <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">
          人工检查点
        </label>
        <div className="flex gap-3">
          {CHECKPOINT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCheckpoint(opt.value)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
                checkpoint === opt.value
                  ? "bg-text-primary text-white shadow-md"
                  : "bg-secondary text-text-dim hover:bg-white hover:text-text-primary border border-transparent hover:border-border-subtle"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className={`btn-primary gap-2 ${loading ? "btn-loading" : ""}`}>
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {loading ? "大纲规划中，请稍候…" : "确认启动"}
        </button>
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost">
          取消
        </button>
      </div>
    </form>
  );
}
