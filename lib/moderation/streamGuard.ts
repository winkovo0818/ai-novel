import { matchBlockedKeywords, type BlockedKeywordMatch } from "./moderate";

/**
 * Streaming moderation guard (P0-8).
 *
 * Wraps `matchBlockedKeywords` with a sliding-window memory so banned
 * phrases that get split across two segments — e.g. `制` flushed at end
 * of one segment, `作炸弹` at the start of the next — are still caught.
 *
 * Window size = TAIL_WINDOW_CHARS. Sized to 2× the longest current
 * keyword with margin, so even adversarial inputs that try to break
 * the keyword at a boundary still scan as `tail + head ≥ keyword`.
 */

const TAIL_WINDOW_CHARS = 16;

export interface ModerationGuardResult {
  allowed: boolean;
  /** Present only when allowed=false. */
  code?: string;
  /** Present only when allowed=false. */
  reason?: string;
  /** The matched pattern's source — telemetry only, never user-facing. */
  matchedPattern?: string;
}

export class StreamModerationGuard {
  private tail = "";

  /**
   * Scan one segment. Returns `{ allowed: true }` on a clean pass, or a
   * blocked result with the standard `MODERATION_BLOCKED_INLINE` code.
   *
   * Stateful: the tail of every scanned segment is kept and prepended to
   * the next scan so cross-boundary keywords trip.
   */
  check(segment: string): ModerationGuardResult {
    const scanText = this.tail + segment;
    const hit = matchBlockedKeywords(scanText);
    if (hit) {
      return this.toBlocked(hit);
    }
    // Only advance the tail when the segment was clean — once we block,
    // the stream is going to be aborted anyway and there's no "next
    // segment" to remember anything for.
    this.tail = scanText.slice(-TAIL_WINDOW_CHARS);
    return { allowed: true };
  }

  /** Reset internal state. Useful for reusing the instance across drafts. */
  reset(): void {
    this.tail = "";
  }

  private toBlocked(hit: BlockedKeywordMatch): ModerationGuardResult {
    return {
      allowed: false,
      code: "MODERATION_BLOCKED_INLINE",
      reason: hit.reason,
      matchedPattern: hit.pattern.source,
    };
  }
}
