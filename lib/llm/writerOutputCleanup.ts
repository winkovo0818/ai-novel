type CleanupCategory = "ai_signature" | "hygiene";

interface CleanupRule {
  id: string;
  label: string;
  category: CleanupCategory;
  pattern: RegExp;
  replacement: string;
}

export interface CleanupHit {
  id: string;
  label: string;
  category: CleanupCategory;
  count: number;
}

export interface CleanupResult {
  text: string;
  hits: CleanupHit[];
}

// Ordered cleanup rules. Order matters — structural strips run before vocab
// swaps before punctuation hygiene, matching the original chained .replace().
// `ai_signature` rules target obvious model tells (Markdown, signposting, AI
// adverbs); `hygiene` rules just normalize whitespace / punctuation left behind.
const CLEANUP_RULES: CleanupRule[] = [
  { id: "bold_markdown", label: "Markdown 粗体", category: "ai_signature", pattern: /\*\*([^*\n]+)\*\*/g, replacement: "$1" },
  { id: "heading", label: "Markdown 标题", category: "ai_signature", pattern: /^\s{0,3}#{1,6}\s*/gm, replacement: "" },
  { id: "list_marker", label: "列表符号", category: "ai_signature", pattern: /^\s*[-*]\s+(?=\S)/gm, replacement: "" },
  { id: "dash_overuse", label: "旁白破折号", category: "ai_signature", pattern: /[—–]+|--+/g, replacement: "。" },
  { id: "signposting", label: "教程路标", category: "ai_signature", pattern: /接下来(?:我们)?|下面是|以下是|让我们/g, replacement: "" },
  { id: "hearsay", label: "模糊归因（据说）", category: "ai_signature", pattern: /据说/g, replacement: "门里人说" },
  { id: "this_moment", label: "套话（这一刻）", category: "ai_signature", pattern: /这一刻/g, replacement: "这时" },
  { id: "vocab_slowly", label: "AI 副词（慢慢）", category: "ai_signature", pattern: /慢慢地?/g, replacement: "" },
  { id: "vocab_gently", label: "AI 副词（缓缓）", category: "ai_signature", pattern: /缓缓地?/g, replacement: "" },
  { id: "vocab_lightly", label: "AI 副词（轻轻）", category: "ai_signature", pattern: /轻轻地?/g, replacement: "" },
  { id: "vocab_quietly", label: "AI 副词（悄悄）", category: "ai_signature", pattern: /悄悄地?/g, replacement: "" },
  { id: "vocab_cant_help", label: "AI 副词（不由得）", category: "ai_signature", pattern: /不由得/g, replacement: "" },
  { id: "vocab_meanwhile", label: "AI 连接（与此同时）", category: "ai_signature", pattern: /与此同时/g, replacement: "这时" },
  { id: "vocab_for_a_moment", label: "AI 连接（一时间）", category: "ai_signature", pattern: /一时间/g, replacement: "一下子" },
  { id: "vocab_as_if_fang", label: "AI 比喻（仿佛）", category: "ai_signature", pattern: /仿佛/g, replacement: "像" },
  { id: "vocab_as_if_wan", label: "AI 比喻（宛如）", category: "ai_signature", pattern: /宛如/g, replacement: "像" },
  { id: "vocab_as_if_you", label: "AI 比喻（犹如）", category: "ai_signature", pattern: /犹如/g, replacement: "像" },
  { id: "vocab_seem", label: "AI 模糊（似乎）", category: "ai_signature", pattern: /似乎/g, replacement: "像是" },
  { id: "vocab_faint_yin", label: "AI 模糊（隐约）", category: "ai_signature", pattern: /隐约/g, replacement: "约略" },
  { id: "vocab_faint_yi", label: "AI 模糊（依稀）", category: "ai_signature", pattern: /依稀/g, replacement: "约略" },
  { id: "vocab_extremely", label: "AI 程度（极其）", category: "ai_signature", pattern: /极其/g, replacement: "很" },
  { id: "vocab_almost", label: "AI 程度（几乎）", category: "ai_signature", pattern: /几乎/g, replacement: "差点" },
  { id: "antithesis", label: "工整对偶（不是…而是…）", category: "ai_signature", pattern: /不是([^。！？\n]{1,36})，而是([^。！？\n]{1,48})/g, replacement: "并非$1。$2" },
  { id: "punct_repeat", label: "重复句末标点", category: "hygiene", pattern: /([。！？]){2,}/g, replacement: "$1" },
  { id: "punct_comma_period", label: "逗号接句号", category: "hygiene", pattern: /([，、：；])。/g, replacement: "。" },
  { id: "punct_quote_space", label: "句末引号空格", category: "hygiene", pattern: /。\s*([”"])/g, replacement: "。$1" },
  { id: "ws_tab", label: "多余空格", category: "hygiene", pattern: /[ \t]{2,}/g, replacement: " " },
  { id: "ws_newline", label: "多余空行", category: "hygiene", pattern: /\n{3,}/g, replacement: "\n\n" },
  { id: "ws_trailing", label: "行尾空白", category: "hygiene", pattern: /[ \t]+\n/g, replacement: "\n" },
];

function applyRules(text: string): CleanupResult {
  let cleaned = text;
  const hits: CleanupHit[] = [];
  for (const rule of CLEANUP_RULES) {
    const matchCount = (cleaned.match(rule.pattern) ?? []).length;
    if (matchCount > 0) {
      hits.push({ id: rule.id, label: rule.label, category: rule.category, count: matchCount });
      cleaned = cleaned.replace(rule.pattern, rule.replacement);
    }
  }
  return { text: cleaned, hits };
}

/**
 * Last-mile cleanup for Writer prose. Prompt rules reduce the problem, but
 * model streams can still leak obvious formatting / AI-signature residue.
 * Keep this conservative: remove surface artifacts without changing plot facts.
 */
export function cleanupWriterOutput(text: string): string {
  return applyRules(text).text
    .replace(/^```(?:\w+)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

/**
 * Same cleanup as {@link cleanupWriterOutput} but also returns which rules
 * fired and how many times. Used by quality evals to track how much AI-signature
 * residue the model still emits after prompt tuning.
 */
export function cleanupWriterOutputWithReport(text: string): CleanupResult {
  const result = applyRules(text);
  return {
    text: result.text.replace(/^```(?:\w+)?\s*/u, "").replace(/\s*```$/u, "").trim(),
    hits: result.hits,
  };
}

export function cleanupWriterOutputSegment(segment: string): string {
  return applyRules(segment).text;
}

/** Total AI-signature (non-hygiene) cleanup hits — a "how AI did it read" proxy. */
export function aiSignatureHitTotal(text: string): number {
  return applyRules(text).hits
    .filter((hit) => hit.category === "ai_signature")
    .reduce((sum, hit) => sum + hit.count, 0);
}
