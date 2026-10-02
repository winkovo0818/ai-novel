import { describe, expect, it } from "vitest";
import { parseJudgeVerdict, judgeComparablePercent, judgeMacroAverage } from "./llmJudge";
import { buildJudgePrompt, JUDGE_DIMENSION_KEYS } from "@/lib/llm/prompts/judge";
import { BibleDraftSchema } from "@/lib/validation/schemas";
import seed from "@/scripts/fixtures/eval-novels/xuanhuan-seed.json";

const bible = BibleDraftSchema.parse(seed.bible);

function verdictJson(overrides: { key?: string; remove?: string } = {}): string {
  const keys = JUDGE_DIMENSION_KEYS.filter((k) => k !== overrides.remove);
  const scores = keys.map((key) => ({ key: overrides.key && key === keys[0] ? overrides.key : key, score: 7, evidence: "引用原文一句" }));
  return JSON.stringify({ scores, summary: "窗口承接自然，线索兑现清晰。", confidence: "high" });
}

describe("parseJudgeVerdict (fail-closed)", () => {
  it("accepts a complete verdict with every dimension", () => {
    expect(parseJudgeVerdict(verdictJson())).not.toBeNull();
  });
  it("rejects a verdict missing one dimension", () => {
    expect(parseJudgeVerdict(verdictJson({ remove: "clue_payoff" }))).toBeNull();
  });
  it("rejects duplicated dimension keys", () => {
    expect(parseJudgeVerdict(verdictJson({ key: "logic" }))).toBeNull();
  });
  it("rejects non-JSON output", () => {
    expect(parseJudgeVerdict("评审结论：还不错")).toBeNull();
  });
});

describe("score aggregation", () => {
  it("computes comparable (7-dim) percent and macro (3-dim) average", () => {
    const verdict = parseJudgeVerdict(verdictJson())!;
    expect(judgeComparablePercent(verdict)).toBe(70);
    expect(judgeMacroAverage(verdict)).toBe(7);
  });
});

describe("buildJudgePrompt", () => {
  it("anchors every dimension with low/high anchors, requires evidence, and wraps chapter text", () => {
    const messages = buildJudgePrompt({
      window: [{ chapterIndex: 1, title: "第一章", content: "沈言蹲在灶前添柴。" }],
      bible,
    });
    const system = messages[0].content;
    const user = messages[1].content;
    for (const key of JUDGE_DIMENSION_KEYS) expect(system).toContain(key);
    expect(system).toContain("线索兑现");
    expect(system).toContain("局面改变");
    expect(system).toContain("阶段推进");
    expect(system).toContain("低分锚");
    expect(system).toContain("必须引用窗口正文原文片段");
    expect(user).toContain("<chapter_content>");
    expect(user).toContain("第一章");
  });
});
