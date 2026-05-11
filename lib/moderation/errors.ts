/**
 * Thrown by the streaming moderation guard (P0-8) when a banned keyword
 * is matched inside an SSE chapter-draft. Carries the structured error
 * code that the SSE handler emits to the client and persists onto the
 * DraftSession row.
 *
 * Kept narrow on purpose — the only callers are `StreamModerationGuard`
 * (raises) and the `/draft` route's onDelta closure (catches via
 * `instanceof`). Promoting a string into an Error class makes the
 * catch-branch matching type-safe and lets us thread the `code` through
 * to telemetry without parsing message text.
 */
export class ModerationBlockError extends Error {
  readonly code: string;
  readonly reason: string;

  constructor(reason: string, code = "MODERATION_BLOCKED_INLINE") {
    super(reason);
    this.name = "ModerationBlockError";
    this.code = code;
    this.reason = reason;
  }
}
