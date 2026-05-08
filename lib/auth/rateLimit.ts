const windows = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;
const DRAFT_MAX = 10;

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

export function isRateLimited(identifier: string, route: string): boolean {
  if (route.includes("/draft")) return isLimited(identifier, "draft", DRAFT_MAX);
  return isLimited(identifier, "api", DEFAULT_MAX);
}
