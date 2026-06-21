import { useState, useEffect, useRef } from "react";
import {
  loadNovelMeta,
  loadBible,
  loadOutline,
  loadProgress,
  loadQuality,
  loadUsage,
  loadNotes,
  loadChapter,
} from "./storage";
import type { PanelData } from "./types";

interface PollerOptions {
  dir: string;
  intervalMs?: number;
  currentChapterIndex: number;
}

export function usePoller({ dir, intervalMs = 2000, currentChapterIndex }: PollerOptions) {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = () => {
    try {
      const novel = loadNovelMeta(dir);
      const bible = loadBible(dir);
      const outline = loadOutline(dir);
      const progress = loadProgress(dir);
      const quality = loadQuality(dir);
      const usage = loadUsage(dir);
      const notes = loadNotes(dir);
      const chapter = loadChapter(dir, currentChapterIndex);

      if (novel && bible && progress) {
        setData({
          novel,
          bible,
          outline,
          progress,
          quality,
          usage,
          notes,
          currentChapterContent: chapter?.content ?? "",
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Poll failed");
    }
  };

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [dir, currentChapterIndex]);

  return { data, error };
}
