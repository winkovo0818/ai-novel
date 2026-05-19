import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/llm/client";
import { errorMessage, logError, logEvent, logWarn, type LogLevel } from "@/lib/observability/logger";

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
  userId?: string | null;
  novelId?: string | null;
}

interface ModerationDecisionFields {
  source: "local_keyword" | "llm" | "failure_mode";
  action: "block" | "allow" | "review";
  outcome: "blocked" | "allowed";
  mode?: ModerationFailureMode;
  code?: "MODERATION_BLOCKED";
  reason?: string;
  matched_pattern?: string;
  error?: string;
}

const MODERATION_PROMPT = `你是一个内容安全审核员。判断以下文本是否包含违法违规内容，包括但不限于：
- 暴力、恐怖主义、煽动仇恨
- 色情、淫秽内容
- 政治敏感、颠覆国家政权
- 诈骗、赌博、毒品
- 人身攻击、歧视

重要：如果文本明显是小说、故事、剧本等虚构创作内容，其中的暴力、冲突、犯罪描写属于叙事需要，不应判定为违规。只有在文本明确教唆违法犯罪、传播极端思想、或涉及真实人物诽谤时才应阻止。

回复 JSON 格式：
- 安全内容：{"allowed": true}
- 违规内容：{"allowed": false, "reason": "简要说明违规类型"}

仅回复 JSON，不要其他内容。`;

const MODERATION_AUDIT_RETENTION_MS = Number(
  process.env.MODERATION_AUDIT_RETENTION_MS ?? 90 * 24 * 60 * 60 * 1000,
);

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

export async function moderateContent(input: ModerationInput): Promise<ModerationResult> {
  // Local keywords are ALWAYS a hard block, regardless of failure mode.
  const localHit = matchBlockedKeywords(input.text);
  if (localHit) {
    await recordModerationDecision("warn", input, {
      source: "local_keyword",
      action: "block",
      outcome: "blocked",
      code: "MODERATION_BLOCKED",
      matched_pattern: localHit.pattern.source,
    });
    return {
      allowed: false,
      code: "MODERATION_BLOCKED",
      reason: localHit.reason,
    };
  }

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
      await recordModerationDecision("warn", input, {
        source: "llm",
        action: "block",
        outcome: "blocked",
        code: "MODERATION_BLOCKED",
        reason: parsed.reason ?? "内容审核未通过",
      });
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
      await recordModerationDecision("error", input, {
        source: "failure_mode",
        action: "block",
        outcome: "blocked",
        mode,
        code: "MODERATION_BLOCKED",
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
      await recordModerationDecision("warn", input, {
        source: "failure_mode",
        action: "review",
        outcome: "allowed",
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
    await recordModerationDecision("warn", input, {
      source: "failure_mode",
      action: "allow",
      outcome: "allowed",
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

export async function cleanupExpiredModerationAudits(): Promise<number> {
  const cutoff = new Date(Date.now() - MODERATION_AUDIT_RETENTION_MS);
  const result = await prisma.moderationAudit.deleteMany({
    where: {
      created_at: { lt: cutoff },
    },
  });
  return result.count;
}

async function recordModerationDecision(
  level: LogLevel,
  input: ModerationInput,
  decision: ModerationDecisionFields,
): Promise<void> {
  const fields = {
    route: input.route,
    ...decision,
  };

  logEvent(level, "moderation.decision", fields);

  try {
    const auditClient = (
      prisma as typeof prisma & {
        moderationAudit?: {
          create: typeof prisma.moderationAudit.create;
        };
      }
    ).moderationAudit;
    if (!auditClient) return;

    await auditClient.create({
      data: {
        user_id: input.userId ?? null,
        novel_id: input.novelId ?? null,
        route: input.route,
        source: decision.source,
        action: decision.action,
        outcome: decision.outcome,
        mode: decision.mode ?? null,
        code: decision.code ?? null,
        reason: decision.reason ?? null,
        matched_pattern: decision.matched_pattern ?? null,
        text_hash: createHash("sha256").update(input.text).digest("hex"),
        text_chars: input.text.length,
      },
    });
  } catch (err) {
    logWarn("moderation.audit_persist_failed", {
      route: input.route,
      source: decision.source,
      action: decision.action,
      error: errorMessage(err),
    });
  }
}
