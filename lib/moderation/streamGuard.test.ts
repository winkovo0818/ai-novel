import { describe, expect, it } from "vitest";

import { StreamModerationGuard } from "./streamGuard";

describe("StreamModerationGuard", () => {
  it("allows clean segments through with no metadata", () => {
    const g = new StreamModerationGuard();
    expect(g.check("一个寻常的春日早晨。")).toEqual({ allowed: true });
  });

  it("blocks a segment containing a banned keyword", () => {
    const g = new StreamModerationGuard();
    const r = g.check("xxxx 制作炸弹 yyyy");
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("MODERATION_BLOCKED_INLINE");
    expect(r.reason).toBe("内容包含违规关键词");
    expect(r.matchedPattern).toMatch(/制作炸弹/);
  });

  it("catches a keyword split across two segments via the sliding tail (D-02)", () => {
    const g = new StreamModerationGuard();
    // Naive scan of each segment in isolation would miss; the guard
    // remembers the last 16 chars from segment 1 and concatenates
    // before scanning segment 2.
    expect(g.check("第一段以制").allowed).toBe(true);
    const r = g.check("作炸弹结束。");
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("MODERATION_BLOCKED_INLINE");
  });

  it("does NOT false-positive when the tail + head don't actually form a keyword", () => {
    const g = new StreamModerationGuard();
    g.check("普通的剧情走向");
    expect(g.check("继续平稳推进。").allowed).toBe(true);
  });

  it("only retains the last 16 chars between scans (cap on the window)", () => {
    const g = new StreamModerationGuard();
    // Push a long clean segment, then split a keyword such that more
    // than 16 chars of separator sit between the two halves. That
    // separator should drop out of the tail, so the next scan misses
    // — which is correct: real readers would have seen those 16+
    // chars of clean content between the halves, so the phrase did
    // NOT actually appear in the stream.
    g.check("制" + "x".repeat(30));
    expect(g.check("作炸弹").allowed).toBe(true);
  });

  it("reset() clears the tail so subsequent checks see no carryover", () => {
    const g = new StreamModerationGuard();
    g.check("第一段以制");
    g.reset();
    // After reset, "作炸弹" alone is not a complete keyword match.
    expect(g.check("作炸弹").allowed).toBe(true);
  });

  it("doesn't advance the tail when a segment is blocked", () => {
    const g = new StreamModerationGuard();
    expect(g.check("一段含 制作炸弹 内容").allowed).toBe(false);
    // The next scan should behave as if the previous one never ran.
    expect(g.check("干净内容").allowed).toBe(true);
  });
});
