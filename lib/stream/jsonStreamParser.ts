import { BibleDraftSchema, type BibleDraft } from "@/lib/validation/schemas";

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

export function collectBibleEvents(
  draft: BibleDraft,
  cursor: BibleEventCursor,
): BibleStreamEvent[] {
  const events: BibleStreamEvent[] = [];

  if (!cursor.meta) {
    events.push({ event: "meta", data: draft.meta });
    cursor.meta = true;
  }

  for (let i = cursor.characters; i < draft.characters.length; i++) {
    events.push({
      event: "character",
      data: { ...draft.characters[i]!, index: i },
    });
  }
  cursor.characters = draft.characters.length;

  if (!cursor.world) {
    events.push({ event: "world", data: draft.world });
    cursor.world = true;
  }

  const chapters = draft.outline.volume_1.chapters;
  for (let i = cursor.outlineChapters; i < chapters.length; i++) {
    events.push({
      event: "outline_chapter",
      data: { ...chapters[i]!, index: i },
    });
  }
  cursor.outlineChapters = chapters.length;

  for (let i = cursor.firstChapterBeats; i < draft.first_chapter_beats.length; i++) {
    events.push({
      event: "first_chapter_beat",
      data: { ...draft.first_chapter_beats[i]!, index: i },
    });
  }
  cursor.firstChapterBeats = draft.first_chapter_beats.length;

  return events;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return value;

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}
