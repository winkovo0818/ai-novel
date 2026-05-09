import { describe, expect, it } from "vitest";

import { readSse } from "./readSse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("readSse", () => {
  it("parses SSE events and ignores heartbeat comments", async () => {
    const stream = streamFromChunks([
      ": heartbeat\n\n",
      "event: chapter_delta\ndata: {\"delta\":\"hello\"}\n\n",
      "event: done\ndata: {\"chars\":5}\n\n",
    ]);
    const events: Array<{ event: string; data: unknown }> = [];

    await readSse(stream, (event) => events.push(event));

    expect(events).toEqual([
      { event: "chapter_delta", data: { delta: "hello" } },
      { event: "done", data: { chars: 5 } },
    ]);
  });

  it("merges multiple data: lines with newlines per the SSE spec", async () => {
    // Servers may split a JSON payload across data: lines for readability.
    const stream = streamFromChunks([
      "event: ping\ndata: {\"a\":1,\ndata: \"b\":2}\n\n",
    ]);
    const events: Array<{ event: string; data: unknown }> = [];

    await readSse(stream, (event) => events.push(event));

    expect(events).toEqual([{ event: "ping", data: { a: 1, "b": 2 } }]);
  });

  it("flushes the trailing event when the stream ends without a blank line", async () => {
    const stream = streamFromChunks([
      "event: done\ndata: {\"final\":true}",
    ]);
    const events: Array<{ event: string; data: unknown }> = [];

    await readSse(stream, (event) => events.push(event));

    expect(events).toEqual([{ event: "done", data: { final: true } }]);
  });

  it("handles \\r\\n line endings", async () => {
    const stream = streamFromChunks([
      "event: pong\r\ndata: {\"ok\":true}\r\n\r\n",
    ]);
    const events: Array<{ event: string; data: unknown }> = [];

    await readSse(stream, (event) => events.push(event));

    expect(events).toEqual([{ event: "pong", data: { ok: true } }]);
  });

  it("strips a single leading space after data: per spec", async () => {
    // OpenAI-compatible servers emit "data: {...}" with a space.
    const stream = streamFromChunks([
      "event: tick\ndata: {\"n\":7}\n\n",
    ]);
    const events: Array<{ event: string; data: unknown }> = [];

    await readSse(stream, (event) => events.push(event));

    expect(events).toEqual([{ event: "tick", data: { n: 7 } }]);
  });
});
