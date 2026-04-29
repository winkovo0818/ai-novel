import { describe, it, expect } from "vitest";
import {
  BibleDraftSchema,
  CharacterSchema,
  QuestionSchema,
  NovelProfileSchema,
  buildDefaultProfile,
} from "./schemas";

// ──────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────

function validCharacter(role: "protagonist" | "mentor" | "antagonist" = "protagonist") {
  return {
    role,
    name: "沈言",
    age: 16,
    appearance: "平头讷讨，手腕上有同门留下的疤",
    personality: "表面懦弱实则冷静记仇",
    catchphrase: "我没有，你别乱说。",
    abilities: ["琉璃体质", "与剑魂共振"],
    goals: "短期：活下去；长期：查清父母之死",
    motivation: "三岁时亲眼看到父母被同门灭口，被以赎罪名义扣在柴饦门",
    secrets: ["体内封印了上古剑魂『几』"],
    relations: [],
  };
}

function validBibleDraft() {
  const chapters = Array.from({ length: 10 }, (_, i) => ({
    index: i + 1,
    title: `第${i + 1}章`,
    summary:
      "这是一段长度足够通过 zod 校验的章节梗概，至少二十字，覆盖核心剧情节奏。",
  }));

  return {
    meta: {
      suggested_title: "逆魂纪",
      alternative_titles: ["剑魂歌", "裁逆者", "柴门主"],
    },
    characters: [
      validCharacter("protagonist"),
      { ...validCharacter("mentor"), name: "几", catchphrase: "你这点资质，老夫看了选股。" },
      { ...validCharacter("antagonist"), name: "蒋阶", catchphrase: "本门同心，何出此言。" },
    ],
    world: {
      setting_summary:
        "九州碎裂，十二仙脉争夺资源；修仙体系十境，剑魂为上古遗产，可越阶辅助体质；柴饦门为废柴宗门，门主蒋阶心思深沉，主角沈言被以赎罪名义扣押在此。",
      factions: [
        { name: "柴饦门", alignment: "中立", role: "废柴宗门" },
        { name: "天代宗", alignment: "正道", role: "蒋阶宿敌的正派宗门" },
      ],
      rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
      geography: ["雨宗 - 多雨", "柴饦峰 - 主角住处"],
    },
    outline: {
      volume_1: {
        name: "柴饦起",
        theme: "从被灭门到逆袭宗门",
        chapter_count_estimate: 30,
        chapters,
      },
    },
    first_chapter_beats: [
      { beat: 1, scene: "雨夜火房", purpose: "建立反差" },
      { beat: 2, scene: "逆部分闯入", purpose: "制造冲突" },
      { beat: 3, scene: "柳招出场", purpose: "引出配角" },
      { beat: 4, scene: "主角后院夜训", purpose: "补主角动机" },
      { beat: 5, scene: "剑魂初鸣", purpose: "悬念钩子" },
    ],
  };
}

// ──────────────────────────────────────────────────
// BibleDraft
// ──────────────────────────────────────────────────

describe("BibleDraftSchema", () => {
  it("accepts a valid draft", () => {
    const r = BibleDraftSchema.safeParse(validBibleDraft());
    expect(r.success).toBe(true);
  });

  it("rejects when there is no protagonist", () => {
    const draft = validBibleDraft();
    draft.characters[0]!.role = "mentor";
    const r = BibleDraftSchema.safeParse(draft);
    expect(r.success).toBe(false);
  });

  it("rejects when there are 2 protagonists", () => {
    const draft = validBibleDraft();
    draft.characters[1]!.role = "protagonist";
    const r = BibleDraftSchema.safeParse(draft);
    expect(r.success).toBe(false);
  });

  it("rejects when chapters length < 8", () => {
    const draft = validBibleDraft();
    draft.outline.volume_1.chapters = draft.outline.volume_1.chapters.slice(0, 7);
    const r = BibleDraftSchema.safeParse(draft);
    expect(r.success).toBe(false);
  });

  it("rejects when chapters length > 12", () => {
    const draft = validBibleDraft();
    const extra = Array.from({ length: 5 }, (_, i) => ({
      index: 11 + i,
      title: `第${11 + i}章`,
      summary: "扩展章节用以触发越界，长度需要超过最低字数限制以避免误判。",
    }));
    draft.outline.volume_1.chapters = [
      ...draft.outline.volume_1.chapters,
      ...extra,
    ];
    const r = BibleDraftSchema.safeParse(draft);
    expect(r.success).toBe(false);
  });

  it("rejects when first_chapter_beats < 5", () => {
    const draft = validBibleDraft();
    draft.first_chapter_beats = draft.first_chapter_beats.slice(0, 4);
    const r = BibleDraftSchema.safeParse(draft);
    expect(r.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────
// Question
// ──────────────────────────────────────────────────

describe("QuestionSchema", () => {
  const valid = {
    key: "protagonist_personality",
    question: "主角的性格底色是？",
    type: "single" as const,
    options: ["A", "B", "C", "D"],
    recommended_index: 0,
  };

  it("accepts a valid question", () => {
    expect(QuestionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-snake_case key", () => {
    const r = QuestionSchema.safeParse({ ...valid, key: "BadKey" });
    expect(r.success).toBe(false);
  });

  it("rejects when options length != 4", () => {
    const r = QuestionSchema.safeParse({ ...valid, options: ["A", "B", "C"] });
    expect(r.success).toBe(false);
  });

  it("rejects out-of-range recommended_index", () => {
    const r = QuestionSchema.safeParse({ ...valid, recommended_index: 4 });
    expect(r.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────
// NovelProfile
// ──────────────────────────────────────────────────

describe("NovelProfileSchema / buildDefaultProfile", () => {
  it("fills all defaults from minimal input", () => {
    const p = buildDefaultProfile("web", "玄幻");
    expect(p.audience).toBe("general");
    expect(p.length).toBe("long");
    expect(p.tone).toBe("cool");
    expect(p.pov).toBe("third_limited");
    expect(p.chapter_word_count).toBe(3000);
    expect(p.ai_freedom).toBe("mid");
  });

  it("rejects unknown genre_main", () => {
    const r = NovelProfileSchema.safeParse({
      genre_main: "novel",
      genre_sub: "玄幻",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty genre_sub", () => {
    const r = NovelProfileSchema.safeParse({
      genre_main: "web",
      genre_sub: "",
    });
    expect(r.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────
// Character (smoke)
// ──────────────────────────────────────────────────

describe("CharacterSchema", () => {
  it("rejects abilities length 0", () => {
    const c = { ...validCharacter(), abilities: [] };
    expect(CharacterSchema.safeParse(c).success).toBe(false);
  });

  it("rejects abilities length > 3", () => {
    const c = { ...validCharacter(), abilities: ["a", "b", "c", "d"] };
    expect(CharacterSchema.safeParse(c).success).toBe(false);
  });
});
