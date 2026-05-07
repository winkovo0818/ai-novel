import { describe, expect, it } from "vitest";

import { readSse } from "./readSse";

describe("readSse", () => {
  it("parses SSE events and ignores heartbeat comments", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
        controller.enqueue(encoder.encode("event: chapter_delta\ndata: {\"delta\":\"hello\"}\n\n"));
        controller.enqueue(encoder.encode("event: done\ndata: {\"chars\":5}\n\n"));
        controller.close();
      },
    });
    const events: Array<{ event: string; data: unknown }> = [];

    await readSse(stream, (event) => events.push(event));

    expect(events).toEqual([
      { event: "chapter_delta", data: { delta: "hello" } },
      { event: "done", data: { chars: 5 } },
    ]);
  });
});
