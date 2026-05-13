import { chatCompletion } from "@/lib/llm/client";
import { errorMessage, logError, logWarn } from "@/lib/observability/logger";

export type ModerationFailureMode = "allow" | "block" | "review";

function getFailureMode(): ModerationFailureMode {
  const env = process.env.MODERATION_FAILURE_MODE;
  if (env === "allow" || env === "block" || env === "review") return env;
  // Default to block in production, allow in development/test.
  return process.env.NODE_ENV === "production" ? "block" : "allow";
}

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

/**
 * Hard-blocked keyword patterns. A match is ALWAYS rejected regardless of
 * `MODERATION_FAILURE_MODE` — these are policy decisions, not LLM hints.
 * Exported so the streaming guard (P0-8) can scan SSE segments without
 * paying for a full LLM moderation call per segment.
 */
export const BLOCKED_KEYWORDS: readonly RegExp[] = [
  /制作炸弹/i,
  /制造毒品/i,
  /自杀方法/i,
  /杀人方法/i,
  /诈骗教程/i,
];

export interface BlockedKeywordMatch {
  /** The pattern that fired (useful for telemetry / debugging). */
  pattern: RegExp;
  /** UI-ready Chinese reason — kept identical to the legacy moderate path. */
  reason: string;
}

/**
 * Scan text against {@link BLOCKED_KEYWORDS}. Returns the first match or
 * null. Separated from `localKeywordCheck` so callers that want the raw
 * match (e.g. streaming guard surfacing `pattern.source` to a metric)
 * don't have to fake up a `ModerationResult`.
 */
export function matchBlockedKeywords(text: string): BlockedKeywordMatch | null {
  for (const pattern of BLOCKED_KEYWORDS) {
    if (pattern.test(text)) {
      return { pattern, reason: "内容包含违规关键词" };
    }
  }
  return null;
}

function localKeywordCheck(text: string): ModerationResult | null {
  const match = matchBlockedKeywords(text);
  if (!match) return null;
  return {
    allowed: false,
    code: "MODERATION_BLOCKED",
    reason: match.reason,
  };
}

export async function moderateContent(input: ModerationInput): Promise<ModerationResult> {
  // Local keywords are ALWAYS a hard block, regardless of failure mode.
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
  } catch (err) {
    const mode = getFailureMode();
    const message = errorMessage(err, "审核服务异常");

    if (mode === "block") {
      logError("moderation.service_failed", {
        route: input.route,
        mode,
        error: message,
      });
      return {
        allowed: false,
        code: "MODERATION_BLOCKED",
        reason: `内容审核服务暂时不可用（${message}），请稍后重试`,
      };
    }

    if (mode === "review") {
      logWarn("moderation.service_failed", {
        route: input.route,
        mode,
        error: message,
      });
      // In review mode we allow but flag; caller can log or queue for human review.
      return { allowed: true };
    }

    // mode === "allow"
    logWarn("moderation.service_failed", {
      route: input.route,
      mode,
      error: message,
    });
    return { allowed: true };
  }
}

export function stringifyForModeration(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
