import { describe, expect, it } from "vitest";

import { StreamSegmenter } from "./streamSegmenter";

describe("StreamSegmenter", () => {
  it("returns nothing when no boundary is reached", () => {
    const s = new StreamSegmenter();
    expect(s.feed("一个寻常的春日")).toEqual([]);
    expect(s.pendingLength).toBe(7);
  });

  it("emits a segment on `。` and keeps the rest buffered", () => {
    const s = new StreamSegmenter();
    expect(s.feed("天气晴朗。主角推门")).toEqual(["天气晴朗。"]);
    expect(s.pendingLength).toBe("主角推门".length);
  });

  it.each([
    ["!", "ASCII bang"],
    ["?", "ASCII query"],
    ["！", "fullwidth bang"],
    ["？", "fullwidth query"],
    ["\n", "newline"],
  ])("treats `%s` (%s) as a boundary", (boundary) => {
    const s = new StreamSegmenter();
    const segments = s.feed(`第一句${boundary}第二句`);
    expect(segments).toEqual([`第一句${boundary}`]);
  });

  it("handles multiple boundaries inside one delta", () => {
    const s = new StreamSegmenter();
    const out = s.feed("A。B。C。");
    expect(out).toEqual(["A。", "B。", "C。"]);
    expect(s.pendingLength).toBe(0);
  });

  it("flushes the unfinished tail on flushTail()", () => {
    const s = new StreamSegmenter();
    s.feed("一个未结束的段落");
    expect(s.flushTail()).toBe("一个未结束的段落");
    // Idempotent: second flush returns null.
    expect(s.flushTail()).toBeNull();
  });

  it("returns null from flushTail when buffer is empty", () => {
    const s = new StreamSegmenter();
    s.feed("结束了。");
    expect(s.flushTail()).toBeNull();
  });

  it("force-flushes at the 200-char hard cap even without punctuation", () => {
    const s = new StreamSegmenter();
    const noPunct = "啊".repeat(450);
    const out = s.feed(noPunct);
    // 450 chars → two 200-char chunks + 50 leftover.
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(200);
    expect(out[1]).toHaveLength(200);
    expect(s.pendingLength).toBe(50);
  });

  it("re-joins segments back to the original stream byte-for-byte", () => {
    const s = new StreamSegmenter();
    const original = "第一段。\n第二段!第三段?最后一段没标点";
    const acc: string[] = [];
    // Feed char-by-char to mimic delta granularity.
    for (const ch of original) acc.push(...s.feed(ch));
    const tail = s.flushTail();
    if (tail) acc.push(tail);
    expect(acc.join("")).toBe(original);
  });

  it("ignores empty feed", () => {
    const s = new StreamSegmenter();
    expect(s.feed("")).toEqual([]);
    expect(s.pendingLength).toBe(0);
  });
});
