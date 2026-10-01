"use client";

import StoryProgressPanel from "./StoryProgressPanel";
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
  continuous: boolean;
  planning_window: number;
  current_chapter: number;
  total_chapters: number;
  done_chapters: number;
  cost_cny_spent: number;
  cost_cap_cny: number | null;
  daily_cost_cap_cny?: number;
  daily_cost_cny_spent: number;
  pause_reason: string | null;
  resume_after: string | null;
  quality_floor: number;
  revision_rounds: number;
  checkpoint_mode: string;
  last_error: string | null;
}

interface StartConfig {
  continuous: boolean;
  planning_window: number;
  checkpoint_mode: string;
  total_chapters: number;
  quality_floor: number;
  revision_rounds: number;
  cost_cap_cny?: number;
  unlimited_budget?: boolean;
  daily_cost_cap_cny?: number;
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
  return isActive(status);
}

function isResumable(status: RunStatus): boolean {
  return status === "paused" || status === "needs_review" || status === "failed";
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
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchRun]);

  useEffect(() => {
    if (run && (isActive(run.status) || (run.status === "paused" && run.resume_after))) {
      pollingRef.current = setInterval(fetchRun, 5_000);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
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

  const increaseBudget = async (value: number) => {
    setActing(true);
    try {
      const res = await fetch(`/api/novels/${novelId}/auto-generate`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "budget", cost_cap_cny: value }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "预算更新失败");
      await fetchRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : "预算更新失败");
    } finally { if (mountedRef.current) setActing(false); }
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
                  选择固定章数或持续连载，设置质量阈值和累计预算后，系统将在后台逐章创作。关闭页面仍会继续，中断后可恢复。
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
                {run.continuous ? `持续连载 · 已完成 ${run.current_chapter} 章` : `${run.current_chapter} / ${run.total_chapters} 章`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-dim">
              <span className="tabular-nums text-text-secondary font-bold">
                ¥{run.cost_cny_spent.toFixed(2)}
              </span>
              {run.cost_cap_cny != null && (
                <span>
                  上限 ¥{run.cost_cap_cny.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {!run.continuous && <div className="mb-8">
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
          </div>}

          {run.continuous && <p className="mb-6 text-sm text-text-dim">
            本批计划至第 {run.total_chapters} 章，写完后再规划下一批。预算用尽或质量未通过时暂停。
          </p>}

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

          {run.daily_cost_cap_cny != null && <p className="mb-4 text-sm text-text-dim">
            本任务今日费用 ¥{run.daily_cost_cny_spent.toFixed(2)} / 每日预算 ¥{run.daily_cost_cap_cny.toFixed(2)}（北京时间）
          </p>}
          {run.status === "paused" && run.resume_after && <p role="status" className="mb-4 text-sm text-amber-700">
            等待预算或配额重置，预计 {new Date(run.resume_after).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 后自动续写。
          </p>}

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

          {(run.status === "paused" || run.status === "failed") && run.last_error && (
            <p className="mb-6 text-sm text-amber-700">{run.last_error}</p>
          )}
          {isResumable(run.status) && (
            <BudgetForm key={`${run.id}:${run.cost_cap_cny}`} current={Math.max(run.cost_cap_cny ?? 0, run.cost_cny_spent)}
              onSave={increaseBudget} loading={acting} />
          )}

          {isResumable(run.status) && <DailyBudgetForm key={`${run.id}:${run.daily_cost_cap_cny}`} current={run.daily_cost_cap_cny}
            loading={acting} onSave={async value => {
              setActing(true);
              try {
                const response = await fetch(`/api/novels/${novelId}/auto-generate`, { method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "daily_budget", daily_cost_cap_cny: value }) });
                const body = await response.json();
                if (!body.ok) throw new Error(body.error?.message ?? "更新失败");
                await fetchRun();
              } catch (e) { setError(e instanceof Error ? e.message : "更新失败"); }
              finally { setActing(false); }
            }} />}

          {/* completed banner */}
          {run.status === "completed" && (
            <div className="mb-6 p-5 rounded-2xl bg-emerald-50 border border-emerald-100">
              <div className="flex items-center gap-3">
                <svg aria-hidden="true" className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-bold text-emerald-800">本次生成已完成</p>
                  <p className="text-xs text-emerald-600">
                    已完成 {run.current_chapter} 章，总成本 ¥{run.cost_cny_spent.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {(isPausable(run.status) || (run.status === "paused" && run.resume_after)) && (
              <button
                onClick={() => doAction("pause")}
                disabled={acting}
                className="btn-secondary gap-2"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {acting ? "处理中…" : run.resume_after ? "停止自动唤醒" : "暂停"}
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
      {run && <StoryProgressPanel novelId={novelId} refreshKey={`${run.id}:${run.status}:${run.current_chapter}`} />}
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
  const [continuous, setContinuous] = useState(false);
  const [planningWindow, setPlanningWindow] = useState(10);
  const [chapters, setChapters] = useState(40);
  const [floor, setFloor] = useState(85);
  const [rounds, setRounds] = useState(2);
  const [costCap, setCostCap] = useState(5);
  const [unlimitedBudget, setUnlimitedBudget] = useState(false);
  const [checkpoint, setCheckpoint] = useState("on_fail");
  const [dailyEnabled, setDailyEnabled] = useState(false);
  const [dailyBudget, setDailyBudget] = useState(2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart({
      continuous, planning_window: planningWindow, checkpoint_mode: checkpoint,
      total_chapters: chapters,
      quality_floor: floor,
      revision_rounds: rounds,
      ...(unlimitedBudget ? { unlimited_budget: true } : { cost_cap_cny: costCap }),
      ...(dailyEnabled ? { daily_cost_cap_cny: dailyBudget } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3 className="text-lg font-serif font-bold text-text-primary mb-6">配置自动生成参数</h3>

      <label className="flex items-center gap-3 mb-4 text-sm text-text-primary">
        <input type="checkbox" checked={continuous} onChange={e => {
          setContinuous(e.target.checked);
          if (e.target.checked && checkpoint === "none") setCheckpoint("on_fail");
        }} />
        持续连载同一本小说（不预设完结章数）
      </label>
      {continuous && <p className="text-xs text-text-dim mb-6">分批规划后续剧情，按配置的预算和质量检查点持续推进。</p>}
      <div className="grid gap-5 sm:grid-cols-2 mb-8">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2" htmlFor="auto-generation-count">
            {continuous ? "每批规划章数" : "目标章数"}
          </label>
          <input id="auto-generation-count"
            type="number"
            value={continuous ? planningWindow : chapters}
            onChange={(e) => continuous ? setPlanningWindow(Math.max(1, Math.min(20, Number(e.target.value)))) : setChapters(Math.max(1, Math.min(80, Number(e.target.value))))}
            className="input-base tabular-nums"
            min={1}
            max={continuous ? 20 : 80}
            required
          />
          <p className="text-[10px] text-text-dim mt-1">{continuous ? "1-20 章，建议 10" : "1-80 章，建议 40"}</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2" htmlFor="auto-generation-floor">
            质量阈值 (%)
          </label>
          <input id="auto-generation-floor"
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
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2" htmlFor="auto-generation-rounds">
            自修轮数
          </label>
          <input id="auto-generation-rounds"
            type="number"
            value={rounds}
            onChange={(e) => setRounds(Math.max(0, Math.min(4, Number(e.target.value))))}
            className="input-base tabular-nums"
            min={0}
            max={4}
            required
          />
          <p className="text-[10px] text-text-dim mt-1">每章最多审校→修订轮次</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2" htmlFor="auto-generation-budget">
            累计预算 (元)
          </label>
          <input id="auto-generation-budget"
            type="number"
            disabled={unlimitedBudget}
            value={costCap}
            onChange={(e) => setCostCap(Number(e.target.value))}
            className="input-base tabular-nums"
            min={0.01}
            step={0.01}
            required={!unlimitedBudget}
          />
          <label className="flex items-center gap-2 mt-3 text-sm text-text-dim">
            <input type="checkbox" checked={unlimitedBudget} onChange={e => setUnlimitedBudget(e.target.checked)} />
            不设任务累计预算上限
          </label>
          <p className="text-[10px] text-text-dim mt-1">调用前检查预算，单次调用可能超出阈值</p>
        </div>
      </div>

      <div className="mb-8">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={dailyEnabled} onChange={e => setDailyEnabled(e.target.checked)} />
          启用每日预算与自动唤醒
        </label>
        {dailyEnabled && <label className="block mt-3 text-sm text-text-dim">本任务每日预算（元）
          <input aria-label="本任务每日预算" type="number" className="input-base w-28 ml-3" min="0.01" step="0.01" required
            value={dailyBudget} onChange={e => setDailyBudget(Number(e.target.value))} />
        </label>}
        <p className="mt-2 text-xs text-text-dim">每日预算按北京时间零点重置；累计预算、待审草稿和主动暂停仍需人工处理。单次调用可能超过阈值。</p>
      </div>

      <div className="mb-8">
        <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-2">
          人工检查点
        </label>
        <div className="flex gap-3">
          {CHECKPOINT_OPTIONS.filter(opt => !continuous || opt.value !== "none").map((opt) => (
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
          {loading ? "提交中…" : "确认启动"}
        </button>
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost">
          取消
        </button>
      </div>
    </form>
  );
}


function BudgetForm({ current, onSave, loading }: { current: number; onSave: (value: number) => Promise<void>; loading: boolean }) {
  const [value, setValue] = useState(Math.ceil(current + 5));
  return <form className="flex flex-wrap items-center gap-3 mb-6" onSubmit={e => { e.preventDefault(); void onSave(value); }}>
    <label className="text-xs text-text-dim">新的累计预算（元）
      <input aria-label="新的累计预算" type="number" className="input-base w-28 ml-3" min={current + 0.01} step="0.01"
        value={value} onChange={e => setValue(Number(e.target.value))} required />
    </label>
    <button className="btn-secondary" type="submit" disabled={loading}>更新预算</button>
    <span className="text-xs text-text-dim">保存后点击恢复生成</span>
  </form>;
}


function DailyBudgetForm({ current, onSave, loading }: { current?: number; onSave: (value: number | null) => Promise<void>; loading: boolean }) {
  const [enabled, setEnabled] = useState(current != null);
  const [value, setValue] = useState(current ?? 2);
  return <form className="flex flex-wrap items-center gap-3 mb-6" onSubmit={e => { e.preventDefault(); void onSave(enabled ? value : null); }}>
    <label className="text-xs text-text-dim flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />每日预算与自动唤醒</label>
    {enabled && <input aria-label="新的每日预算" type="number" className="input-base w-28" min="0.01" step="0.01" required value={value} onChange={e => setValue(Number(e.target.value))} />}
    <button className="btn-secondary" type="submit" disabled={loading}>更新每日预算</button>
    <span className="text-xs text-text-dim">保存后确认并恢复生成</span>
  </form>;
}
