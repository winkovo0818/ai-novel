import type { BibleDraft, StateDiff, StoryStateV1 } from "./schemas";

/**
 * Apply a StateDiff to a BibleDraft, producing a new BibleDraft with updated
 * story_state. This is a shallow merge: existing state is preserved and
 * updates are appended/overlaid.
 */
export function applyStateDiff(
  bible: BibleDraft,
  diff: StateDiff,
  chapterIndex: number,
): BibleDraft {
  const prev: StoryStateV1 = bible.story_state ?? {};

  // Merge character updates
  const characters = prev.characters ? [...prev.characters] : [];
  for (const update of diff.character_updates) {
    const idx = characters.findIndex((c) => c.name === update.name);
    if (idx >= 0) {
      characters[idx] = { ...characters[idx], ...update.changes };
    } else {
      characters.push({ name: update.name, ...update.changes });
    }
  }

  // Append timeline events
  const timeline = prev.timeline ? [...prev.timeline] : [];
  for (const event of diff.timeline_events) {
    timeline.push({ chapter_index: chapterIndex, ...event });
  }

  // Merge plot thread updates
  const plotThreads = prev.plot_threads ? [...prev.plot_threads] : [];
  for (const update of diff.plot_thread_updates) {
    const idx = plotThreads.findIndex((p) => p.title === update.title);
    if (idx >= 0) {
      plotThreads[idx] = { ...plotThreads[idx], ...update };
    } else {
      plotThreads.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: update.title,
        status: update.status,
        notes: update.notes,
        introduced_in: chapterIndex,
      });
    }
  }

  const nextState: StoryStateV1 = {
    ...(characters.length > 0 ? { characters } : {}),
    ...(timeline.length > 0 ? { timeline } : {}),
    ...(plotThreads.length > 0 ? { plot_threads: plotThreads } : {}),
  };

  return {
    ...bible,
    story_state: Object.keys(nextState).length > 0 ? nextState : undefined,
  };
}
