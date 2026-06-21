"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface QualityDimension {
  key: string;
  label: string;
  score: number;
  max: number;
  warnings: string[];
}

interface QualityResult {
  coldStart: boolean;
  chapterCount?: number;
  message?: string;
  window?: number[];
  overallScore?: number;
  maxScore?: number;
  scorePct?: number;
  level?: string;
  dimensions?: QualityDimension[];
}

interface UseChapterQualityOptions {
  novelId: string;
  chapterIndex: number;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useChapterQuality({ novelId, chapterIndex }: UseChapterQualityOptions) {
  const [result, setResult] = useState<QualityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetched = useRef<number | null>(null);

  const fetchQuality = useCallback(async () => {
    // Skip if already fetched for this chapter
    if (lastFetched.current === chapterIndex && result) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/quality?chapter=${chapterIndex}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "请求失败");
      setResult(json.data as QualityResult);
      lastFetched.current = chapterIndex;
    } catch (err) {
      setError(err instanceof Error ? err.message : "评估失败");
    } finally {
      setLoading(false);
    }
  }, [novelId, chapterIndex, result]);

  // Auto-fetch when chapterIndex changes
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [chapterIndex]);

  return { result, loading, error, fetchQuality };
}
