const windows = new Map<string, number[]>();

const WINDOW_MS = 60_000;

/** Limits per route category (per user per minute). */
const LIMITS = {
  draft: 10,          // SSE chapter drafting — high cost
  bible: 5,           // Onboarding Bible SSE — very high cost
  loglines: 10,       // Logline generation
  questions: 10,      // Reverse questions generation
  consistency: 5,     // Full-novel consistency check
  summarize: 10,      // Chapter summarization
  llm_models: 30,     // Admin model config
  default: 60,        // General API catch-all
} as const;

function key(prefix: string, identifier: string): string {
  return `${prefix}:${identifier}`;
}

function isLimited(identifier: string, prefix: string, max: number): boolean {
  const k = key(prefix, identifier);
  const now = Date.now();
  const timestamps = windows.get(k)?.filter((t) => now - t < WINDOW_MS) ?? [];

  if (timestamps.length >= max) return true;

  timestamps.push(now);
  windows.set(k, timestamps);
  return false;
}

function resolveLimit(route: string): number {
  if (route.includes("/draft")) return LIMITS.draft;
  if (route.includes("/bible")) return LIMITS.bible;
  if (route.includes("/loglines")) return LIMITS.loglines;
  if (route.includes("/questions")) return LIMITS.questions;
  if (route.includes("/consistency")) return LIMITS.consistency;
  if (route.includes("/summarize")) return LIMITS.summarize;
  if (route.includes("/llm-models")) return LIMITS.llm_models;
  return LIMITS.default;
}

export function isRateLimited(identifier: string, route: string): boolean {
  const prefix = route.replace(/\/[a-f0-9-]+/gi, "/:id").replace(/\?.*$/, "");
  return isLimited(identifier, prefix, resolveLimit(route));
}
