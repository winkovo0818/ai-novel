const ERROR_MESSAGES: Record<string, string> = {
  LLM_TIMEOUT: "AI 响应超时，正在自动重试…",
  EMPTY_REVISION: "AI 未能生成有效内容，请尝试换一种描述方式",
  MODERATION_HIT: "内容可能包含违规信息，已跳过，请修改后重试",
  RATE_LIMITED: "请求过于频繁，请稍等片刻再试",
  QUOTA_EXCEEDED: "本月用量已达上限",
  INVALID_INPUT: "请求参数有误，请刷新页面后重试",
  NOVEL_NOT_FOUND: "作品未找到，可能已被删除",
  UNAUTHORIZED: "登录已过期，请重新登录",
  INTERNAL: "服务器繁忙，请稍后重试",
};

/**
 * 将 API 错误码翻译为面向用户的中文提示。
 * 如果找不到对应的错误码，回退到原始 message 或通用提示。
 */
export function humanizeError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: string; message?: string };
    if (e.code && ERROR_MESSAGES[e.code]) {
      return ERROR_MESSAGES[e.code];
    }
    if (e.message) return e.message;
  }
  return "操作失败，请重试";
}
