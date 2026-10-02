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
 * 剥离角色名里的括号注释（如「几（剑魂）」→「几」、「剑魂(几)」→「剑魂」）。
 * state-diff agent 有时给带注释的名字，导致和 Bible 纯名不匹配被判幻觉。
 * 返回所有可能的归一化候选（括号外 + 括号内），任一命中已知实体即算存在。
 */
function nameCandidates(value: string): string[] {
  const trimmed = value.trim();
  const candidates = [normalizeName(trimmed)];
  // 剥离中文/英文括号注释：「几（剑魂）」「剑魂(几)」
  const bracketMatch = trimmed.match(/^([^（(]+)[（(]([^）)]+)[）)]/);
  if (bracketMatch) {
    candidates.push(normalizeName(bracketMatch[1])); // 括号外
    candidates.push(normalizeName(bracketMatch[2])); // 括号内
  }
  return [...new Set(candidates)];
}

/** 剥离空白与中英文标点后比较事实文本，防近似重述重复入库（G3）。 */
function normalizeFactText(value: string): string {
  return value.replace(/[\s\u3000，。；：、！？·,.…;:!?"'「」『』（）()【】\[\]—\-]/g, "");
}

/** 易逝类（scene/deal/other）只保留最近这么多条；恒定类与无标签不裁剪。 */
const TRANSIENT_CONSTRAINT_CAP = 30;
function trimTransientConstraints<T extends { category?: string }>(constraints: T[]): T[] {
  const kept: T[] = [];
  let transientKept = 0;
  for (let i = constraints.length - 1; i >= 0; i--) {
    const transient = constraints[i].category === "scene" || constraints[i].category === "deal" || constraints[i].category === "other";
    if (transient && transientKept >= TRANSIENT_CONSTRAINT_CAP) continue;
    if (transient) transientKept++;
    kept.unshift(constraints[i]);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// M0.2 — pre-merge validation (auto-pilot path).
//
// `detectStateDiffConflicts` above produces *warnings* for the interactive
// StateDiffPanel where a human decides. The auto-pilot has no human in the
// loop, so it needs hard *rejections*: a hallucinated or illegal diff that
// merges into the Bible is inherited by every later chapter ("宁可状态滞后,
// 不可状态污染"). See docs/DESIGN_LONGFORM_COHERENCE.md §M0.2.
// ---------------------------------------------------------------------------

export type StateDiffValidationCode =
  | "unknown_character"
  | "thread_status_regression"
  | "diff_too_large";

export interface StateDiffValidationIssue {
  code: StateDiffValidationCode;
  message: string;
}

/**
 * Default max items across all diff sections. A single chapter legitimately
 * changes a handful of states; a diff this large usually means the model
 * dumped the whole story state back (or hallucinated), and merging it would
 * amplify noise. The cap is per-run configurable via `max_state_changes`
 * (see GenerationPolicySchema). 2026-10 real-run calibration: deepseek-v4-flash
 * produces 17–24 items for a NORMAL chapter (six samples: 24/17/23/22/21/19),
 * so the old default of 15 rejected almost every chapter; 30 clears the
 * observed range with headroom while still catching full-state regurgitation.
 */
export const DEFAULT_MAX_STATE_CHANGES = 30;

export interface ValidateStateDiffOptions {
  /** Per-chapter cap on total diff items. Defaults to {@link DEFAULT_MAX_STATE_CHANGES}. */
  maxStateChanges?: number;
}

/**
 * Validate a StateDiff before unattended merge. Three cheap, deterministic
 * checks — no LLM calls:
 *
 * 1. Entity existence: updated characters must already exist in the Bible /
 *    story_state, be introduced by this diff's `new_entities`, or appear in
 *    the chapter text itself (anti-hallucination).
 * 2. State-machine legality: a resolved plot thread cannot regress to
 *    open/progressing.
 * 3. Scale sanity: oversized diffs are rejected wholesale.
 *
 * Returns an empty array when the diff is safe to merge.
 */
export function validateStateDiff(
  bible: BibleDraft,
  diff: StateDiff,
  chapterContent: string,
  options: ValidateStateDiffOptions = {},
): StateDiffValidationIssue[] {
  const issues: StateDiffValidationIssue[] = [];
  const maxStateChanges = options.maxStateChanges ?? DEFAULT_MAX_STATE_CHANGES;

  // -- 3. Scale first: a dumped/hallucinated mega-diff makes per-item checks moot.
  const totalItems =
    diff.character_updates.length +
    diff.timeline_events.length +
    diff.plot_thread_updates.length +
    diff.new_entities.length;
  if (totalItems > maxStateChanges) {
    issues.push({
      code: "diff_too_large",
      message: `状态变更共 ${totalItems} 条,超过单章上限 ${maxStateChanges} 条,疑似模型回灌全量状态。`,
    });
    return issues;
  }

  // -- 1. Entity existence for character updates.
  const knownNames = new Set<string>([
    ...bible.characters.map((c) => normalizeName(c.name)),
    ...(bible.story_state?.characters?.map((c) => normalizeName(c.name)) ?? []),
    ...diff.new_entities.filter((e) => e.type === "character").map((e) => normalizeName(e.name)),
  ]);
  for (const update of diff.character_updates) {
    const candidates = nameCandidates(update.name);
    // 任一候选（纯名 / 括号外 / 括号内）命中已知实体即算存在
    if (candidates.some((c) => knownNames.has(c))) continue;
    // Last resort: 名字（取括号外主名）字面出现在章节正文——本章新登场的角色
    const mainName = candidates[1] ?? candidates[0];
    if (mainName && chapterContent.includes(mainName)) continue;
    if (candidates[0] && chapterContent.includes(candidates[0])) continue;
    // 描述性泛称宽容（2026-10 验证跑批实测）：state-diff 偶尔把无名过场角色按
    // 描述性称呼记入 character_updates（正文「高个弟子」→ 记「高个内门弟子」），
    // 逐字与包含匹配都命不中。取候选的 2 字滑窗片段，≥2 个出现在正文中即视为
    // 真实指代而非幻觉——纯编造的名字（如「陆文渊」）几乎不会有片段命中。
    const normalizedContent = normalizeName(chapterContent);
    if (candidates.some((c) => {
      const n = normalizeName(c);
      if (n.length < 4) return false;
      let hits = 0;
      for (let i = 0; i + 2 <= n.length; i++) {
        if (normalizedContent.includes(n.slice(i, i + 2))) hits++;
        if (hits >= 2) return true;
      }
      return false;
    })) continue;
    issues.push({
      code: "unknown_character",
      message: `角色「${update.name}」不存在于 Bible/Story State,也未出现在本章正文,疑似幻觉实体。`,
    });
  }

  // -- 2. Plot-thread status regression.
  const resolvedThreads = new Set(
    bible.story_state?.plot_threads
      ?.filter((t) => t.status === "resolved")
      .map((t) => normalizeName(t.title)) ?? [],
  );
  for (const update of diff.plot_thread_updates) {
    if (update.status !== "resolved" && resolvedThreads.has(normalizeName(update.title))) {
      issues.push({
        code: "thread_status_regression",
        message: `线索「${update.title}」已是 resolved,不允许回退为 ${update.status}。`,
      });
    }
  }

  return issues;
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

  // 合并 foreshadowing_updates：按 clue 匹配更新状态，新 clue 追加。
  // 这是伏笔状态机（planted→reinforced→revealed→resolved）的增量更新——
  // 让 writer 能看到未回收伏笔、避免悬置（如追踪符第2章埋后4章不提）。
  for (const update of (diff.foreshadowing_updates ?? [])) {
    const idx = foreshadowing.findIndex((f) => f.clue === update.clue);
    if (idx >= 0) {
      foreshadowing[idx] = { ...foreshadowing[idx], status: update.status, payoff_hint: update.payoff_hint ?? foreshadowing[idx].payoff_hint, notes: update.notes ?? foreshadowing[idx].notes };
      if (update.status === "resolved") foreshadowing[idx].resolved_in = chapterIndex;
    } else {
      foreshadowing.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clue: update.clue,
        status: update.status,
        introduced_in: chapterIndex,
        payoff_hint: update.payoff_hint,
        notes: update.notes,
      });
    }
  }

  // 2.7 防膨胀：timeline 只保留最近 N 条——writer 只取最后 1 条、critic 最后 10 条、
  // state-diff 只需基于最近状态判断增量；远端事件由卷摘要 / RAG 承载，不全量堆积进每章 prompt。
  const TIMELINE_KEEP_RECENT = 20;
  const trimmedTimeline = timeline.length > TIMELINE_KEEP_RECENT
    ? timeline.slice(-TIMELINE_KEEP_RECENT)
    : timeline;

  // P3-4.1 活跃约束清单：合并 state-diff 产出的 constraint_updates。
  // established_in 记录确立章号，供 writer/critic 追溯；本章注入 prompt 防跨章违背。
  // G3（2026-10 真实跑批教训）：30 章堆积 244 条（含「考牌随身携带」与「考牌已
  // 裂开装包袱」等陈旧版本并存），critic 注意力被稀释，年限/身份/知识边界三类
  // 真实矛盾全部漏检。两层治理：归一化近似去重（标点/空白差异不重复入库）+
  // 易逝类（scene/deal/other）只留最近 TRANSIENT_CONSTRAINT_CAP 条。恒定类与
  // 无标签（旧数据）不裁剪——早期身份事实被裁掉的代价比臃肿更高。
  const activeConstraints = prev.active_constraints ? [...prev.active_constraints] : [];
  for (const update of (diff.constraint_updates ?? [])) {
    if (!activeConstraints.some((c) => normalizeFactText(c.fact) === normalizeFactText(update.fact))) {
      activeConstraints.push({
        fact: update.fact,
        established_in: chapterIndex,
        validity: update.validity,
        ...(update.category != null ? { category: update.category } : {}),
        ...(update.notes != null ? { notes: update.notes } : {}),
      });
    }
  }
  const trimmedConstraints = trimTransientConstraints(activeConstraints);

  const nextState: StoryStateV1 = {
    ...(characters.length > 0 ? { characters } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(trimmedTimeline.length > 0 ? { timeline: trimmedTimeline } : {}),
    ...(prev.relationships && prev.relationships.length > 0 ? { relationships: prev.relationships } : {}),
    ...(plotThreads.length > 0 ? { plot_threads: plotThreads } : {}),
    ...(foreshadowing.length > 0 ? { foreshadowing } : {}),
    ...(trimmedConstraints.length > 0 ? { active_constraints: trimmedConstraints } : {}),
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
