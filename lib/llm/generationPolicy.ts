import type { NovelProfile } from "@/lib/validation/schemas";

export interface GenerationPolicy {
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  targetWordCount: number;
  freedomDirective: string;
  toneDirective: string;
  paceDirective: string;
  audienceDirective: string;
  povDirective: string;
  /** Non-empty only for mystery / suspense / detective sub-genres. */
  genreDirective: string;
  /** Suspense/mystery flag downstream prompts use to swap framing. */
  isMystery: boolean;
}

// Baseline temperatures raised by +0.1 across the board (was 0.7-0.85) so the
// model gets enough sampling entropy to satisfy the anti-AI-signature directive
// in HUMAN_STYLE_DIRECTIVE. Floor still clamps to 0.3 at the bottom of the
// final delta math, so conservative combos won't crater into deterministic mode.
const TONE_MAP: Record<NovelProfile["tone"], { temperature: number; directive: string }> = {
  cool: { temperature: 0.85, directive: "保持冷静克制的叙事风格，对白精练，不过度渲染情绪。" },
  serious: { temperature: 0.8, directive: "保持严肃深沉的叙事基调，注重逻辑与内心刻画。" },
  healing: { temperature: 0.9, directive: "保持温暖治愈的叙事风格，注重日常细节与情感流动。" },
  dark: { temperature: 0.85, directive: "保持暗黑压抑的叙事风格，善用伏笔和反转，营造不安感。" },
  comedy: { temperature: 0.95, directive: "保持轻松幽默的叙事风格，善用对话节奏和意外转折。" },
};

const PACE_MAP: Record<NovelProfile["pace"], { temperatureDelta: number; directive: string }> = {
  fast: { temperatureDelta: 0.05, directive: "节奏明快，每章推进显著剧情，避免冗余过渡。" },
  mid: { temperatureDelta: 0, directive: "节奏适中，兼顾剧情推进与氛围描写。" },
  slow: { temperatureDelta: -0.05, directive: "节奏舒缓，留出充足空间用于环境描写、心理活动和叙事留白。" },
};

const FREEDOM_MAP: Record<NovelProfile["ai_freedom"], { temperatureDelta: number; directive: string }> = {
  conservative: { temperatureDelta: -0.1, directive: "严格遵守大纲和已有设定，不要自行创造新角色或新线索。" },
  mid: { temperatureDelta: 0, directive: "可以适度扩展大纲已有线索，但不要引入大纲未提示的重大情节转折。" },
  wild: { temperatureDelta: 0.15, directive: "可以在合理范围内自由发挥，引入意料之外的情节转折和新角色，只要不违反核心设定。" },
};

const AUDIENCE_MAP: Record<NovelProfile["audience"], string> = {
  male: "面向男性读者，注重情节推进、对抗和策略。",
  female: "面向女性读者，注重情感描写、人物关系和内心成长。",
  general: "面向泛读者群，兼顾情节与情感。",
};

const POV_MAP: Record<NovelProfile["pov"], string> = {
  first: "使用第一人称视角叙事。",
  third_limited: "使用第三人称有限视角叙事，聚焦于主角内心。",
  omniscient: "使用全知视角叙事，可在不同角色间切换。",
};

// Baseline sampling penalties — match production /chapters/draft route so the
// matrix eval reflects production behaviour. Suspense / mystery bumps the
// vocab-variety knobs because P1-14 traced the score drop to repeated clue /
// motif phrasing the previous defaults didn't suppress.
const DEFAULT_TOP_P = 0.95;
const DEFAULT_FREQUENCY_PENALTY = 0.5;
const DEFAULT_PRESENCE_PENALTY = 0.3;

const MYSTERY_KEYWORDS = ["悬疑", "推理", "侦探"];

function isMysteryProfile(profile: NovelProfile): boolean {
  const sub = profile.genre_sub ?? "";
  return MYSTERY_KEYWORDS.some((kw) => sub.includes(kw));
}

export function getGenerationPolicy(profile: NovelProfile): GenerationPolicy {
  const toneInfo = TONE_MAP[profile.tone];
  const paceInfo = PACE_MAP[profile.pace];
  const freedomInfo = FREEDOM_MAP[profile.ai_freedom];
  const mystery = isMysteryProfile(profile);

  // Suspense temperature trim avoids the model improvising new clues that
  // contradict prior beats — same reason we bump frequency/presence penalty
  // so identical clue / motif phrasings get pushed further down the sample.
  const mysteryTempDelta = mystery ? -0.05 : 0;
  const temperature = Math.max(
    0.3,
    Math.min(1.2, toneInfo.temperature + paceInfo.temperatureDelta + freedomInfo.temperatureDelta + mysteryTempDelta),
  );

  const frequencyPenalty = mystery ? DEFAULT_FREQUENCY_PENALTY + 0.1 : DEFAULT_FREQUENCY_PENALTY;
  const presencePenalty = mystery ? DEFAULT_PRESENCE_PENALTY + 0.05 : DEFAULT_PRESENCE_PENALTY;

  const genreDirective = mystery
    ? "悬疑/推理题材：本章引入的线索必须能在后续章节被回收，且不要一次揭示真相；用'目标 → 阻碍 → 调查/试探 → 新线索或新疑点'的节奏推进，并明确区分'已知 / 未知 / 误导'三类信息。"
    : "";

  return {
    temperature: Math.round(temperature * 100) / 100,
    topP: DEFAULT_TOP_P,
    frequencyPenalty: Math.round(frequencyPenalty * 100) / 100,
    presencePenalty: Math.round(presencePenalty * 100) / 100,
    targetWordCount: profile.chapter_word_count,
    freedomDirective: freedomInfo.directive,
    toneDirective: toneInfo.directive,
    paceDirective: paceInfo.directive,
    audienceDirective: AUDIENCE_MAP[profile.audience],
    povDirective: POV_MAP[profile.pov],
    genreDirective,
    isMystery: mystery,
  };
}
