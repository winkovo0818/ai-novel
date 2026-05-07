import type { ChatMessage } from "../client";
import type { NovelProfile } from "../../validation/schemas";

export function buildQuestionsPrompt(input: {
  logline: string;
  profile: NovelProfile;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是中文长篇小说策划，擅长用选择题快速锁定故事方向。只输出合法 JSON，不要 Markdown，不要注释。",
    },
    {
      role: "user",
      content: `请基于用户 logline 生成 3-5 道反向追问题，帮助后续生成小说 Bible。

logline：${input.logline}

档案：
- 类型：${input.profile.genre_main} / ${input.profile.genre_sub}
- 受众：${input.profile.audience}
- 篇幅：${input.profile.length}
- 调性：${input.profile.tone}
- 节奏：${input.profile.pace}
- 视角：${input.profile.pov}

要求：
- 每题 key 必须是英文 snake_case
- type 只能是 single 或 multi
- options 必须正好 4 个
- recommended_index 是 0-3 的整数
- 问题优先覆盖：主角性格、核心冲突、反派/压力来源、开局节奏、主要爽点
- 避免色情、裸露、违法内容

输出 JSON：
{"questions":[{"key":"protagonist_personality","question":"主角的性格底色是？","type":"single","options":["冷静隐忍","热血莽撞","腹黑算计","善良执拗"],"recommended_index":0}]}`,
    },
  ];
}
