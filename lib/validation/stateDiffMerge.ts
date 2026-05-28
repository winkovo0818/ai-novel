import type { BibleDraft, StateDiff, StoryStateV1 } from "./schemas";

export const STATE_DIFF_SECTIONS = [
  "character_updates",
  "timeline_events",
  "plot_thread_updates",
  "new_entities",
] as const;

export type StateDiffSection = (typeof STATE_DIFF_SECTIONS)[number];
export type StateDiffSelection = Record<StateDiffSection, number[]>;

export type StateDiffConflictType =
  | "character_location"
  | "foreshadowing_resolved"
  | "relationship_conflict";

export interface StateDiffConflictWarning {
  type: StateDiffConflictType;
  message: string;
  section?: StateDiffSection;
  index?: number;
}

export function createStateDiffSelection(diff: StateDiff, selected = true): StateDiffSelection {
  return {
    character_updates: selected ? diff.character_updates.map((_, index) => index) : [],
    timeline_events: selected ? diff.timeline_events.map((_, index) => index) : [],
    plot_thread_updates: selected ? diff.plot_thread_updates.map((_, index) => index) : [],
    new_entities: selected ? diff.new_entities.map((_, index) => index) : [],
  };
}

export function countSelectedStateDiffItems(selection: StateDiffSelection): number {
  return STATE_DIFF_SECTIONS.reduce((total, section) => total + selection[section].length, 0);
}

export function filterStateDiff(diff: StateDiff, selection: StateDiffSelection): StateDiff {
  return {
    character_updates: pickSelectedItems(diff.character_updates, selection.character_updates),
    timeline_events: pickSelectedItems(diff.timeline_events, selection.timeline_events),
    plot_thread_updates: pickSelectedItems(diff.plot_thread_updates, selection.plot_thread_updates),
    new_entities: pickSelectedItems(diff.new_entities, selection.new_entities),
  };
}

function pickSelectedItems<T>(items: T[], selectedIndexes: readonly number[]): T[] {
  const selected = new Set(selectedIndexes);
  return items.filter((_, index) => selected.has(index));
}

export function detectStateDiffConflicts(
  bible: BibleDraft,
  diff: StateDiff,
): StateDiffConflictWarning[] {
  const warnings: StateDiffConflictWarning[] = [];
  const state = bible.story_state;

  detectCharacterLocationConflicts(state, diff, warnings);
  detectResolvedForeshadowingConflicts(state, diff, warnings);
  detectRelationshipConflicts(state, warnings);

  return warnings;
}

function detectCharacterLocationConflicts(
  state: StoryStateV1 | undefined,
  diff: StateDiff,
  warnings: StateDiffConflictWarning[],
) {
  const currentLocations = new Map<string, string>();
  for (const character of state?.characters ?? []) {
    if (!character.current_location) continue;
    const previousLocation = currentLocations.get(character.name);
    if (previousLocation && previousLocation !== character.current_location) {
      warnings.push({
        type: "character_location",
        message: `${character.name} 在 Story State 中同时记录为「${previousLocation}」和「${character.current_location}」，请先确认当前位置。`,
      });
    }
    currentLocations.set(character.name, character.current_location);
  }

  const pendingLocations = new Map<string, string>();
  for (const [index, update] of diff.character_updates.entries()) {
    const nextLocation = update.changes.current_location;
    if (typeof nextLocation !== "string" || !nextLocation) continue;

    const pending = pendingLocations.get(update.name);
    if (pending && pending !== nextLocation) {
      warnings.push({
        type: "character_location",
        section: "character_updates",
        index,
        message: `${update.name} 在同一次状态更新中同时出现「${pending}」和「${nextLocation}」两个位置。`,
      });
    }

    pendingLocations.set(update.name, nextLocation);
  }
}

function detectResolvedForeshadowingConflicts(
  state: StoryStateV1 | undefined,
  diff: StateDiff,
  warnings: StateDiffConflictWarning[],
) {
  const resolved = new Set(
    [
      ...(state?.foreshadowing
      ?.filter((item) => item.status === "resolved" || item.status === "revealed")
      .map((item) => normalizeName(item.clue)) ?? []),
      ...(state?.plot_threads
        ?.filter((thread) => thread.status === "resolved")
        .map((thread) => normalizeName(thread.title)) ?? []),
    ],
  );

  for (const [index, update] of diff.plot_thread_updates.entries()) {
    if (update.status !== "resolved" || !resolved.has(normalizeName(update.title))) continue;
    warnings.push({
      type: "foreshadowing_resolved",
      section: "plot_thread_updates",
      index,
      message: `「${update.title}」在 Story State 中已经回收，本次又标记为 resolved，请确认是否重复解决。`,
    });
  }
}

