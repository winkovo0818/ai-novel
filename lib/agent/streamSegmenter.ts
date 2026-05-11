/**
 * Streaming segmenter for SSE chapter drafts (P0-8).
 *
 * Consumes LLM deltas one at a time and emits "segments" — chunks of
 * text bounded by sentence-ending punctuation, newlines, or a hard
 * length cap. The segments are the unit the moderation guard scans
 * before each chunk is forwarded to the client, so that a banned phrase
 * never reaches the user's screen.
 *
 * Why a hard cap (200 chars) on top of punctuation:
 *   the LLM occasionally produces long stretches without `\n / 。/ ! / ?`
 *   (descriptive prose, code blocks, lists). Without the cap, a banned
 *   keyword in the middle of such a stretch would never be checked
 *   until end-of-stream, defeating the purpose. 200 keeps the worst-
 *   case "violation already streamed" window small while still letting
 *   most natural sentences pass through whole.
 */

const SEGMENT_BOUNDARY = /[\n。!?！？]/;
const HARD_CAP_CHARS = 200;

export class StreamSegmenter {
  private pending = "";

  /**
   * Feed one delta. Returns the segments that became complete as a result.
   *
   * A segment ends at the first occurrence of {@link SEGMENT_BOUNDARY} or
   * when the accumulated buffer reaches {@link HARD_CAP_CHARS}. The
   * trailing boundary character is included in the emitted segment so the
   * full token sequence is preserved when segments are re-joined.
   */
  feed(delta: string): string[] {
    if (!delta) return [];
    this.pending += delta;
    const out: string[] = [];

    while (this.pending.length > 0) {
      const match = SEGMENT_BOUNDARY.exec(this.pending);
      if (match) {
        const end = match.index + match[0].length;
        out.push(this.pending.slice(0, end));
        this.pending = this.pending.slice(end);
        continue;
      }
      if (this.pending.length >= HARD_CAP_CHARS) {
        out.push(this.pending.slice(0, HARD_CAP_CHARS));
        this.pending = this.pending.slice(HARD_CAP_CHARS);
        continue;
      }
      break;
    }

    return out;
  }

  /**
   * Drain the unflushed tail. Call exactly once at end-of-stream so the
   * final partial segment (no trailing punctuation) still goes through
   * the guard. Returns null if nothing pending.
   */
  flushTail(): string | null {
    if (this.pending.length === 0) return null;
    const tail = this.pending;
    this.pending = "";
    return tail;
  }

  /** Total chars currently buffered (testing/diagnostic). */
  get pendingLength(): number {
    return this.pending.length;
  }
}
