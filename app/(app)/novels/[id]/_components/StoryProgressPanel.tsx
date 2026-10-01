"use client";
import { useEffect, useState } from "react";
import type { VolumeArc } from "@/lib/agent/volumePlan";
import type { StoryStateV1 } from "@/lib/validation/schemas";
interface View { state: StoryStateV1; stale_records: number; volume_arc: VolumeArc | null }
export default function StoryProgressPanel({ novelId, refreshKey }: { novelId: string; refreshKey: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/novels/${novelId}/story-memory`, { signal: controller.signal }).then(async response => {
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "剧情进度读取失败");
      setView(json.data); setError(null);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "剧情进度读取失败"); });
    return () => controller.abort();
  }, [novelId, refreshKey]);
  if (!view && !error) return null;
  const arc = view?.volume_arc;
  return <section className="mt-8 card bg-white/80" aria-label="连载剧情进度">
    <h3 className="text-lg font-serif font-bold mb-4">连载剧情进度</h3>
    {error && <p className="text-sm text-amber-700">{error}</p>}
    {!!view?.stale_records && <p className="text-sm text-amber-700 mb-4">历史正文已修改，相关剧情状态需要重新校准。</p>}
    {arc ? <div className="space-y-3 text-sm">
      <p className="font-bold">{arc.plan.name} · 第 {arc.start_chapter}–{arc.end_chapter} 章</p>
      <p><span className="text-text-dim">阶段目标：</span>{arc.plan.goal}</p>
      <p><span className="text-text-dim">核心冲突：</span>{arc.plan.central_conflict}</p>
      <p><span className="text-text-dim">阶段结果：</span>{arc.plan.resolution}</p>
      {arc.plan.thread_targets.length > 0 && <ul className="list-disc pl-5">{arc.plan.thread_targets.map(t => <li key={`${t.kind}:${t.title}`}>{t.title}：第 {t.deadline_chapter} 章前{t.action === "resolve" ? "回收" : "推进"}</li>)}</ul>}
    </div> : <p className="text-sm text-text-dim">启动自动连载后，会根据当前剧情规划本卷目标。</p>}
    {!!view?.state.plot_threads?.length && <p className="mt-4 text-sm text-text-dim">当前线索：{view.state.plot_threads.filter(t => t.status !== "resolved").map(t => t.title).join("、") || "暂无未解决线索"}</p>}
  </section>;
}
