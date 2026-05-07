import { parse, Allow } from "partial-json";

import {
  BeatSchema,
  BibleDraftSchema,
  BibleMetaSchema,
  BibleWorldSchema,
  ChapterSchema,
  CharacterSchema,
  type BibleDraft,
} from "@/lib/validation/schemas";

export type BibleStreamEvent =
  | { event: "meta"; data: BibleDraft["meta"] }
  | { event: "character"; data: BibleDraft["characters"][number] & { index: number } }
  | { event: "world"; data: BibleDraft["world"] }
  | {
      event: "outline_chapter";
      data: BibleDraft["outline"]["volume_1"]["chapters"][number] & { index: number };
    }
  | {
      event: "first_chapter_beat";
      data: BibleDraft["first_chapter_beats"][number] & { index: number };
    };

export interface BibleEventCursor {
  meta: boolean;
  world: boolean;
  characters: number;
  outlineChapters: number;
  firstChapterBeats: number;
}

export function createBibleEventCursor(): BibleEventCursor {
  return {
    meta: false,
    world: false,
    characters: 0,
    outlineChapters: 0,
    firstChapterBeats: 0,
  };
}

export function tryParseBibleDraft(buffer: string): BibleDraft | null {
  const trimmed = stripJsonFence(buffer).trim();
  if (!trimmed.endsWith("}")) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const result = BibleDraftSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function tryParsePartialBibleDraft(buffer: string): Partial<BibleDraft> | null {
  const trimmed = stripJsonFence(buffer).trim();
  if (!trimmed) return null;

  try {
    const parsed = parse(trimmed, Allow.STR | Allow.ARR | Allow.OBJ) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Partial<BibleDraft>)
      : null;
  } catch {
    return null;
  }
}

export function collectBibleEvents(
  draft: Partial<BibleDraft>,
  cursor: BibleEventCursor,
): BibleStreamEvent[] {
  const events: BibleStreamEvent[] = [];

  const meta = BibleMetaSchema.safeParse(draft.meta);
  if (!cursor.meta && meta.success) {
    events.push({ event: "meta", data: meta.data });
    cursor.meta = true;
  }

  const characters = Array.isArray(draft.characters) ? draft.characters : [];
  for (let i = cursor.characters; i < characters.length; i++) {
    const character = CharacterSchema.safeParse(characters[i]);
    if (!character.success) break;
    events.push({
      event: "character",
      data: { ...character.data, index: i },
    });
    cursor.characters = i + 1;
  }

  const world = BibleWorldSchema.safeParse(draft.world);
  if (!cursor.world && world.success) {
    events.push({ event: "world", data: world.data });
    cursor.world = true;
  }

  const chapters = Array.isArray(draft.outline?.volume_1?.chapters)
    ? draft.outline.volume_1.chapters
    : [];
  for (let i = cursor.outlineChapters; i < chapters.length; i++) {
    const chapter = ChapterSchema.safeParse(chapters[i]);
    if (!chapter.success) break;
    events.push({
      event: "outline_chapter",
      data: chapter.data,
    });
    cursor.outlineChapters = i + 1;
  }

  const beats = Array.isArray(draft.first_chapter_beats)
    ? draft.first_chapter_beats
    : [];
  for (let i = cursor.firstChapterBeats; i < beats.length; i++) {
    const beat = BeatSchema.safeParse(beats[i]);
    if (!beat.success) break;
    events.push({
      event: "first_chapter_beat",
      data: { ...beat.data, index: i },
    });
    cursor.firstChapterBeats = i + 1;
  }

  return events;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return value;

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}
