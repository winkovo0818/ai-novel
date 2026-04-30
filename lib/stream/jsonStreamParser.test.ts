import { describe, expect, it } from "vitest";
import {
  collectBibleEvents,
  createBibleEventCursor,
  tryParseBibleDraft,
} from "./jsonStreamParser";
import type { BibleDraft } from "@/lib/validation/schemas";

function validDraft(): BibleDraft {
  const chapters = Array.from({ length: 8 }, (_, i) => ({
    index: i + 1,
    title: `第${i + 1}章`,
    summary: "这是一段足够长度的章节梗概，用来覆盖剧情推进、伏笔和冲突。",
  }));

  return {
    meta: {
      suggested_title: "逆魂纪",
      alternative_titles: ["剑魂歌", "裁逆者", "柴门主"],
    },
    characters: [
      {
        role: "protagonist",
        name: "沈言",
        age: 16,
        appearance: "平头讷讨，腕有旧疤",
        personality: "表面懦弱实则冷静记仇",
        catchphrase: "我没有，你别乱说。",
        abilities: ["琉璃体质"],
        goals: "短期活下去，长期查明身世",
        motivation: "被废柴宗门收留多年，觉醒剑魂后想挣脱控制。",
        secrets: ["体内封着上古剑魂"],
        relations: [],
      },
      {
        role: "mentor",
        name: "几",
        age: "上古",
        appearance: "残魂如青烟",
        personality: "吝啬嘴硬心软",
        catchphrase: "你这资质，老夫头疼。",
        abilities: ["剑道残识"],
        goals: "短期保住主角，长期重塑剑魂",
        motivation: "借主角体质避开追杀，同时弥补旧错。",
        secrets: ["曾参与上古剑祸"],
        relations: ["沈言的导师"],
      },
      {
        role: "antagonist",
        name: "蒋阶",
        age: 42,
        appearance: "白袍温和，指节发黑",
        personality: "外宽内狠",
        catchphrase: "本门同心，何出此言。",
        abilities: ["驭人心术"],
        goals: "短期夺剑魂，长期复兴宗门",
        motivation: "宗门衰败多年，他相信牺牲一人能换全门生机。",
        secrets: ["知道沈言父母死因"],
        relations: ["沈言名义上的门主"],
      },
    ],
    world: {
      setting_summary:
        "九州碎裂后仙门式微，剑魂是上古遗留的力量核心。废柴宗门靠收留弃徒苟延残喘，各大宗门暗中寻找能承载剑魂的少年。",
      factions: [
        { name: "柴饦门", alignment: "中立", role: "主角所在宗门" },
        { name: "天代宗", alignment: "正道", role: "外部压力来源" },
      ],
      rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
      geography: ["柴饦峰", "雨宗古道"],
    },
    outline: {
      volume_1: {
        name: "柴门起",
        theme: "被收留者反过来审判收留者",
        chapter_count_estimate: 8,
        chapters,
      },
    },
    first_chapter_beats: [
      { beat: 1, scene: "雨夜火房", purpose: "建立处境" },
      { beat: 2, scene: "门规责罚", purpose: "制造压迫" },
      { beat: 3, scene: "后山拾剑", purpose: "引出剑魂" },
      { beat: 4, scene: "剑魂低语", purpose: "制造悬念" },
      { beat: 5, scene: "门主召见", purpose: "抛出冲突" },
    ],
  };
}

describe("tryParseBibleDraft", () => {
  it("returns null for incomplete JSON", () => {
    expect(tryParseBibleDraft('{"meta":')).toBeNull();
  });

  it("parses a complete valid Bible draft", () => {
    const draft = validDraft();
    expect(tryParseBibleDraft(JSON.stringify(draft))?.meta.suggested_title).toBe(
      "逆魂纪",
    );
  });
});

describe("collectBibleEvents", () => {
  it("emits each complete node once", () => {
    const draft = validDraft();
    const cursor = createBibleEventCursor();

    const first = collectBibleEvents(draft, cursor);
    const second = collectBibleEvents(draft, cursor);

    expect(first.map((e) => e.event)).toEqual([
      "meta",
      "character",
      "character",
      "character",
      "world",
      "outline_chapter",
      "outline_chapter",
      "outline_chapter",
      "outline_chapter",
      "outline_chapter",
      "outline_chapter",
      "outline_chapter",
      "outline_chapter",
      "first_chapter_beat",
      "first_chapter_beat",
      "first_chapter_beat",
      "first_chapter_beat",
      "first_chapter_beat",
    ]);
    expect(second).toEqual([]);
  });
});
