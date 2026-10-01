import type { BibleDraft, ChapterSchema } from "@/lib/validation/schemas";
import type { z } from "zod";
/* ------------------------------------------------------------------ */
/*  Shared CLI types                                                   */
/* ------------------------------------------------------------------ */

export interface CliConfig {
  llm: {
    provider: string;
    model: string;
    base_url: string;
    api_key: string;
    max_tokens: number;
    temperature: number;
    extra?: Record<string, {
      provider: string;
      model: string;
      base_url: string;
      api_key: string;
    }>;
  };
  generation: {
    default_chapters: number;
    quality_floor: number;
    revision_rounds: number;
    cost_cap_cny: number;
    target_words_per_chapter: number;
    /** 单章 state-diff 条数上限，与 GenerationPolicySchema.max_state_changes 对齐（5–40，默认 15）。 */
    max_state_changes: number;
  };
  output: {
    export_dir: string;
    auto_export: boolean;
  };
}

export interface NovelMeta {
  title: string;
  theme: string;
  logline: string;
  created_at: string;
}

export type BibleData = BibleDraft;
export type OutlineChapter = z.infer<typeof ChapterSchema>;

export type RunStatus =
  | "planning"
  | "running"
  | "paused"
  | "needs_review"
  | "completed"
  | "cancelled";

export interface ProgressData {
  total: number;
  current: number;
  status: RunStatus;
  cost: number;
  cost_cap: number;
  model: string;
  started_at: string;
  last_chapter_at: string;
}

export interface QualityRecord {
  chapter: number;
  score: number;
  dimensions: Record<string, number>;
}

export interface UsageRecord {
  chapter: number;
  title: string;
  draft_cost: number;
  critic_cost: number;
  revise_cost: number;
  state_diff_cost: number;
  total_cost: number;
}

export interface NotesData {
  ending?: string;
  plots?: Array<{ text: string; created_at: string }>;
  notes?: Array<{ text: string; created_at: string }>;
}

export interface PanelData {
  novel: NovelMeta;
  bible: BibleData;
  outline: OutlineChapter[];
  progress: ProgressData;
  quality: QualityRecord[];
  usage: UsageRecord[];
  notes: NotesData;
  currentChapterContent: string;
}
