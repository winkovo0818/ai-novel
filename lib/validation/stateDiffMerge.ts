import type { BibleDraft, StateDiff, StoryStateV1 } from "./schemas";

/**
 * Apply a StateDiff to a BibleDraft, producing a new BibleDraft with updated
 * story_state. This is a shallow merge: existing state is preserved and
 * updates are appended/overlaid.
 *
 * L-02: Also merges new_entities (characters / locations / items / rules)
 * into the Bible structure itself so they become part of the canonical world.
 */
export function applyStateDiff(
  bible: BibleDraft,
  diff: StateDiff,
  chapterIndex: number,
): BibleDraft {
  // L-02: Merge new_entities into Bible
  let nextBible: BibleDraft = { ...bible };

  for (const entity of diff.new_entities) {
    if (entity.type === "character") {
      const exists = nextBible.characters.some((c) => c.name === entity.name);
      if (!exists && nextBible.characters.length < 8) {
        nextBible = {
          ...nextBible,
          characters: [
            ...nextBible.characters,
            {
              role: "hidden",
              name: entity.name,
              age: "未知",
              appearance: entity.description.slice(0, 40),
              personality: "待补全",
              catchphrase: "……",
              abilities: ["待定"],
              goals: entity.description.slice(0, 40),
              motivation: entity.description,
              secrets: ["未揭示"],
              relations: [],
            },
          ],
        };
      }
    } else if (entity.type === "location") {
      if (!nextBible.world.geography.includes(entity.name) && nextBible.world.geography.length < 10) {
        nextBible = {
          ...nextBible,
          world: {
            ...nextBible.world,
            geography: [...nextBible.world.geography, entity.name],
          },
        };
      }
    } else if (entity.type === "rule") {
      const ruleText =
        entity.description.length > 40
          ? entity.description.slice(0, 37) + "..."
          : entity.description;
      if (!nextBible.world.rules.includes(ruleText) && nextBible.world.rules.length < 10) {
        nextBible = {
          ...nextBible,
          world: {
            ...nextBible.world,
            rules: [...nextBible.world.rules, ruleText],
          },
        };
      }
    } else if (entity.type === "item") {
      const itemText = `[物品] ${entity.name}`;
      if (!nextBible.world.geography.includes(itemText) && nextBible.world.geography.length < 10) {
        nextBible = {
          ...nextBible,
          world: {
            ...nextBible.world,
            geography: [...nextBible.world.geography, itemText],
          },
        };
      }
    }
  }

  const prev: StoryStateV1 = nextBible.story_state ?? {};

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
    ...nextBible,
    story_state: Object.keys(nextState).length > 0 ? nextState : undefined,
  };
}
