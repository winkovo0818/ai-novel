/**
 * 全链路 zod schema — 前端 store / API 入参出参 / Bible 输出全部用同一份。
 *
 * 字段定义来源：docs/contracts.md §3 §4 §5。
 * 任何偏离都要先改 contracts 再改这里（变更流程 §10）。
 */

import { z } from "zod";

// ──────────────────────────────────────────────────
// NovelProfile（contracts §4）
// ──────────────────────────────────────────────────

export const GenreMainEnum = z.enum([
  "web",
  "literary",
  "script",
  "fanfic",
  "shortstory",
]);
export type GenreMain = z.infer<typeof GenreMainEnum>;

export const NovelProfileSchema = z.object({
  genre_main: GenreMainEnum,
  genre_sub: z.string().min(1).max(12),
  audience: z.enum(["male", "female", "general"]).default("general"),
  length: z
    .enum(["short", "mid", "long", "super_long"])
    .default("long"),
  tone: z
    .enum(["cool", "serious", "healing", "dark", "comedy"])
    .default("cool"),
  pace: z.enum(["fast", "mid", "slow"]).default("fast"),
  pov: z
    .enum(["first", "third_limited", "omniscient"])
    .default("third_limited"),
  chapter_word_count: z
    .union([z.literal(2000), z.literal(3000), z.literal(5000)])
    .default(3000),
  ai_freedom: z
    .enum(["conservative", "mid", "wild"])
    .default("mid"),
});
export type NovelProfile = z.infer<typeof NovelProfileSchema>;

/** 用户在 Step 1 只给 genre_main + genre_sub，其余字段全部填默认值。 */
export function buildDefaultProfile(
  genre_main: GenreMain,
  genre_sub: string,
): NovelProfile {
  return NovelProfileSchema.parse({ genre_main, genre_sub });
}

// ──────────────────────────────────────────────────
// Question（contracts §5）
// ──────────────────────────────────────────────────

export const QuestionSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "key must be snake_case (lowercase + _)"),
  question: z.string().min(1),
  type: z.enum(["single", "multi"]),
  options: z.array(z.string().min(1)).length(4),
  recommended_index: z.number().int().min(0).max(3),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionsResponseSchema = z.object({
  questions: z.array(QuestionSchema).min(3).max(5),
});

// ──────────────────────────────────────────────────
// Logline（contracts §2 / Prompt 5.1）
// ──────────────────────────────────────────────────

export const LoglinesResponseSchema = z.object({
  loglines: z.array(z.string().min(1).max(60)).length(5),
});

// ──────────────────────────────────────────────────
// BibleDraft（contracts §3）
// ──────────────────────────────────────────────────

export const CharacterRoleEnum = z.enum([
  "protagonist",
  "mentor",
  "antagonist",
  "sidekick",
  "hidden",
]);
export type CharacterRole = z.infer<typeof CharacterRoleEnum>;

export const CharacterSchema = z.object({
  role: CharacterRoleEnum,
  name: z.string().min(1),
  age: z.union([z.number().int(), z.string()]),
  appearance: z.string().min(1).max(40),
  personality: z.string().min(1),
  catchphrase: z.string().min(1),
  abilities: z.array(z.string().min(1)).min(1).max(3),
  goals: z.string().min(1),
  motivation: z.string().min(1),
  secrets: z.array(z.string().min(1)).min(1).max(2),
  relations: z.array(z.string()),
});
export type Character = z.infer<typeof CharacterSchema>;

export const FactionSchema = z.object({
  name: z.string().min(1),
  alignment: z.string().min(1),
  role: z.string().min(1),
});

export const ChapterSchema = z.object({
  index: z.number().int().min(1).max(1000),
  title: z.string().min(1),
  summary: z.string().min(20).max(120),
});

export const BeatSchema = z.object({
  beat: z.number().int().min(1),
  scene: z.string().min(1),
  purpose: z.string().min(1),
});

export const BibleMetaSchema = z.object({
    suggested_title: z.string().min(2).max(8),
    alternative_titles: z.array(z.string().min(2).max(8)).length(3),
});

export const BibleWorldSchema = z.object({
  setting_summary: z.string().min(40).max(180),
  factions: z.array(FactionSchema).min(2).max(4),
  rules: z.array(z.string().min(1).max(40)).min(2).max(4),
  geography: z.array(z.string().min(1)).min(2).max(4),
});

export const VolumeSchema = z.object({
  name: z.string().min(2).max(20),
  theme: z.string().min(1),
  chapter_count_estimate: z.number().int().min(1),
  chapters: z.array(ChapterSchema).min(0).max(200),
});
export type Volume = z.infer<typeof VolumeSchema>;

/**
 * Onboarding still produces `volume_1` as the seed volume. Additional volumes
 * may be appended into the optional `volumes` array (Bible editor or future
 * milestones). Consumers should iterate via `getVolumes()` / `getAllChapters()`
 * rather than reading `volume_1` directly.
 */
export const BibleDraftSchema = z.object({
  meta: BibleMetaSchema,
  characters: z
    .array(CharacterSchema)
    .min(3)
    .max(5)
    .refine(
      (chars) => chars.filter((c) => c.role === "protagonist").length === 1,
      { message: "characters must contain exactly 1 protagonist" },
    ),
  world: BibleWorldSchema,
  outline: z.object({
    volume_1: VolumeSchema.extend({
      name: z.string().min(2).max(8),
      chapter_count_estimate: z.number().int().min(8),
      chapters: z.array(ChapterSchema).min(8).max(50),
    }),
    volumes: z.array(VolumeSchema).max(20).optional(),
  }),
  first_chapter_beats: z.array(BeatSchema).min(5).max(8),
});
export type BibleDraft = z.infer<typeof BibleDraftSchema>;

/** Iterate all volumes: legacy volume_1 first, then any extra volumes. */
export function getVolumes(bible: BibleDraft): Volume[] {
  const extra = bible.outline.volumes ?? [];
  return [bible.outline.volume_1, ...extra];
}

/** Flat list of all planned chapters across every volume. */
export function getAllChapters(bible: BibleDraft) {
  return getVolumes(bible).flatMap((v) => v.chapters);
}

// ──────────────────────────────────────────────────
// API 入参（contracts §2.2）
// ──────────────────────────────────────────────────

export const CreateSessionRequestSchema = z.object({
  title: z.string().max(64).optional(),
  genre_main: GenreMainEnum,
  genre_sub: z.string().min(1).max(12),
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

export const CreateChapterDraftRequestSchema = z.object({
  chapter_index: z.number().int().min(1),
  title: z.string().min(1).max(120),
  content: z.string().max(80_000).default(""),
  status: z.enum(["draft", "done"]).default("draft"),
});

export const UpdateChapterDraftRequestSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().max(80_000).optional(),
  status: z.enum(["draft", "done"]).optional(),
  source: z.enum(["manual", "ai", "autosave", "status_change"]).optional(),
});

export const GenerateChapterDraftRequestSchema = z.object({
  chapter_index: z.number().int().min(1).default(1),
  title: z.string().min(1).max(120),
  existing_content: z.string().max(80_000).optional(),
});
