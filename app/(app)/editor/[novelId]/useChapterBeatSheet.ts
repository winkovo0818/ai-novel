"use client";

import { useEffect, useState } from "react";

import { buildBeatSheetRequest } from "@/lib/editor/chapterUtils";
import type { BeatItem } from "./BeatSheetPanel";

interface UseChapterBeatSheetOptions {
  novelId: string;
  selectedIndex: number;
  chapterTitle: string;
  draftChapter(beats?: BeatItem[]): Promise<void>;
}

export function useChapterBeatSheet({
  novelId,
  selectedIndex,
  chapterTitle,
  draftChapter,
}: UseChapterBeatSheetOptions) {
  const [beats, setBeatsState] = useState<BeatItem[]>([]);
  const [beatsLoading, setBeatsLoading] = useState(false);
  const [beatsError, setBeatsError] = useState<string>();

  useEffect(() => {
    setBeatsState([]);
    setBeatsError(undefined);
  }, [selectedIndex]);

  async function generateBeatSheet(chapterGoal?: string) {
    if (selectedIndex < 2) {
      setBeatsError("第 1 章节拍由 Bible 提供，无需另行生成");
      return;
    }
    setBeatsLoading(true);
    setBeatsError(undefined);
    try {
      const request = buildBeatSheetRequest({
        novelId,
        selectedIndex,
        chapterTitle,
        chapterGoal,
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.payload),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "节拍生成失败");
      setBeatsState(json.data.beats as BeatItem[]);
    } catch (err) {
      setBeatsError(err instanceof Error ? err.message : "节拍生成失败");
    } finally {
      setBeatsLoading(false);
    }
  }

  function setBeats(next: BeatItem[]) {
    setBeatsState(next);
  }

  function clearBeats() {
    setBeatsState([]);
    setBeatsError(undefined);
  }

  async function draftWithBeats() {
    await draftChapter(beats);
  }

  return {
    beats,
    beatsLoading,
    beatsError,
    generateBeatSheet,
    setBeats,
    clearBeats,
    draftWithBeats,
  };
}
