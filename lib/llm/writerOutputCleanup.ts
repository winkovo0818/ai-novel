const AI_VOCAB_REPLACEMENTS: Array<[RegExp, string]> = [
  [/慢慢地?/g, ""],
  [/缓缓地?/g, ""],
  [/轻轻地?/g, ""],
  [/悄悄地?/g, ""],
  [/不由得/g, ""],
  [/与此同时/g, "这时"],
  [/一时间/g, "一下子"],
  [/仿佛/g, "像"],
  [/宛如/g, "像"],
  [/犹如/g, "像"],
  [/似乎/g, "像是"],
  [/隐约/g, "约略"],
  [/依稀/g, "约略"],
  [/极其/g, "很"],
  [/几乎/g, "差点"],
];

/**
 * Last-mile cleanup for Writer prose. Prompt rules reduce the problem, but
 * model streams can still leak obvious formatting / AI-signature residue.
 * Keep this conservative: remove surface artifacts without changing plot facts.
 */
export function cleanupWriterOutput(text: string): string {
  return cleanupWriterOutputText(text)
    .replace(/^```(?:\w+)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

export function cleanupWriterOutputSegment(segment: string): string {
  return cleanupWriterOutputText(segment);
}

function cleanupWriterOutputText(text: string): string {
  let cleaned = text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+(?=\S)/gm, "")
    .replace(/[—–]+|--+/g, "。")
    .replace(/接下来(?:我们)?|下面是|以下是|让我们/g, "")
    .replace(/据说/g, "门里人说")
    .replace(/这一刻/g, "这时");

  for (const [pattern, replacement] of AI_VOCAB_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned
    .replace(/不是([^。！？\n]{1,36})，而是([^。！？\n]{1,48})/g, "并非$1。$2")
    .replace(/([。！？]){2,}/g, "$1")
    .replace(/([，、：；])。/g, "。")
    .replace(/。\s*([”"])/g, "。$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n");
}
