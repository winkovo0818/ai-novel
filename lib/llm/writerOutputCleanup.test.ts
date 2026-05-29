import { describe, expect, it } from "vitest";

import {
  aiSignatureHitTotal,
  cleanupWriterOutput,
  cleanupWriterOutputSegment,
  cleanupWriterOutputWithReport,
} from "./writerOutputCleanup";
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

  it("reports which cleanup rules fired and produces identical text to cleanupWriterOutput", () => {
    const raw = "## 第三章\n\n沈言慢慢抬头——**井外人**似乎就在门外。接下来他没有扔牌。";
    const { text, hits } = cleanupWriterOutputWithReport(raw);

    expect(text).toBe(cleanupWriterOutput(raw));
    const firedIds = hits.map((h) => h.id);
    expect(firedIds).toEqual(expect.arrayContaining(["heading", "bold_markdown", "dash_overuse", "signposting", "vocab_slowly", "vocab_seem"]));
    for (const hit of hits) {
      expect(hit.count).toBeGreaterThan(0);
    }
  });

  it("counts multiple occurrences of the same rule", () => {
    const { hits } = cleanupWriterOutputWithReport("他慢慢走，又慢慢停下，还是慢慢回头。");
    const slowly = hits.find((h) => h.id === "vocab_slowly");
    expect(slowly?.count).toBe(3);
  });

  it("aiSignatureHitTotal counts only ai_signature rules, not hygiene normalization", () => {
    // 似乎 + 仿佛 = 2 ai_signature hits; trailing duplicate punctuation is hygiene-only.
    const text = "他似乎听见了，仿佛有人在叫。。。";
    expect(aiSignatureHitTotal(text)).toBe(2);

    const hygieneOnly = "他听见了。。。  \n\n\n";
    expect(aiSignatureHitTotal(hygieneOnly)).toBe(0);
  });

});
