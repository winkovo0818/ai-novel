import { describe, it, expect } from "vitest";
import { getGenerationPolicy } from "./generationPolicy";
import type { NovelProfile } from "../validation/schemas";

function makeProfile(overrides: Partial<NovelProfile> = {}): NovelProfile {
  return {
    genre_main: "web",
    genre_sub: "玄幻",
    description: "",
    audience: "general",
    length: "long",
    tone: "cool",
    pace: "fast",
    pov: "third_limited",
    chapter_word_count: 3000,
    ai_freedom: "mid",
    ...overrides,
  };
}

describe("getGenerationPolicy", () => {
  it("returns default policy with standard profile", () => {
    const policy = getGenerationPolicy(makeProfile());
    expect(policy.temperature).toBe(0.9);
    expect(policy.targetWordCount).toBe(3000);
    expect(policy.toneDirective).toContain("冷静克制");
    expect(policy.povDirective).toContain("第三人称有限视角");
    expect(policy.audienceDirective).toContain("泛读者群");
  });

  it("maps tone=healing to higher temperature and healing directive", () => {
    const policy = getGenerationPolicy(makeProfile({ tone: "healing" }));
    expect(policy.temperature).toBe(0.95);
    expect(policy.toneDirective).toContain("温暖治愈");
  });

  it("maps tone=comedy to highest base temperature", () => {
    const policy = getGenerationPolicy(makeProfile({ tone: "comedy" }));
    expect(policy.temperature).toBe(1);
    expect(policy.toneDirective).toContain("轻松幽默");
  });

  it("maps tone=dark to cool temperature with dark directive", () => {
    const policy = getGenerationPolicy(makeProfile({ tone: "dark" }));
    expect(policy.toneDirective).toContain("暗黑压抑");
  });

  it("maps ai_freedom=conservative to lower temperature and strict directive", () => {
    const policy = getGenerationPolicy(makeProfile({ ai_freedom: "conservative" }));
    expect(policy.temperature).toBe(0.8);
    expect(policy.freedomDirective).toContain("严格遵守");
  });

  it("maps ai_freedom=wild to higher temperature and creative directive", () => {
    const policy = getGenerationPolicy(makeProfile({ ai_freedom: "wild" }));
    expect(policy.temperature).toBe(1.05);
    expect(policy.freedomDirective).toContain("自由发挥");
  });

  it("maps pace=slow to lower temperature and slow directive", () => {
    const policy = getGenerationPolicy(makeProfile({ pace: "slow" }));
    expect(policy.paceDirective).toContain("舒缓");
  });

  it("maps audience=male to male-oriented directive", () => {
    const policy = getGenerationPolicy(makeProfile({ audience: "male" }));
    expect(policy.audienceDirective).toContain("男性读者");
  });

  it("maps pov=first to first-person directive", () => {
    const policy = getGenerationPolicy(makeProfile({ pov: "first" }));
    expect(policy.povDirective).toContain("第一人称");
  });

  it("clamps temperature between 0.3 and 1.2", () => {
    const conservative = getGenerationPolicy(makeProfile({ tone: "serious", pace: "slow", ai_freedom: "conservative" }));
    expect(conservative.temperature).toBeGreaterThanOrEqual(0.3);

    const wild = getGenerationPolicy(makeProfile({ tone: "comedy", pace: "fast", ai_freedom: "wild" }));
    expect(wild.temperature).toBeLessThanOrEqual(1.2);
  });

  it("respects chapter_word_count from profile", () => {
    const policy = getGenerationPolicy(makeProfile({ chapter_word_count: 5000 }));
    expect(policy.targetWordCount).toBe(5000);
  });

  it("exposes default sampling penalties matching production /chapters/draft", () => {
    const policy = getGenerationPolicy(makeProfile());
    expect(policy.topP).toBe(0.95);
    expect(policy.frequencyPenalty).toBe(0.5);
    expect(policy.presencePenalty).toBe(0.3);
    expect(policy.isMystery).toBe(false);
    expect(policy.genreDirective).toBe("");
  });

  it("flags mystery sub-genres and bumps vocab-variety penalties", () => {
    const suspense = getGenerationPolicy(makeProfile({ genre_sub: "都市悬疑" }));
    expect(suspense.isMystery).toBe(true);
    expect(suspense.frequencyPenalty).toBeCloseTo(0.6, 2);
    expect(suspense.presencePenalty).toBeCloseTo(0.35, 2);
    expect(suspense.genreDirective).toContain("悬疑");
    // Mystery temp trim: 0.85 (cool) + 0.05 (fast) + 0 (mid) - 0.05 (mystery) = 0.85
    expect(suspense.temperature).toBeCloseTo(0.85, 2);

    const detective = getGenerationPolicy(makeProfile({ genre_sub: "本格推理" }));
    expect(detective.isMystery).toBe(true);

    const sleuth = getGenerationPolicy(makeProfile({ genre_sub: "硬汉侦探" }));
    expect(sleuth.isMystery).toBe(true);
  });

  it("does not flag non-mystery genres", () => {
    expect(getGenerationPolicy(makeProfile({ genre_sub: "玄幻" })).isMystery).toBe(false);
    expect(getGenerationPolicy(makeProfile({ genre_sub: "硬科幻" })).isMystery).toBe(false);
    expect(getGenerationPolicy(makeProfile({ genre_sub: "历史权谋" })).isMystery).toBe(false);
  });
});