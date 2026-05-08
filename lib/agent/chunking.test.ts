import { describe, expect, it } from "vitest";
import { chunkChapterContent } from "./chunking";

describe("chunkChapterContent", () => {
  it("splits content into typed chunks", () => {
    const paragraph = `第1段。主角站在城门口，望着远处的山脉。风很大，吹得他的披风猎猎作响。他深吸一口气，迈出了坚定的步伐。前方是未知的旅程，但他已经做好了准备。这条路通往传说中的遗迹，据说那里藏着能够改变世界命运的力量。主角握紧了手中的剑，眼神坚定。他知道，从这一刻起，自己的人生将彻底改变。无论前方有多少艰难险阻，他都不会退缩。`;
    const content = Array.from({ length: 10 }, () => paragraph).join("\n\n");

    const chunks = chunkChapterContent(content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThanOrEqual(80);
      expect(["scene", "dialogue", "character_fact", "world_rule", "plot_thread", "summary"]).toContain(chunk.chunk_type);
    }
  });

  it("returns empty array for short content", () => {
    const chunks = chunkChapterContent("太短了。");
    expect(chunks).toHaveLength(0);
  });

  it("classifies world rules", () => {
    const paragraph = `世界规则：在这个世界里，魔法需要消耗精神力。强者不能随意屠杀弱者。违反规则者将受到天谴。所有人都必须遵守这一铁律。魔法师在使用高级法术时，需要经过严格的考核，否则将被剥夺施法能力。这个世界有一套完整的魔法体系，从初级学徒到传奇法师，每个等级都有明确的划分标准和晋升要求。`;
    const content = Array.from({ length: 5 }, () => paragraph).join("\n\n");
    const chunks = chunkChapterContent(content);
    const ruleChunks = chunks.filter((c) => c.chunk_type === "world_rule");
    expect(ruleChunks.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies plot threads", () => {
    const paragraph = `伏笔：城门口的石碑上刻着古老的文字，似乎隐藏着某个秘密。主角决定调查这个谜团，这将改变他的命运。碑文记载了一个古老的预言，当星辰排列成特定形状时，沉睡的远古魔神将会苏醒。主角隐约感觉到，自己的身世与这个预言有着某种神秘的联系，而解开这个谜团的关键，就藏在遗迹的最深处。`;
    const content = Array.from({ length: 5 }, () => paragraph).join("\n\n");
    const chunks = chunkChapterContent(content);
    const threadChunks = chunks.filter((c) => c.chunk_type === "plot_thread");
    expect(threadChunks.length).toBeGreaterThanOrEqual(1);
  });
});
