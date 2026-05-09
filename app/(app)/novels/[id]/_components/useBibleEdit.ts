"use client";

import { useCallback, useState } from "react";
import type { BibleDraft } from "@/lib/validation/schemas";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Shared edit controller for /novels/[id]/{characters,world,outline}.
 *
 * Holds the full bible draft so partial section edits can persist back via
 * the existing full-content PATCH endpoint without losing untouched fields.
 * The 3 sibling pages each render a slice and call setBible({ ...bible, ... }).
 */
export function useBibleEdit(novelId: string, initial: BibleDraft) {
  const [bible, setBibleState] = useState<BibleDraft>(initial);
  const [savedBible, setSavedBible] = useState<BibleDraft>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string>();
  const dirty = JSON.stringify(bible) !== JSON.stringify(savedBible);

  const setBible = useCallback((next: BibleDraft) => {
    setBibleState(next);
    if (status === "saved") setStatus("idle");
  }, [status]);

  const save = useCallback(async () => {
    setStatus("saving");
    setError(undefined);
    try {
      const response = await fetch(`/api/novels/${novelId}/bible`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: bible }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "保存失败");
      setSavedBible(bible);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }, [bible, novelId]);

  return { bible, setBible, dirty, status, error, save };
}
