"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
interface Alert { id: string; message: string; novel_id: string; novel_title: string }

export default function GenerationAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      try {
        const response = await fetch("/api/generation-alerts", { signal: controller.signal });
        const body = await response.json();
        if (!body.ok) throw new Error(body.error?.message ?? "连载提醒读取失败");
        if (!controller.signal.aborted) { setAlerts(body.data); setError(null); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "连载提醒读取失败"); }
    };
    void read();
    const timer = setInterval(read, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  const acknowledge = async (id: string) => {
    try {
      const response = await fetch("/api/generation-alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error?.message ?? "确认失败");
      setAlerts(current => current.filter(a => a.id !== id)); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "确认失败"); }
  };
  if (!alerts.length && !error) return null;
  return <section aria-label="连载提醒" className="mt-8 card border-amber-200 bg-amber-50/80">
    <h2 className="font-bold mb-3">连载提醒</h2>
    {error && <p role="status" className="text-sm text-amber-800 mb-3">{error}</p>}
    <ul className="space-y-4">{alerts.map(a => <li key={a.id} className="flex flex-wrap items-center gap-3 text-sm">
      <div className="flex-1 min-w-48"><Link href={`/novels/${a.novel_id}`} className="font-bold underline">{a.novel_title}</Link><p className="mt-1 text-text-dim">{a.message}</p></div>
      <button type="button" className="btn-secondary" onClick={() => void acknowledge(a.id)}>已知晓</button>
    </li>)}</ul>
  </section>;
}
