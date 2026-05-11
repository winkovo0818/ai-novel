export type SseEventName =
  | "meta"
  | "character"
  | "world"
  | "outline_chapter"
  | "first_chapter_beat"
  | "chapter_delta"
  | "retrieval"
  | "session"
  | "done"
  | "error";

export function sseEncode(event: SseEventName, data: unknown): string {
  const payload = JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

export function sseHeartbeat(): string {
  return ":heartbeat\n\n";
}
