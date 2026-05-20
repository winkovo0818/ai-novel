/**
 * API request / response schemas.
 * Domain models are in domain.ts; re-exported through schemas.ts.
 */

import { z } from "zod";
import { BibleDraftSchema, GenreMainEnum, NovelProfileSchema } from "./domain";

export const CreateSessionRequestSchema = z.object({
  title: z.string().max(64).optional(),
  genre_main: GenreMainEnum,
  genre_sub: z.string().min(1).max(40),
  description: z.string().max(500).optional(),
});

export const CreateSessionResponseSchema = z.object({
  session_id: z.string().uuid(),
  default_profile: NovelProfileSchema,
});

export const LoglineRequestSchema = z.object({
  regenerate: z.boolean().optional(),
});

export const QuestionsRequestSchema = z.object({
  logline: z.string().min(1).max(200),
});

export const BibleStreamRequestSchema = z.object({
  logline: z.string().min(1).max(200),
  answers: z.record(z.union([z.string(), z.array(z.string())])),
  profile: NovelProfileSchema,
});

export const FinalizeRequestSchema = z.object({
  bible_draft: z.unknown().optional(),
  profile: NovelProfileSchema,
  action: z.enum(["start_writing", "save_only"]),
});

export const FinalizeResponseSchema = z.object({
  novel_id: z.string().uuid(),
  editor_url: z.string(),
  action: z.enum(["start_writing", "save_only"]),
});

/**
 * Hard cap on per-chapter `content` length. Matches `ChapterDraft.content`
 * column constraint in Prisma and is enforced on every Create/Update path
 * touching chapter body. Exported so the editor can render a UI warning
 * before the user hits the wall (P1-11).
 */
export const CHAPTER_CONTENT_MAX_CHARS = 80_000;

export const CreateChapterDraftRequestSchema = z.object({
  chapter_index: z.number().int().min(1),
  title: z.string().min(1).max(120),
  content: z.string().max(CHAPTER_CONTENT_MAX_CHARS).default(""),
  status: z.enum(["draft", "done"]).default("draft"),
});

export const UpdateChapterDraftRequestSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().max(CHAPTER_CONTENT_MAX_CHARS).optional(),
  status: z.enum(["draft", "done"]).optional(),
  source: z.enum(["manual", "ai", "autosave", "status_change"]).optional(),
  /** Per-chapter word target. Null clears it; undefined leaves it unchanged. */
  target_words: z.number().int().min(100).max(50_000).nullable().optional(),
  /**
   * Optimistic-lock guard. **Required** — every PATCH must carry the version
   * the client last saw. Omitting it used to silently bypass conflict
   * detection (P0-3 closed that hole); callers must hydrate `version` from
   * the GET / previous PATCH response and round-trip it here.
   */
  expected_version: z.number().int().min(0),
});

export const GenerateChapterDraftRequestSchema = z.object({
  chapter_index: z.number().int().min(1).default(1),
  title: z.string().min(1).max(120),
  existing_content: z.string().max(CHAPTER_CONTENT_MAX_CHARS).optional(),
  beat_sheet: z.object({
    beats: z.array(z.object({
      index: z.number().int().min(1),
      description: z.string().min(10).max(300),
    })).min(3).max(8),
  }).optional(),
  /** Pre-retrieved memories from the preview endpoint. When provided,
   *  the draft route skips its own retrieval and uses these directly. */
  retrieved_memories: z.array(z.object({
    source: z.string(),
    text: z.string(),
    reason: z.string(),
    score: z.number(),
  })).optional(),
});

export const BibleUpdateRequestSchema = z.object({
  content: BibleDraftSchema,
});
export type BibleUpdateRequest = z.infer<typeof BibleUpdateRequestSchema>;

export const BeatSheetItemSchema = z.object({
  index: z.number().int().min(1),
  description: z.string().min(10).max(300),
});

export const BeatSheetResponseSchema = z.object({
  beats: z.array(BeatSheetItemSchema).min(3).max(8),
});

export const GenerateBeatSheetRequestSchema = z.object({
  chapter_index: z.number().int().min(2),
  chapter_title: z.string().min(1).max(120),
  chapter_goal: z.string().max(200).optional(),
});
