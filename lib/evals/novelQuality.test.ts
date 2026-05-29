import { describe, expect, it } from "vitest";

import { evaluateNovelQuality } from "./novelQuality";
import type { BibleDraft } from "@/lib/validation/schemas";

const bible: BibleDraft = {
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
    setting_summary: "九州仙门衰落，剑魂是上古遗留的力量核心。废柴宗门靠收留弃徒苟延残喘，各大宗门暗中寻找能承载剑魂的少年。",
    factions: [
      { name: "柴饦门", alignment: "中立偏黑", role: "沈言所在宗门" },
      { name: "天代宗", alignment: "正道", role: "外部压力来源" },
    ],
    rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
    geography: ["柴饦峰", "后山裂井"],
  },
  outline: {
    volume_1: {
      name: "柴门起",
      theme: "被收留者反过来审判收留者",
      chapter_count_estimate: 8,
      chapters: [
        { index: 1, title: "雨夜火房", summary: "沈言在火房受罚，听见后山裂井中的剑魂低语，被迫面对宗门考核危机。" },
        { index: 2, title: "黑牌入手", summary: "执事逼沈言参加考核，沈言发现木牌暗藏追踪符，决定先装作不知情。" },
        { index: 3, title: "裂井剑鸣", summary: "沈言进入后山裂井，与残魂几合作，确认父母旧案并不简单。" },
        { index: 4, title: "考核初战", summary: "宗门考核开始，沈言伪装怯弱，在关键时刻用剑魂共振反制欺压者。" },
        { index: 5, title: "门主旧案", summary: "蒋阶旧案露出破绽，沈言发现父母之死与剑魂献祭有关。" },
        { index: 6, title: "暗室听审", summary: "沈言潜入暗室听见蒋阶与外宗密谈，确认自己将被作为剑魂容器献给天代宗。" },
        { index: 7, title: "反局起手", summary: "沈言利用追踪符反设陷阱，让执事替自己暴露蒋阶计划。" },
        { index: 8, title: "柴门断剑", summary: "沈言在众目睽睽下拔出断剑，斩断柴饦门控制。" },
      ],
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

function outlineSummary(index: number) {
  return bible.outline.volume_1.chapters.find((chapter) => chapter.index === index)?.summary;
}

describe("evaluateNovelQuality", () => {
  it("scores a coherent chapter series higher than a repetitive broken one", () => {
    const coherent = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "coherent",
      bible,
      chapters: [
        {
          chapterIndex: 1,
          title: "雨夜火房",
          outlineSummary: outlineSummary(1),
          content:
            "冷雨砸在火房破瓦上。沈言把湿柴塞进灶膛，腕上旧疤被火一照，像细白的线。\n\n执事踹门进来，把黑牌摔到他脚边。三日后的宗门考核，杂役也要上台。沈言没立刻捡，因为牌角有一点焦黑，像藏过符。\n\n“怕了？”执事笑。\n\n沈言低头：“我没有。”\n\n后山裂井忽然传来剑鸣。只有他听见。那声音很老，也很欠揍：“小子，装够了没有？”",
        },
        {
          chapterIndex: 2,
          title: "黑牌入手",
          outlineSummary: outlineSummary(2),
          content:
            "那枚黑牌在沈言袖中发热。不是热，是追踪符被雨水泡醒后的刺痛。\n\n他没有扔。扔了，蒋阶就知道他看懂了。于是他把黑牌贴回腰间，照旧去挑柴，照旧在执事路过时缩肩。\n\n“你真要带着它？”几在耳边冷笑。\n\n沈言把柴刀别低一点：“带着。它看我，我也看它。”\n\n夜里，符光沿着柴饦峰后山爬过去，正好指向裂井。",
        },
        {
          chapterIndex: 3,
          title: "裂井剑鸣",
          outlineSummary: outlineSummary(3),
          content:
            "后山裂井比白天更冷。沈言顺着泥沟下去，黑牌贴在掌心，一跳，一跳。\n\n几没有立刻现身，只把一句话甩出来：“你爹当年也这么蠢。”\n\n沈言停住。父亲旧案两个字压在舌根，没问出口。现在问，几不会答。于是他先谈考核：三日后借剑魂共振活下去，之后替几找重塑本体的线索。\n\n“成交？”\n\n“不成交你就死。”\n\n行。够明白。",
        },
        {
          chapterIndex: 4,
          title: "考核初战",
          outlineSummary: outlineSummary(4),
          content:
            "考核台边全是雨泥。执事故意把沈言推到第一场，黑牌在腰间亮了一下。\n\n对手拔剑时，沈言还是那副怯样，脚却踩住了符光落点。因为昨夜裂井里，几让他记住了三处共振的位置。\n\n剑锋压来。\n\n沈言退半步，袖口旧疤发烫。不是逃，是让。\n\n下一息，黑牌里的追踪符反弹回去，对手手腕一僵。沈言木剑横拍，正中膝窝。\n\n台下安静了。蒋阶第一次收起笑。",
        },
      ],
    });

    const broken = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "broken",
      bible,
      chapters: [1, 2, 3, 4].map((index) => ({
        chapterIndex: index,
        title: `第${index}章`,
        outlineSummary: outlineSummary(index),
        content:
          "沈言站在那里，仿佛命运的齿轮开始转动。这一切只是开始，真正的风暴才刚刚开始。\n\n他忽然觉得自己不想再查父母旧案了，没有任何计划，随手递给蒋阶剑魂。剑魂立刻改认蒋阶为主。\n\n无人知道接下来会发生什么。他知道，这只是开始。",
      })),
    });

    expect(coherent.overallScore).toBeGreaterThan(broken.overallScore);
    expect(coherent.metrics.find((metric) => metric.key === "logic")?.score).toBeGreaterThan(
      broken.metrics.find((metric) => metric.key === "logic")?.score ?? 0,
    );
    expect(broken.aiTraceHits.some((hit) => hit.label === "空泛意义化/宏大化" && hit.count > 0)).toBe(true);
    expect(broken.aiTraceHits.some((hit) => hit.label === "AI 高频词堆叠" && hit.count > 0)).toBe(true);
    expect(broken.riskFlags.length).toBeGreaterThan(0);
  });

  it("reports short sample risk when chapters are too small", () => {
    const report = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "short",
      bible,
      chapters: [
        { chapterIndex: 1, title: "雨夜火房", outlineSummary: outlineSummary(1), content: "沈言听见剑鸣。" },
      ],
    });

    expect(report.riskFlags).toContain("1 章样本文字少于 800 字，真实质量判断置信度有限");
    expect(report.recommendations.some((item) => item.includes("连续生成 5 章"))).toBe(true);
  });

  it("penalizes chapters that only describe mood without verifiable state changes", () => {
    const report = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "mood-only",
      bible,
      chapters: [1, 2, 3, 4].map((index) => ({
        chapterIndex: index,
        title: `第${index}章`,
        outlineSummary: outlineSummary(index),
        content:
          "夜色很沉，山风吹过柴饦峰。沈言站在廊下看雨，心里压着许多说不清的东西。雨声一阵一阵，像把过去都洗得模糊。他没有说话，旁人也没有说话。天快亮时，他仍旧站在那里，衣角湿透。",
      })),
    });
    const plotMetric = report.metrics.find((metric) => metric.key === "plot_progress");

    expect(plotMetric?.warnings.some((warning) => warning.includes("可记录状态变化"))).toBe(true);
    expect(report.recommendations.some((item) => item.includes("每章保存一个可验证状态变化"))).toBe(true);
  });

  it("recognizes concrete causal hooks instead of only rewarding connector density", () => {
    const report = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "causal-hooks",
      bible,
      chapters: [1, 2, 3, 4].map((index) => ({
        chapterIndex: index,
        title: `第${index}章`,
        outlineSummary: outlineSummary(index),
        content:
          "沈言把木牌按在袖口。因为孙奉要借木牌盯他，他不能扔。扔掉太干净，反而会暴露自己已经看懂符文。于是他决定带着木牌去前坪，先确认追踪线落在哪里。\n\n考核开始后，木牌亮起。蒋阶收起笑，往孙奉那边看了一眼。沈言记住了这条线索，也知道下一步要去裂井查清旧案。",
      })),
    });
    const logicMetric = report.metrics.find((metric) => metric.key === "logic");

    expect(logicMetric?.score).toBeGreaterThanOrEqual(8);
    expect(logicMetric?.findings.some((finding) => finding.includes("可读的因果钩"))).toBe(true);
    expect(logicMetric?.findings.some((finding) => finding.includes("目标 -> 行动 -> 结果"))).toBe(true);
  });

  it("reports dash and AI vocabulary overuse as concrete AI voice risks", () => {
    const report = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "ai-voice",
      bible,
      chapters: [1, 2, 3, 4].map((index) => ({
        chapterIndex: index,
        title: `第${index}章`,
        outlineSummary: outlineSummary(index),
        content:
          "沈言慢慢抬头，似乎听见裂井里传来声音——那声音仿佛贴着骨头。他缓缓握紧黑牌，因为符光亮了，所以他必须去后山。黑牌烫了一下，裂纹露出新的线索。沈言慢慢把它藏进袖口——门外有人停步。",
      })),
    });
    const aiVoice = report.metrics.find((metric) => metric.key === "ai_voice");

    expect(aiVoice?.warnings.some((warning) => warning.includes("破折号"))).toBe(true);
    expect(aiVoice?.warnings.some((warning) => warning.includes("AI 高频词"))).toBe(true);
  });

  it("deducts AI voice score and aggregates raw cleanup hits when raw output was AI-heavy", () => {
    const report = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "cleanup",
      bible,
      chapters: [1, 2, 3].map((index) => ({
        chapterIndex: index,
        title: `第${index}章`,
        outlineSummary: outlineSummary(index),
        content: "沈言握紧黑牌，裂井里传来声音。他必须去后山，因为符光亮了，所以他动身了。",
        rawCleanupHits: [
          { id: "vocab_slowly", label: "AI 副词（慢慢）", category: "ai_signature", count: 4 },
          { id: "dash_overuse", label: "旁白破折号", category: "ai_signature", count: 3 },
          { id: "ws_newline", label: "多余空行", category: "hygiene", count: 9 },
        ],
      })),
    });
    const aiVoice = report.metrics.find((metric) => metric.key === "ai_voice");

    // 7 ai_signature hits/chapter (4 + 3); hygiene (9) is ignored.
    expect(aiVoice?.warnings.some((w) => w.includes("清洗前 AI 签名规则平均每章命中 7.0 条"))).toBe(true);
    // Aggregated across 3 chapters, ai_signature only, sorted by count desc.
    expect(report.rawCleanupHits.map((h) => h.id)).toEqual(["vocab_slowly", "dash_overuse"]);
    expect(report.rawCleanupHits.find((h) => h.id === "vocab_slowly")?.count).toBe(12);
  });

  it("omits the cleanup deduction when raw cleanup hits are not provided", () => {
    const report = evaluateNovelQuality({
      generatedAt: "2026-05-28T00:00:00.000Z",
      fixtureId: "cleanup-absent",
      bible,
      chapters: [1, 2, 3].map((index) => ({
        chapterIndex: index,
        title: `第${index}章`,
        outlineSummary: outlineSummary(index),
        content: "沈言握紧黑牌，裂井里传来声音。他必须去后山，因为符光亮了，所以他动身了。",
      })),
    });
    const aiVoice = report.metrics.find((metric) => metric.key === "ai_voice");

    expect(aiVoice?.warnings.some((w) => w.includes("清洗前 AI 签名"))).toBe(false);
    expect(aiVoice?.findings.some((f) => f.includes("清洗前 AI 签名"))).toBe(false);
    expect(report.rawCleanupHits).toEqual([]);
  });
});
