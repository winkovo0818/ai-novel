import type {
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatStreamCallbacks,
  ChatStreamOptions,
  ChatStreamResult,
} from "./client";

export function isLlmMockEnabled(): boolean {
  return process.env.LLM_MOCK === "1" || process.env.LLM_MOCK === "true";
}

export async function mockChatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const content = JSON.stringify(mockJsonForRoute(opts.route));
  return {
    content: opts.route.includes("/healthz/llm") ? "ok" : content,
    tokenIn: 10,
    tokenOut: Math.max(1, Math.ceil(content.length / 4)),
    costCny: 0,
    tookMs: 1,
    model: "mock-deepseek-chat",
  };
}

export async function mockStreamChatCompletion(
  opts: ChatStreamOptions,
  callbacks: ChatStreamCallbacks,
): Promise<ChatStreamResult> {
  const content = JSON.stringify(mockBibleDraft());
  const chunkSize = 96;

  for (let i = 0; i < content.length; i += chunkSize) {
    await callbacks.onDelta(content.slice(i, i + chunkSize));
  }

  return {
    content,
    tokenIn: 100,
    tokenOut: Math.ceil(content.length / 4),
    costCny: 0,
    tookMs: 1,
    model: opts.model ?? "mock-deepseek-chat",
  };
}

function mockJsonForRoute(route: string): unknown {
  if (route.includes("/loglines")) {
    return {
      loglines: [
        "被废柴宗门收留的少年觉醒上古剑魂，决定查清父母旧案。",
        "落魄火房弟子得到残魂指点，在宗门考核中逆转命运。",
        "雨夜柴门中，一个装傻少年被迫拔出沉睡千年的断剑。",
        "被当成弃子的少年发现自己才是仙门旧案最后的证人。",
        "宗门想用少年献祭剑魂，却意外放出了真正的复仇者。",
      ],
    };
  }

  if (route.includes("/questions")) {
    return {
      questions: [
        {
          key: "protagonist_personality",
          question: "主角的性格底色是？",
          type: "single",
          options: ["表面懦弱内心坚韧", "冷静话少", "热血莽撞", "腹黑算计"],
          recommended_index: 0,
        },
        {
          key: "opening_pace",
          question: "开局节奏更偏向哪种？",
          type: "single",
          options: ["开局高压", "日常铺垫", "直接逃亡", "考核逆袭"],
          recommended_index: 0,
        },
        {
          key: "sweet_spots",
          question: "主要爽点是什么？",
          type: "multi",
          options: ["扮猪吃虎", "打脸报仇", "师徒羁绊", "宗门逆袭"],
          recommended_index: 0,
        },
      ],
    };
  }

  return mockBibleDraft();
}

function mockBibleDraft() {
  return {
    meta: {
      suggested_title: "逆魂纪",
      alternative_titles: ["剑魂歌", "柴门逆", "裁逆者"],
    },
    characters: [
      {
        role: "protagonist",
        name: "沈言",
        age: 16,
        appearance: "瘦削少年，腕有旧疤",
        personality: "表面懦弱，实则冷静记仇",
        catchphrase: "我没有，你别乱说。",
        abilities: ["剑魂共振", "隐忍观察"],
        goals: "短期活过宗门考核，长期查清父母旧案。",
        motivation: "他被废柴宗门收留多年，觉醒剑魂后第一次拥有追问真相的能力。",
        secrets: ["体内封着上古剑魂"],
        relations: [],
      },
      {
        role: "mentor",
        name: "几",
        age: "上古残魂",
        appearance: "青烟般的老者剑影",
        personality: "毒舌吝啬但护短",
        catchphrase: "你这资质，老夫头疼。",
        abilities: ["剑道残识"],
        goals: "短期保住沈言，长期重塑剑魂本体。",
        motivation: "他需要借沈言体质逃过旧敌追索，也想弥补当年剑祸。",
        secrets: ["认识沈言父亲"],
        relations: ["沈言的导师"],
      },
      {
        role: "antagonist",
        name: "蒋阶",
        age: 42,
        appearance: "白袍温和，指节发黑",
        personality: "外宽内狠，擅长表演仁义",
        catchphrase: "本门同心，何出此言。",
        abilities: ["驭人心术"],
        goals: "短期夺取剑魂，长期复兴衰败宗门。",
        motivation: "他相信牺牲沈言能换来全门生机，因此不断自我合理化恶行。",
        secrets: ["知道沈言父母死因"],
        relations: ["沈言名义上的门主"],
      },
    ],
    world: {
      setting_summary:
        "九州仙门衰落，剑魂是上古遗留的力量核心。废柴宗门靠收留弃徒苟延残喘，各大宗门暗中寻找能承载剑魂的少年。",
      factions: [
        { name: "柴饦门", alignment: "中立偏黑", role: "沈言所在宗门" },
        { name: "天代宗", alignment: "正道", role: "外部压力来源" },
      ],
      rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
      geography: ["柴饦峰", "雨宗古道"],
    },
    outline: {
      volume_1: {
        name: "柴门起",
        theme: "被收留者反过来审判收留者",
        chapter_count_estimate: 8,
        chapters: Array.from({ length: 8 }, (_, index) => ({
          index: index + 1,
          title: `第${index + 1}章`,
          summary:
            index === 3
              ? "沈言在考核中首次与剑魂配合，制造首个小高潮，并暴露被追索的风险。"
              : index === 5
                ? "蒋阶旧案露出破绽，埋下沈言父母之死与剑魂有关的关键伏笔。"
                : "沈言在宗门压迫中积累线索，逐步确认自己必须反过来利用考核脱身。",
        })),
      },
    },
    first_chapter_beats: [
      { beat: 1, scene: "雨夜火房", purpose: "交代沈言在宗门底层的处境" },
      { beat: 2, scene: "执事责罚", purpose: "制造压迫并展示主角伪装" },
      { beat: 3, scene: "后山裂井", purpose: "引出剑魂低语" },
      { beat: 4, scene: "残魂试探", purpose: "建立师徒张力" },
      { beat: 5, scene: "门主召见", purpose: "抛出下一章考核危机" },
    ],
  };
}
