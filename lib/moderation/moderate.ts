export interface ModerationResult {
  allowed: boolean;
  code?: "MODERATION_BLOCKED";
  reason?: string;
}

export interface ModerationInput {
  route: string;
  text: string;
}

/**
 * MVP 内容审核 hook。
 * 当前默认放行，只保留稳定接口，后续替换为真实审核服务时不需要改业务路由。
 */
export async function moderateContent(input: ModerationInput): Promise<ModerationResult> {
  void input;
  return { allowed: true };
}

export function stringifyForModeration(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
