/**
 * 跨章高频表达检测（G4）。
 *
 * 第二次人工通读实测：标志性意象「三下一停」在 30 章出现 43 次，且与
 * 「腕疤跳了」「收好东西」等高频组合反复叠加，章节收尾读感趋同。重复意象
 * 只有在每次变化都对应实质变化时才有辨识度，否则退化为惯用的紧张提示。
 *
 * 用途：
 *  - 写手 prompt 注入（预防）：从近 10 章找出过度重复的表达，禁止原样复用；
 *  - 质量门 ai_voice 维度（检测）：窗口内跨章共享的高频表达扣分告警。
 */

export interface OverusedPhrase {
  phrase: string;
  count: number;
  chapters: number;
}

/** 通用功能短语白名单：出现再多也不算「标志性重复」。 */
const STOP_PHRASES = new Set([
  "看了一眼", "没有说话", "没有回答", "不知道", "的时候了", "什么都没", "看不出来",
  "停了一下", "停了一会", "过了一会", "深吸一口气", "吸了口气", "闭上了眼", "睁开眼",
  "低下头", "抬起头", "点了点头", "摇了摇头", "转过身", "站起来", "坐下来", "走过去",
  "回到房里", "回到屋里", "门外有人", "门外传来", "手指收紧", "眉头皱起",
]);

/** 抽取一段文本中的 CJK 连续片段（去标点/空白/ASCII），n-gram 在片段内滑动。 */
function cjkRuns(text: string): string[] {
  return text.match(/[\u4e00-\u9fff]+/g) ?? [];
}

function ngrams(run: string, min: number, max: number): string[] {
  const grams: string[] = [];
  for (let len = min; len <= max && len <= run.length; len++) {
    for (let i = 0; i + len <= run.length; i++) grams.push(run.slice(i, i + len));
  }
  return grams;
}

export interface FindOverusedPhrasesOptions {
  /** n-gram 长度范围。默认 4–6：短于 4 命中功能词，长于 6 难以重复。 */
  minLen?: number;
  maxLen?: number;
  /** 总出现次数阈值（默认 3）。 */
  minCount?: number;
  /** 至少出现在几个不同章节（默认 2，跨章才算「惯用」）。 */
  minChapters?: number;
  /** 最多返回几条（默认 8，按次数降序；子串被更长短语覆盖时去重）。 */
  limit?: number;
}

export function findOverusedPhrases(
  chapters: ReadonlyArray<{ chapter_index: number; content: string }>,
  options: FindOverusedPhrasesOptions = {},
): OverusedPhrase[] {
  const { minLen = 4, maxLen = 6, minCount = 3, minChapters = 2, limit = 8 } = options;
  const counts = new Map<string, { count: number; chapterSet: Set<number> }>();
  for (const chapter of chapters) {
    if (!chapter.content?.trim()) continue;
    const seen = new Set<string>();
    for (const run of cjkRuns(chapter.content)) {
      for (const gram of ngrams(run, minLen, maxLen)) {
        if (STOP_PHRASES.has(gram)) continue;
        seen.add(gram);
      }
    }
    for (const gram of seen) {
      const entry = counts.get(gram) ?? { count: 0, chapterSet: new Set<number>() };
      entry.count += 1;
      entry.chapterSet.add(chapter.chapter_index);
      counts.set(gram, entry);
    }
  }
  // 注：count 语义为「出现该短语的章节数」（每章去重后计数），跨章惯性正好是
  // 要抓的信号；单章内连续重复由 ai_voice 的句首重复检查负责。
  const qualified = [...counts.entries()]
    .filter(([, v]) => v.count >= Math.max(minCount, minChapters))
    .map(([phrase, v]) => ({ phrase, count: v.count, chapters: v.chapterSet.size }))
    .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length);
  const kept: OverusedPhrase[] = [];
  for (const item of qualified) {
    if (kept.some((k) => k.phrase.includes(item.phrase) || item.phrase.includes(k.phrase))) continue;
    kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
}
