import { chatCompletion } from "@/lib/llm/client";

export interface ModerationResult {
  allowed: boolean;
  code?: "MODERATION_BLOCKED";
  reason?: string;
}

export interface ModerationInput {
  route: string;
  text: string;
}

const MODERATION_PROMPT = `你是一个内容安全审核员。判断以下文本是否包含违法违规内容，包括但不限于：
- 暴力、恐怖主义、煽动仇恨
- 色情、淫秽内容
- 政治敏感、颠覆国家政权
- 诈骗、赌博、毒品
- 人身攻击、歧视

回复 JSON 格式：
- 安全内容：{"allowed": true}
- 违规内容：{"allowed": false, "reason": "简要说明违规类型"}

仅回复 JSON，不要其他内容。`;

const BLOCKED_KEYWORDS = [
  /制作炸弹/i,
  /制造毒品/i,
  /自杀方法/i,
  /杀人方法/i,
  /诈骗教程/i,
];

function localKeywordCheck(text: string): ModerationResult | null {
  for (const pattern of BLOCKED_KEYWORDS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        code: "MODERATION_BLOCKED",
        reason: "内容包含违规关键词",
      };
    }
  }
  return null;
}

export async function moderateContent(input: ModerationInput): Promise<ModerationResult> {
  const localResult = localKeywordCheck(input.text);
  if (localResult) return localResult;

  try {
    const result = await chatCompletion({
      route: `${input.route}:moderation`,
      messages: [
        { role: "system", content: MODERATION_PROMPT },
        { role: "user", content: input.text },
      ],
      temperature: 0,
      responseFormat: "json_object",
      timeoutMs: 10_000,
    });

    const parsed = JSON.parse(result.content) as {
      allowed?: boolean;
      reason?: string;
    };

    if (parsed.allowed === false) {
      return {
        allowed: false,
        code: "MODERATION_BLOCKED",
        reason: parsed.reason ?? "内容审核未通过",
      };
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

export function stringifyForModeration(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
