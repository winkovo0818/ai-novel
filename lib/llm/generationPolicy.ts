import type { NovelProfile } from "../validation/schemas";

export interface GenerationPolicy {
  temperature: number;
  targetWordCount: number;
  freedomDirective: string;
  toneDirective: string;
  paceDirective: string;
  audienceDirective: string;
  povDirective: string;
}

const TONE_MAP: Record<NovelProfile["tone"], { temperature: number; directive: string }> = {
  cool: { temperature: 0.75, directive: "保持冷静克制的叙事风格，对白精练，不过度渲染情绪。" },
  serious: { temperature: 0.7, directive: "保持严肃深沉的叙事基调，注重逻辑与内心刻画。" },
  healing: { temperature: 0.8, directive: "保持温暖治愈的叙事风格，注重日常细节与情感流动。" },
  dark: { temperature: 0.75, directive: "保持暗黑压抑的叙事风格，善用伏笔和反转，营造不安感。" },
  comedy: { temperature: 0.85, directive: "保持轻松幽默的叙事风格，善用对话节奏和意外转折。" },
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

export function getGenerationPolicy(profile: NovelProfile): GenerationPolicy {
  const toneInfo = TONE_MAP[profile.tone];
  const paceInfo = PACE_MAP[profile.pace];
  const freedomInfo = FREEDOM_MAP[profile.ai_freedom];

  const temperature = Math.max(0.3, Math.min(1.2, toneInfo.temperature + paceInfo.temperatureDelta + freedomInfo.temperatureDelta));

  return {
    temperature: Math.round(temperature * 100) / 100,
    targetWordCount: profile.chapter_word_count,
    freedomDirective: freedomInfo.directive,
    toneDirective: toneInfo.directive,
    paceDirective: paceInfo.directive,
    audienceDirective: AUDIENCE_MAP[profile.audience],
    povDirective: POV_MAP[profile.pov],
  };
}