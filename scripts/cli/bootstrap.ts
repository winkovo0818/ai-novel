import type { CliConfig } from "./types";
import type { BibleData, OutlineChapter } from "./types";
import { cliChatCompletionStream } from "./llm";

const BIBLE_SYSTEM = `你是专业的小说设定设计师。根据用户提供的题材和灵感，生成一份完整的叙事圣经（Bible），包含：

1. 世界观设定：时代、地理、势力、规则
2. 角色设计：主角、导师、反派、配角，每个角色包含姓名、年龄、性格、目标、能力、关系
3. 建议书名

请以严格的 JSON 格式返回，不要包含其他文本。格式如下：
{
  "meta": { "suggested_title": "书名", "alternative_titles": ["备选1", "备选2"] },
  "characters": [
    { "role": "protagonist", "name": "主角名", "age": 年龄, "personality": "性格", "goals": "目标", "abilities": ["能力1", "能力2"], "relations": ["关系1"] }
  ],
  "world": {
    "setting_summary": "世界观描述",
    "rules": ["规则1", "规则2"],
    "factions": [{"name": "势力名", "alignment": "正/邪/中立", "role": "描述"}]
  }
}`;

const OUTLINE_SYSTEM = `你是专业的小说大纲设计师。根据已生成的叙事圣经，为指定数量的章节设计大纲。

请以严格的 JSON 数组格式返回，每章包含 index（从1开始）、title（章节标题）、summary（一句话摘要）。不要包含其他文本。`;

export async function bootstrapNovel(
  config: CliConfig,
  theme: string,
  logline: string,
  totalChapters: number,
  onProgress?: (label: string, text: string) => void,
): Promise<{ bible: BibleData; outline: OutlineChapter[] }> {
  onProgress?.("Bible", "正在生成叙事圣经…");

  // 1. Generate Bible (streaming)
  let bibleContent = "";
  await cliChatCompletionStream(
    config,
    {
      messages: [
        { role: "system", content: BIBLE_SYSTEM },
        {
          role: "user",
          content: `题材：${theme}\n核心冲突：${logline}\n目标章数：${totalChapters} 章\n\n请生成完整的叙事圣经。`,
        },
      ],
      temperature: 0.7,
      timeoutMs: 120_000,
    },
    {
      onToken(token) {
        bibleContent += token; process.stderr.write(token);
        onProgress?.("Bible", bibleContent);
      },
      onDone() {
        // handled below
      },
      onError(err) {
        throw err;
      },
    },
  );

  let bible: BibleData;
  try {
    const raw = JSON.parse(extractJson(bibleContent));
    bible = raw as unknown as BibleData;
    if (!bible.characters) bible.characters = [];
    if (!bible.world) bible.world = { setting_summary: "", rules: [] };
    if (!bible.meta) bible.meta = { suggested_title: "未命名作品", alternative_titles: [] };
    onProgress?.("Bible", `✅ 世界观完成 · ${bible.characters.length} 位角色`);
  } catch (err) {
    throw new Error(`Bible 解析失败: ${err instanceof Error ? err.message : err}`);
  }

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
    onDone() {},
    onError(err) { throw err; },
  });

  let outline: OutlineChapter[];
  try {
    const parsed = JSON.parse(extractJson(outlineContent));
    if (!Array.isArray(parsed)) throw new Error("大纲不是数组");
    outline = parsed as OutlineChapter[];
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
