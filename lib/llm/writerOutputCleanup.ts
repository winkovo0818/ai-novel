/**
 * Cleanup rule categories. Order of severity / safety:
 * - `format`: structural model tells that are safe to strip without touching
 *   meaning — Markdown, headings, list markers, emoji, signposting, narration
 *   dashes. Always applied.
 * - `hygiene`: whitespace / punctuation normalization left behind. Always applied.
 * - `vocab`: word / phrase substitutions (似乎→像是, 慢慢→删除, 不是X而是Y→…).
 *   These are *context-blind* global replacements that can change a character's
 *   tone or an author's deliberate rhetoric, so they are OFF by default. The
 *   prompt layer (HUMAN_STYLE_DIRECTIVE) and the critic's prose_quality check
 *   own vocabulary now — the cleanup layer only counts vocab hits so the quality
 *   evaluator can still see how much AI residue the raw draft carried.
 */
type CleanupCategory = "format" | "hygiene" | "vocab";

/** Categories whose hits signal "AI voice" to the quality evaluator. */
export const AI_SIGNATURE_CATEGORIES: readonly CleanupCategory[] = ["format", "vocab"];

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

export interface CleanupOptions {
  /**
   * Apply `vocab` substitutions (similar to the old behavior). Default false:
   * vocab hits are counted but NOT replaced, leaving word-level fixes to the
   * prompt layer and critic where context is available.
   */
  applyVocab?: boolean;
}

