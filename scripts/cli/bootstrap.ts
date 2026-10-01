import { BibleDraftSchema, ChapterSchema, buildDefaultProfile } from "@/lib/validation/schemas";
import { buildBiblePrompt } from "@/lib/llm/prompts/bible";
import { z } from "zod";
import type { CliConfig } from "./types";
import type { BibleData, OutlineChapter, UsageRecord } from "./types";
import { cliChatCompletionStream } from "./llm";

const OUTLINE_SYSTEM = `你是专业的小说大纲设计师。根据已生成的叙事圣经，为指定数量的章节设计大纲。

请以严格的 JSON 数组格式返回，每章包含 index（从1开始）、title（章节标题）、summary（一句话摘要）。不要包含其他文本。`;

export async function bootstrapNovel(
  config: CliConfig,
  theme: string,
  logline: string,
  totalChapters: number,
  onProgress?: (label: string, text: string) => void,
  onUsage?: (record: UsageRecord) => void,
): Promise<{ bible: BibleData; outline: OutlineChapter[] }> {
  onProgress?.("Bible", "正在生成叙事圣经…");

  let spent = 0;
  const account = (title: string, cost: number) => {
    spent += cost;
    onUsage?.({ chapter: 0, title, draft_cost: cost, critic_cost: 0, revise_cost: 0, state_diff_cost: 0, total_cost: cost });
  };
  // 1. Generate Bible (streaming)
  let bibleContent = "";
  await cliChatCompletionStream(
    config,
    {
      messages: buildBiblePrompt({ logline, profile: buildDefaultProfile("web", theme, logline), totalChapters: Math.min(8, totalChapters) }),
      temperature: 0.7,
      timeoutMs: 120_000,
    },
    {
      onToken(token) {
        bibleContent += token; process.stderr.write(token);
        onProgress?.("Bible", bibleContent);
      },
      onDone(result) { account("Bible", result.costCny); },
      onError(err) {
        throw err;
      },
    },
  );

  let bible: BibleData;
  try {
    bible = BibleDraftSchema.parse(JSON.parse(extractJson(bibleContent)));
    onProgress?.("Bible", `✅ 世界观完成 · ${bible.characters.length} 位角色`);
  } catch (err) {
    throw new Error(`Bible 解析失败: ${err instanceof Error ? err.message : err}`);
  }

  if (spent >= config.generation.cost_cap_cny) throw new Error("生成费用达到上限");
  // 2. Generate Outline
  console.log(`\n📋 正在生成 ${totalChapters} 章大纲 …`);

  let outlineContent = "";
  await cliChatCompletionStream(config, {
    messages: [
      { role: "system", content: OUTLINE_SYSTEM },
      {
        role: "user",
        content: `叙事圣经：
书名：${bible.meta.suggested_title}
世界观：${bible.world.setting_summary}
角色：${bible.characters.map((c) => `${c.name}（${c.role}）：${c.personality}`).join("\n")}
目标章数：${totalChapters}

请生成全部 ${totalChapters} 章的大纲。`,
      },
    ],
    temperature: 0.7,
    maxTokens: 8192,
    timeoutMs: 120_000,
  }, {
    onToken(token) { outlineContent += token; process.stderr.write(token); onProgress?.("Outline", outlineContent); },
    onDone(result) { account("Outline", result.costCny); },
    onError(err) { throw err; },
  });

  let outline: OutlineChapter[];
  try {
    const parsed = JSON.parse(extractJson(outlineContent));
    if (!Array.isArray(parsed)) throw new Error("大纲不是数组");
    outline = z.array(ChapterSchema).parse(parsed);
    if (outline.length !== totalChapters || outline.some((c, i) => c.index !== i + 1)) {
      throw new Error("大纲必须完整覆盖目标章节，且序号连续");
    }
    // Validate
    for (let i = 0; i < outline.length; i++) {
      if (!outline[i].index || !outline[i].title) {
        throw new Error(`第 ${i + 1} 项大纲缺少 index 或 title`);
      }
    }
    console.log(`  ✅ ${outline.length} 章大纲生成完成`);
  } catch (err) {
    throw new Error(`大纲解析失败: ${err instanceof Error ? err.message : err}`);
  }

  bible = BibleDraftSchema.parse({ ...bible, outline: { volume_1: { ...bible.outline.volume_1, chapters: outline, chapter_count_estimate: totalChapters } } });
  return { bible, outline };
}

/**
 * Extract JSON from LLM response (handles code fences).
 */
function extractJson(text: string): string {
  let cleaned = text.trim();
  // Remove code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // Find the first '{' or '[' and last '}' or ']'
  const start = Math.min(
    cleaned.indexOf("{") === -1 ? Infinity : cleaned.indexOf("{"),
    cleaned.indexOf("[") === -1 ? Infinity : cleaned.indexOf("["),
  );
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start === Infinity || end === -1) return cleaned;
  return cleaned.slice(start, end + 1);
}
