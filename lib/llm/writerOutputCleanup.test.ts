import { describe, expect, it } from "vitest";

import { cleanupWriterOutput, cleanupWriterOutputSegment } from "./writerOutputCleanup";
import { collectAiWritingTraceHits } from "./prompts/humanStyle";

describe("writerOutputCleanup", () => {
  it("removes hard AI-writing artifacts without dropping story facts", () => {
    const cleaned = cleanupWriterOutput(
      "## 第三章\n\n沈言慢慢抬头——**井外人**似乎就在门外。接下来他没有扔牌，不是因为害怕，而是因为孙奉会知道。",
    );
    const traceHits = collectAiWritingTraceHits(cleaned);

    expect(cleaned).toContain("第三章");
    expect(cleaned).toContain("沈言抬头");
    expect(cleaned).toContain("井外人");
    expect(cleaned).toContain("孙奉会知道");
    expect(cleaned).not.toContain("**");
    expect(cleaned).not.toContain("——");
    expect(cleaned).not.toContain("接下来");
    expect(cleaned).not.toContain("慢慢");
    expect(cleaned).not.toContain("似乎");
    expect(traceHits.some((hit) => hit.id === "dash_overuse")).toBe(false);
    expect(traceHits.some((hit) => hit.id === "bold_markdown")).toBe(false);
    expect(traceHits.some((hit) => hit.id === "signposting")).toBe(false);
  });

  it("keeps streaming segment whitespace stable", () => {
    expect(cleanupWriterOutputSegment("“我以为——”他顿住。\n")).toBe("“我以为。”他顿住。\n");
  });
});
