"use client";

import { useEffect, useState } from "react";

interface Stats {
  total_words: number;
  total_chapters: number;
  done_chapters: number;
  daily_avg: number;
  streak_days: number;
}

export function NovelStats({ novelId }: { novelId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/novels/" + novelId + "/stats")
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) setStats(json.data);
      })
      .catch(() => {});
  }, [novelId]);

  if (!stats) return null;

  return (
    <section className="mt-12">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">
        Writing Stats
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox label="Total" value={stats.total_words.toLocaleString()} unit="chars" />
        <StatBox label="Daily avg" value={stats.daily_avg.toLocaleString()} unit="chars/day" />
        <StatBox label="Streak" value={String(stats.streak_days)} unit="days" />
        <StatBox label="Progress" value={stats.done_chapters + " / " + stats.total_chapters} unit="chapters" />
      </div>
    </section>
  );
}

function StatBox({ label, value, unit }: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="card bg-white p-5 flex flex-col gap-1 shadow-sm hover:shadow-md transition">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-dim">
        {label}
      </span>
      <span className="text-2xl font-bold text-text-primary font-mono tabular-nums">
        {value}
      </span>
      <span className="text-[11px] text-text-muted">{unit}</span>
    </div>
  );
}
