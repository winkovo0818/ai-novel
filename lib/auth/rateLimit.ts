/**
 * Rate limiter abstraction.
 *
 * Two implementations:
 *
 *   - MemoryRateLimiter: in-process Map. Fine for single-instance deploys
 *     and local dev; multi-replica deploys (Vercel multi-region, k8s,
 *     fly.io) leak limits across instances.
 *
 *   - UpstashRateLimiter: HTTP-only client against the Upstash Redis REST
 *     API. Sliding window via sorted-set commands. Fetch-native so it
 *     works anywhere — node runtime, edge runtime, or under jest/vitest
 *     when given a stub fetch.
 *
 * Selection (in order):
 *   1. RATE_LIMIT_STORE=redis + UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *      → Upstash, fail-open to Memory if env is incomplete (with warning).
 *   2. otherwise → Memory.
 *
 * The interface is async so call sites can switch implementations without
 * a migration. MemoryRateLimiter resolves synchronously inside; the async
 * shape is only there for parity with the network-bound implementation.
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
  isLimited(identifier: string, route: string): Promise<boolean>;
  reset(identifier: string, route: string): Promise<void>;
}

function normalizeRouteKey(route: string): string {
  // Strip query string, then collapse path segments that LOOK like an ID
  // (hex + dash, 6+ chars) into ":id" so two requests against different
  // novels share a bucket. The previous regex `/[a-f0-9-]+/gi` matched
  // any contiguous run of hex chars *inside* a segment and rewrote it,
  // so e.g. "api" → "" and "chapters" → "hapters". Splitting on `/`
  // and matching whole segments avoids that.
  return route
    .split("?")[0]
    .split("/")
    .map((seg) => (seg.length >= 6 && /^[0-9a-f-]+$/i.test(seg) ? ":id" : seg))
    .join("/");
}

class MemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, number[]>();

  private key(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }

  async isLimited(identifier: string, route: string): Promise<boolean> {
    const prefix = normalizeRouteKey(route);
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

  async reset(identifier: string, route: string): Promise<void> {
    const prefix = normalizeRouteKey(route);
    this.windows.delete(this.key(prefix, identifier));
  }
}

interface UpstashOptions {
  url: string;
  token: string;
  /** Override fetch (used by tests to stub the network). */
  fetchImpl?: typeof fetch;
}

interface UpstashPipelineResult {
  result?: unknown;
  error?: string;
}

/**
 * Upstash Redis REST client. Uses sorted-set sliding window:
 *   ZREMRANGEBYSCORE key 0 (now - WINDOW)
 *   ZCARD key
 *   ZADD key now now
 *   PEXPIRE key WINDOW
 *
 * The pipeline keeps these atomic per-call and avoids race-window inflation.
 * The ZADD member is the timestamp itself — duplicate-second writes overwrite,
 * which trades sub-second precision for storage simplicity.
 */
class UpstashRateLimiter implements RateLimiter {
  private url: string;
  private token: string;
  private fetchImpl: typeof fetch;

  constructor(opts: UpstashOptions) {
    this.url = opts.url.replace(/\/$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private redisKey(identifier: string, route: string): string {
    return `rl:${normalizeRouteKey(route)}:${identifier}`;
  }

  private async pipeline(commands: unknown[][]): Promise<UpstashPipelineResult[]> {
    const response = await this.fetchImpl(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!response.ok) {
      throw new Error(`Upstash pipeline returned ${response.status}`);
    }
    return (await response.json()) as UpstashPipelineResult[];
  }

  async isLimited(identifier: string, route: string): Promise<boolean> {
    const limit = resolveLimit(route);
    const key = this.redisKey(identifier, route);
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    try {
      const results = await this.pipeline([
        ["ZREMRANGEBYSCORE", key, "0", String(cutoff)],
        ["ZCARD", key],
        ["ZADD", key, String(now), String(now)],
        ["PEXPIRE", key, String(WINDOW_MS)],
      ]);
      const cardResult = results[1]?.result;
      const count = typeof cardResult === "number" ? cardResult : Number(cardResult ?? 0);
      // ZCARD reads the count BEFORE the ZADD on the same pipeline. Treat
      // the request we're about to admit as the (count + 1)th — block at
      // the boundary so callers don't get one free slot beyond `limit`.
      return count >= limit;
    } catch (err) {
      // Network / Upstash outage. Failing closed (block all) would DoS the
      // app on a noisy hop; failing open (allow all) drops the cap. We
      // pick fail-open because the memory limiter is also still active in
      // single-process runs, and an outage is rarer than a runaway client.
      console.error(
        `[rateLimit] upstash request failed, allowing through: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  async reset(identifier: string, route: string): Promise<void> {
    const key = this.redisKey(identifier, route);
    try {
      await this.pipeline([["DEL", key]]);
    } catch (err) {
      console.error(
        `[rateLimit] upstash DEL failed: ${err instanceof Error ? err.message : err}`,
      );
    }
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
  if (process.env.RATE_LIMIT_STORE === "redis") {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      return new UpstashRateLimiter({ url, token });
    }
    console.warn(
      "[rateLimit] RATE_LIMIT_STORE=redis but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing; falling back to memory",
    );
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
 * Override the active limiter. Test-only — production code never calls this.
 * Callers should restore the previous value (returned) to avoid bleed.
 */
export function _setLimiterForTesting(next: RateLimiter | null): RateLimiter | null {
  const prev = _limiter;
  _limiter = next;
  return prev;
}

/**
 * Check if the identifier is rate-limited for the given route.
 * Key should include userId + route + IP for production granularity.
 */
export async function isRateLimited(identifier: string, route: string): Promise<boolean> {
  return getLimiter().isLimited(identifier, route);
}

/**
 * Reset the rate limit window for an identifier/route (useful in tests).
 */
export async function resetRateLimit(identifier: string, route: string): Promise<void> {
  return getLimiter().reset(identifier, route);
}

/**
 * Build a composite identifier from userId, route, and optional IP.
 */
export function buildRateLimitKey(userId: string, route: string, ip?: string): string {
  return ip ? `${userId}:${route}:${ip}` : `${userId}:${route}`;
}

// Exported for direct construction in advanced wiring (e.g. injecting a
// custom fetch from tests). Production picks them via createRateLimiter().
export { MemoryRateLimiter, UpstashRateLimiter };
