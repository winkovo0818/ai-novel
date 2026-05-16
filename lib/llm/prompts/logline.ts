import type { ChatMessage } from "../client";
import type { NovelProfile } from "../../validation/schemas";

interface LoglinePromptInput {
  profile: NovelProfile;
  title?: string | null;
  genreMainLabel?: string;
  genreSub?: string | null;
}

export function buildLoglinePrompt(input: LoglinePromptInput): ChatMessage[] {
  const { profile } = input;
  const title = input.title?.trim() || "（未定）";
  const genreSub = input.genreSub?.trim() || profile.genre_sub;
  return [
    {
      role: "system",
      content:
        "你是中文长篇小说策划。必须严格贴合用户给定的标题、文学领域和细分题材。只输出合法 JSON，不要 Markdown，不要注释。",
    },
    {
      role: "user",
      content: `请基于以下用户输入生成 5 条不同方向的 logline 推荐。

用户输入（优先级最高，不能偏离）：
- 作品暂定标题：${title}
- 文学领域划分：${input.genreMainLabel ?? profile.genre_main}
- 细分题材 / 风格标签：${genreSub}

档案：
- 类型：${profile.genre_main} / ${profile.genre_sub}
- 受众：${profile.audience}
- 篇幅：${profile.length}
- 调性：${profile.tone}
- 节奏：${profile.pace}
- 视角：${profile.pov}

要求：
- 每条 20-60 字
- 每条必须明显呼应作品标题、文学领域和细分题材 / 风格标签
- 不要擅自改成其他题材、职业、时代、关系类型或世界观
- 适合继续扩展成完整长篇 Bible
- 彼此差异明显，避免同义改写
- 避免色情、裸露、违法内容

输出 JSON：
{"loglines":["...","...","...","...","..."]}`,
    },
  ];
}