// Ordered cleanup rules. Order matters — structural strips run before vocab
// swaps before punctuation hygiene, matching the original chained .replace().
// `format` rules target obvious structural tells (Markdown, signposting,
// narration dashes); `vocab` rules are word/phrase swaps (off by default);
// `hygiene` rules normalize whitespace / punctuation left behind.
const CLEANUP_RULES: CleanupRule[] = [
  { id: "bold_markdown", label: "Markdown 粗体", category: "format", pattern: /\*\*([^*\n]+)\*\*/g, replacement: "$1" },
  { id: "heading", label: "Markdown 标题", category: "format", pattern: /^\s{0,3}#{1,6}\s*/gm, replacement: "" },
  { id: "list_marker", label: "列表符号", category: "format", pattern: /^\s*[-*]\s+(?=\S)/gm, replacement: "" },
  { id: "dash_overuse", label: "旁白破折号", category: "format", pattern: /[—–]+|--+/g, replacement: "。" },
  { id: "signposting", label: "教程路标", category: "format", pattern: /接下来(?:我们)?|下面是|以下是|让我们/g, replacement: "" },
  { id: "hearsay", label: "模糊归因（据说）", category: "vocab", pattern: /据说/g, replacement: "门里人说" },
  { id: "this_moment", label: "套话（这一刻）", category: "vocab", pattern: /这一刻/g, replacement: "这时" },
  { id: "vocab_slowly", label: "AI 副词（慢慢）", category: "vocab", pattern: /慢慢地?/g, replacement: "" },
  { id: "vocab_gently", label: "AI 副词（缓缓）", category: "vocab", pattern: /缓缓地?/g, replacement: "" },
  { id: "vocab_lightly", label: "AI 副词（轻轻）", category: "vocab", pattern: /轻轻地?/g, replacement: "" },
  { id: "vocab_quietly", label: "AI 副词（悄悄）", category: "vocab", pattern: /悄悄地?/g, replacement: "" },
  { id: "vocab_cant_help", label: "AI 副词（不由得）", category: "vocab", pattern: /不由得/g, replacement: "" },
  { id: "vocab_meanwhile", label: "AI 连接（与此同时）", category: "vocab", pattern: /与此同时/g, replacement: "这时" },
  { id: "vocab_for_a_moment", label: "AI 连接（一时间）", category: "vocab", pattern: /一时间/g, replacement: "一下子" },
  { id: "vocab_as_if_fang", label: "AI 比喻（仿佛）", category: "vocab", pattern: /仿佛/g, replacement: "像" },
  { id: "vocab_as_if_wan", label: "AI 比喻（宛如）", category: "vocab", pattern: /宛如/g, replacement: "像" },
  { id: "vocab_as_if_you", label: "AI 比喻（犹如）", category: "vocab", pattern: /犹如/g, replacement: "像" },
  { id: "vocab_seem", label: "AI 模糊（似乎）", category: "vocab", pattern: /似乎/g, replacement: "像是" },
  { id: "vocab_faint_yin", label: "AI 模糊（隐约）", category: "vocab", pattern: /隐约/g, replacement: "约略" },
  { id: "vocab_faint_yi", label: "AI 模糊（依稀）", category: "vocab", pattern: /依稀/g, replacement: "约略" },
  { id: "vocab_extremely", label: "AI 程度（极其）", category: "vocab", pattern: /极其/g, replacement: "很" },
  { id: "vocab_almost", label: "AI 程度（几乎）", category: "vocab", pattern: /几乎/g, replacement: "差点" },
  { id: "antithesis", label: "工整对偶（不是…而是…）", category: "vocab", pattern: /不是([^。！？\n]{1,36})，而是([^。！？\n]{1,48})/g, replacement: "并非$1。$2" },
  { id: "punct_repeat", label: "重复句末标点", category: "hygiene", pattern: /([。！？]){2,}/g, replacement: "$1" },
  { id: "punct_comma_period", label: "逗号接句号", category: "hygiene", pattern: /([，、：；])。/g, replacement: "。" },
  { id: "punct_quote_space", label: "句末引号空格", category: "hygiene", pattern: /。\s*([”"])/g, replacement: "。$1" },
  { id: "ws_tab", label: "多余空格", category: "hygiene", pattern: /[ \t]{2,}/g, replacement: " " },
  { id: "ws_newline", label: "多余空行", category: "hygiene", pattern: /\n{3,}/g, replacement: "\n\n" },
  { id: "ws_trailing", label: "行尾空白", category: "hygiene", pattern: /[ \t]+\n/g, replacement: "\n" },
];

function applyRules(text: string, options: CleanupOptions = {}): CleanupResult {
  const applyVocab = options.applyVocab ?? false;
  let cleaned = text;
  const hits: CleanupHit[] = [];
  for (const rule of CLEANUP_RULES) {
    const matchCount = (cleaned.match(rule.pattern) ?? []).length;
    if (matchCount === 0) continue;
    // Vocab rules are context-blind global replacements — record the hit so the
    // quality evaluator can still measure AI residue, but only rewrite the text
    // when explicitly opted in.
    hits.push({ id: rule.id, label: rule.label, category: rule.category, count: matchCount });
    if (rule.category === "vocab" && !applyVocab) continue;
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }
  return { text: cleaned, hits };
}

/**
 * Last-mile cleanup for Writer prose. Prompt rules reduce the problem, but
 * model streams can still leak obvious formatting / AI-signature residue.
 * Keep this conservative: remove surface artifacts without changing plot facts.
 * Vocabulary substitutions are off by default (see {@link CleanupOptions}).
 */
export function cleanupWriterOutput(text: string, options?: CleanupOptions): string {
  return applyRules(text, options).text
    .replace(/^```(?:\w+)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

/**
 * Same cleanup as {@link cleanupWriterOutput} but also returns which rules
 * fired and how many times. Used by quality evals to track how much AI-signature
 * residue the model still emits after prompt tuning.
 */
export function cleanupWriterOutputWithReport(text: string, options?: CleanupOptions): CleanupResult {
  const result = applyRules(text, options);
  return {
    text: result.text.replace(/^```(?:\w+)?\s*/u, "").replace(/\s*```$/u, "").trim(),
    hits: result.hits,
  };
}

export function cleanupWriterOutputSegment(segment: string, options?: CleanupOptions): string {
  return applyRules(segment, options).text;
}

/** Total AI-signature (format + vocab, non-hygiene) cleanup hits — a "how AI did it read" proxy. */
export function aiSignatureHitTotal(text: string): number {
  return applyRules(text).hits
    .filter((hit) => AI_SIGNATURE_CATEGORIES.includes(hit.category))
    .reduce((sum, hit) => sum + hit.count, 0);
}
