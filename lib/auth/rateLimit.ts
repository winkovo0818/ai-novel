/**
 * Rate limiter abstraction.
 *
 * Current implementation falls back to an in-memory Map. For production
 * multi-instance or serverless deployments, swap to an external store
 * (Redis / Upstash / Supabase RPC) by setting RATE_LIMIT_STORE=redis
 * and providing REDIS_URL.
 */

const WINDOW_MS = 60_000;

/** Limits per route category (per identifier per minute). */
const LIMITS = {
  draft: 10,          // SSE chapter drafting — high cost
  bible: 5,           // Onboarding Bible SSE — very high cost
  loglines: 10,       // Logline generation
  questions: 10,      // Reverse questions generation
  consistency: 5,     // Full-novel consistency check
  summarize: 10,      // Chapter summarization
  llm_models: 30,     // Admin model config
  healthz_llm: 5,     // Admin-only LLM health check
  default: 60,        // General API catch-all
} as const;

export interface RateLimiter {
  isLimited(identifier: string, route: string): boolean;
  reset(identifier: string, route: string): void;
}

class MemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, number[]>();

  private key(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }

  isLimited(identifier: string, route: string): boolean {
    const prefix = route.replace(/\/[a-f0-9-]+/gi, "/:id").replace(/\?.*$/, "");
    const k = this.key(prefix, identifier);
    const now = Date.now();
    const timestamps = this.windows.get(k)?.filter((t) => now - t < WINDOW_MS) ?? [];

    if (timestamps.length >= resolveLimit(route)) {
      return true;
    }

    timestamps.push(now);
    this.windows.set(k, timestamps);
    return false;
  }

  reset(identifier: string, route: string): void {
    const prefix = route.replace(/\/[a-f0-9-]+/gi, "/:id").replace(/\?.*$/, "");
    this.windows.delete(this.key(prefix, identifier));
  }
}

function resolveLimit(route: string): number {
  if (route.includes("/draft")) return LIMITS.draft;
  if (route.includes("/bible")) return LIMITS.bible;
  if (route.includes("/loglines")) return LIMITS.loglines;
  if (route.includes("/questions")) return LIMITS.questions;
  if (route.includes("/consistency")) return LIMITS.consistency;
  if (route.includes("/summarize")) return LIMITS.summarize;
  if (route.includes("/llm-models")) return LIMITS.llm_models;
  if (route.includes("/healthz/llm")) return LIMITS.healthz_llm;
  return LIMITS.default;
}

export function resolveLimitForRoute(route: string): number {
  return resolveLimit(route);
}

function createRateLimiter(): RateLimiter {
  const store = process.env.RATE_LIMIT_STORE;
  if (store === "redis") {
    // Placeholder: import and return RedisRateLimiter when available.
    // For now fall back to memory.
    console.warn("[rateLimit] RATE_LIMIT_STORE=redis requested but not implemented; falling back to memory");
  }
  return new MemoryRateLimiter();
}

let _limiter: RateLimiter | null = null;

function getLimiter(): RateLimiter {
  if (!_limiter) {
    _limiter = createRateLimiter();
  }
  return _limiter;
}

/**
 * Check if the identifier is rate-limited for the given route.
 * Key should include userId + route + IP for production granularity.
 */
export function isRateLimited(identifier: string, route: string): boolean {
  return getLimiter().isLimited(identifier, route);
}

/**
 * Reset the rate limit window for an identifier/route (useful in tests).
 */
export function resetRateLimit(identifier: string, route: string): void {
  getLimiter().reset(identifier, route);
}

/**
 * Build a composite identifier from userId, route, and optional IP.
 */
export function buildRateLimitKey(userId: string, route: string, ip?: string): string {
  return ip ? `${userId}:${route}:${ip}` : `${userId}:${route}`;
}
