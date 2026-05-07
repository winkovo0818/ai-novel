export interface StreamEvent {
  event: string;
  data: unknown;
}

export async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
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
}

function parseSseBlock(block: string): StreamEvent | null {
  if (block.startsWith(":")) return null;
  const event = block.match(/^event: (.+)$/m)?.[1];
  const data = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !data) return null;
  return { event, data: JSON.parse(data) };
}
