import type { ChatMessage } from "../client";
import type { NovelProfile } from "../../validation/schemas";

export function buildLoglinePrompt(profile: NovelProfile): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是中文长篇小说策划。只输出合法 JSON，不要 Markdown，不要注释。",
    },
    {
      role: "user",
      content: `请基于以下小说档案生成 5 条不同方向的 logline 推荐。

档案：
- 类型：${profile.genre_main} / ${profile.genre_sub}
- 受众：${profile.audience}
- 篇幅：${profile.length}
- 调性：${profile.tone}
- 节奏：${profile.pace}
- 视角：${profile.pov}

要求：
- 每条 20-60 字
- 适合继续扩展成完整长篇 Bible
- 彼此差异明显，避免同义改写
- 避免色情、裸露、违法内容

输出 JSON：
{"loglines":["...","...","...","...","..."]}`,
    },
  ];
}
