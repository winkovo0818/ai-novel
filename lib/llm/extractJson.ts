/**
 * Robust JSON extraction for noisy LLM responses. Models sometimes wrap JSON in
 * markdown fences, emit trailing commentary after the object, or use full-width
 * quotes — all of which break a naive `JSON.parse`. These helpers were promoted
 * out of `scripts/eval-critic-revise.ts` so the headless auto-pilot pipeline and
 * the eval harness share one parser (and the auto-pilot degrades instead of
 * throwing mid-run).
 */

/** Strip a leading/trailing markdown code fence (```json … ```). */
export function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Slice out the first balanced top-level `{…}` object (string-aware) so trailing
 * model commentary after the JSON doesn't break parsing. Returns the input from
 * the first `{` onward if no balanced close is found.
 */
export function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/**
 * Parse the first JSON object out of a possibly-noisy LLM response: strip fences,
 * slice the first balanced object, `JSON.parse`, with a fallback that swaps the
 * full-width quotes models sometimes emit. Returns `null` on failure so callers
 * can degrade gracefully instead of throwing.
 */
export function parseFirstJsonObject<T = unknown>(raw: string): T | null {
  const body = extractFirstJsonObject(stripCodeFence(raw));
  try {
    return JSON.parse(body) as T;
  } catch {
    try {
      return JSON.parse(body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")) as T;
    } catch {
      return null;
    }
  }
}