function detectRelationshipConflicts(
  state: StoryStateV1 | undefined,
  warnings: StateDiffConflictWarning[],
) {
  const relationships = state?.relationships ?? [];
  const seen = new Map<string, { status: string; from: string; to: string }>();

  for (const relationship of relationships) {
    const key = [relationship.from, relationship.to].sort().join("\u0000");
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, relationship);
      continue;
    }

    if (!areRelationshipStatusesCompatible(previous.status, relationship.status)) {
      warnings.push({
        type: "relationship_conflict",
        message: `${relationship.from} 与 ${relationship.to} 的关系状态同时存在「${previous.status}」和「${relationship.status}」，请先确认关系记录。`,
      });
    }
  }
}

function areRelationshipStatusesCompatible(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left === right) return true;
  return !(
    (isPositiveRelationship(left) && isNegativeRelationship(right)) ||
    (isNegativeRelationship(left) && isPositiveRelationship(right))
  );
}

function isPositiveRelationship(status: string): boolean {
  return /信任|盟友|伙伴|同伴|朋友|师徒|亲密|合作|保护|爱|忠诚/.test(status);
}

function isNegativeRelationship(status: string): boolean {
  return /敌|仇|背叛|敌对|互斥|冲突|怀疑|疏离|决裂|追杀/.test(status);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

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
    const changes = normalizeCharacterChanges(update.changes);
    if (idx >= 0) {
      characters[idx] = { ...characters[idx], ...changes };
    } else {
      characters.push({ name: update.name, ...changes });
    }
  }

  // Append timeline events
  const timeline = prev.timeline ? [...prev.timeline] : [];
  for (const event of diff.timeline_events) {
    timeline.push({ chapter_index: chapterIndex, ...event });
  }

  const locations = prev.locations ? [...prev.locations] : [];
  const items = prev.items ? [...prev.items] : [];
  const foreshadowing = prev.foreshadowing ? [...prev.foreshadowing] : [];

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

  for (const entity of diff.new_entities) {
    if (entity.type === "location" && !locations.some((location) => location.name === entity.name)) {
      locations.push({
        name: entity.name,
        current_state: entity.description,
        last_seen_chapter: chapterIndex,
      });
    }
    if (entity.type === "item" && !items.some((item) => item.name === entity.name)) {
      items.push({
        name: entity.name,
        status: entity.description,
        notes: `首次出现于第 ${chapterIndex} 章`,
      });
    }
    if (/伏笔|线索|谜团|悬念/.test(entity.description) && !foreshadowing.some((item) => item.clue === entity.name)) {
      foreshadowing.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clue: entity.name,
        status: "planted",
        introduced_in: chapterIndex,
        notes: entity.description,
      });
    }
  }

  const nextState: StoryStateV1 = {
    ...(characters.length > 0 ? { characters } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(timeline.length > 0 ? { timeline } : {}),
    ...(prev.relationships && prev.relationships.length > 0 ? { relationships: prev.relationships } : {}),
    ...(plotThreads.length > 0 ? { plot_threads: plotThreads } : {}),
    ...(foreshadowing.length > 0 ? { foreshadowing } : {}),
  };

  return {
    ...nextBible,
    story_state: Object.keys(nextState).length > 0 ? nextState : undefined,
  };
}

function normalizeCharacterChanges(changes: Record<string, string | string[]>): Partial<NonNullable<StoryStateV1["characters"]>[number]> {
  const normalized: Partial<NonNullable<StoryStateV1["characters"]>[number]> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key === "known_secrets" || key === "relationship_notes") {
      normalized[key] = splitStateListValue(value);
      continue;
    }
    if (
      key === "current_location" ||
      key === "current_goal" ||
      key === "current_status" ||
      key === "emotional_state"
    ) {
      normalized[key] = Array.isArray(value) ? value.join("、") : value;
    }
  }
  return normalized;
}

function splitStateListValue(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  if (!value.trim()) return [];
  return value
    .split(/[、，,；;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
