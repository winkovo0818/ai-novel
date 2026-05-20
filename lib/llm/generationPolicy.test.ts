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
    expect(policy.temperature).toBe(0.8);
    expect(policy.targetWordCount).toBe(3000);
    expect(policy.toneDirective).toContain("冷静克制");
    expect(policy.povDirective).toContain("第三人称有限视角");
    expect(policy.audienceDirective).toContain("泛读者群");
  });

  it("maps tone=healing to higher temperature and healing directive", () => {
    const policy = getGenerationPolicy(makeProfile({ tone: "healing" }));
    expect(policy.temperature).toBe(0.85);
    expect(policy.toneDirective).toContain("温暖治愈");
  });

  it("maps tone=comedy to highest base temperature", () => {
    const policy = getGenerationPolicy(makeProfile({ tone: "comedy" }));
    expect(policy.temperature).toBe(0.9);
    expect(policy.toneDirective).toContain("轻松幽默");
  });

  it("maps tone=dark to cool temperature with dark directive", () => {
    const policy = getGenerationPolicy(makeProfile({ tone: "dark" }));
    expect(policy.toneDirective).toContain("暗黑压抑");
  });

  it("maps ai_freedom=conservative to lower temperature and strict directive", () => {
    const policy = getGenerationPolicy(makeProfile({ ai_freedom: "conservative" }));
    expect(policy.temperature).toBe(0.7);
    expect(policy.freedomDirective).toContain("严格遵守");
  });

  it("maps ai_freedom=wild to higher temperature and creative directive", () => {
    const policy = getGenerationPolicy(makeProfile({ ai_freedom: "wild" }));
    expect(policy.temperature).toBe(0.95);
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
});