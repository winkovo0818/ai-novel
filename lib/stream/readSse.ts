export interface StreamEvent {
  event: string;
  data: unknown;
}

export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event);
    }
  }

  // Some upstreams (proxies, abrupt closes) drop the trailing "\n\n" on the
  // final event. Flush whatever's left so callers don't lose the last frame.
  buffer += decoder.decode();
  const trailing = buffer.trim();
  if (trailing) {
    const event = parseSseBlock(trailing);
    if (event) onEvent(event);
  }
}

function parseSseBlock(block: string): StreamEvent | null {
  if (block.startsWith(":")) return null;

  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      // Per the SSE spec, multiple data: lines in one event concatenate with
      // a literal "\n". Spec also says a single leading space after ":" is
      // stripped — preserve everything else verbatim so JSON parses correctly.
      const segment = line.slice("data:".length);
      dataLines.push(segment.startsWith(" ") ? segment.slice(1) : segment);
    }
  }

  if (!eventName || dataLines.length === 0) return null;
  return { event: eventName, data: JSON.parse(dataLines.join("\n")) };
}
