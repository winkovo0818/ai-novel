import { describe, it, expect, beforeEach } from "vitest";
import {
  isRateLimited,
  resetRateLimit,
  resolveLimitForRoute,
  buildRateLimitKey,
  MemoryRateLimiter,
  UpstashRateLimiter,
  _setLimiterForTesting,
} from "./rateLimit";

describe("isRateLimited (memory limiter)", () => {
  beforeEach(() => {
    // Restore the module-level limiter so tests start from clean state.
    _setLimiterForTesting(null);
  });

  it("allows requests under the default limit", async () => {
    const identifier = `test-allow-${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      expect(await isRateLimited(identifier, "/api/something")).toBe(false);
    }
  });

  it("blocks requests over the default limit (60/min)", async () => {
    const identifier = `test-block-${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      await isRateLimited(identifier, "/api/something");
    }
    expect(await isRateLimited(identifier, "/api/something")).toBe(true);
  });

  it("uses a lower limit for draft routes (10/min)", async () => {
    const identifier = `test-draft-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      await isRateLimited(identifier, "/api/novels/123/chapters/draft");
    }
    expect(await isRateLimited(identifier, "/api/novels/123/chapters/draft")).toBe(true);
  });

  it("tracks different identifiers independently", async () => {
    const id1 = `test-ind1-${Date.now()}`;
    const id2 = `test-ind2-${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      await isRateLimited(id1, "/api/something");
    }
    expect(await isRateLimited(id1, "/api/something")).toBe(true);
    expect(await isRateLimited(id2, "/api/something")).toBe(false);
  });

  it("normalizes UUIDs in route keys so the same route shares a window", async () => {
    const identifier = `test-norm-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      await isRateLimited(identifier, "/api/novels/aaa-bbb/chapters/draft");
    }
    expect(await isRateLimited(identifier, "/api/novels/ccc-ddd/chapters/draft")).toBe(true);
  });

  it("resetRateLimit clears the window for the given identifier+route", async () => {
    const identifier = `test-reset-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      await isRateLimited(identifier, "/api/novels/x/chapters/draft");
    }
    expect(await isRateLimited(identifier, "/api/novels/x/chapters/draft")).toBe(true);
    await resetRateLimit(identifier, "/api/novels/x/chapters/draft");
    expect(await isRateLimited(identifier, "/api/novels/x/chapters/draft")).toBe(false);
  });
});

describe("resolveLimitForRoute / buildRateLimitKey", () => {
  it("maps each route family to the right cap", () => {
    expect(resolveLimitForRoute("/api/novels/x/chapters/draft")).toBe(10);
    expect(resolveLimitForRoute("/api/onboarding/sessions/y/bible")).toBe(5);
    expect(resolveLimitForRoute("/api/llm-models")).toBe(30);
    expect(resolveLimitForRoute("/api/healthz/llm")).toBe(5);
    expect(resolveLimitForRoute("/api/something/else")).toBe(60);
  });

  it("includes the IP suffix only when present", () => {
    expect(buildRateLimitKey("u", "r")).toBe("u:r");
    expect(buildRateLimitKey("u", "r", "1.2.3.4")).toBe("u:r:1.2.3.4");
  });
});

describe("UpstashRateLimiter (mocked fetch)", () => {
  function buildLimiter(fetchImpl: typeof fetch) {
    return new UpstashRateLimiter({
      url: "https://upstash.example/",
      token: "tok",
      fetchImpl,
    });
  }

  it("admits the call when ZCARD < limit", async () => {
    // Pipeline returns 4 results (one per command). ZCARD result lives at [1].
    const fetchImpl = (async () =>
      new Response(JSON.stringify([{ result: 0 }, { result: 3 }, { result: 1 }, { result: 1 }]), {
        status: 200,
      })) as typeof fetch;
    const limiter = buildLimiter(fetchImpl);
    expect(await limiter.isLimited("u", "/api/novels/x/chapters/draft")).toBe(false);
  });

  it("blocks when ZCARD has already reached the limit", async () => {
    // draft route has limit=10. Return ZCARD=10 → block.
    const fetchImpl = (async () =>
      new Response(JSON.stringify([{ result: 0 }, { result: 10 }, { result: 1 }, { result: 1 }]), {
        status: 200,
      })) as typeof fetch;
    const limiter = buildLimiter(fetchImpl);
    expect(await limiter.isLimited("u", "/api/novels/x/chapters/draft")).toBe(true);
  });

  it("fail-opens (allows) when Upstash is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const limiter = buildLimiter(fetchImpl);
    expect(await limiter.isLimited("u", "/api/something")).toBe(false);
  });

  it("fail-opens on non-2xx HTTP", async () => {
    const fetchImpl = (async () => new Response("oops", { status: 502 })) as typeof fetch;
    const limiter = buildLimiter(fetchImpl);
    expect(await limiter.isLimited("u", "/api/something")).toBe(false);
  });

  it("sends a 4-command pipeline at the canonical /pipeline endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([{ result: 0 }, { result: 0 }, { result: 1 }, { result: 1 }]), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const limiter = buildLimiter(fetchImpl);
    // UUID-shape segment so the normalizer collapses it to :id.
    await limiter.isLimited("user-1", "/api/novels/abc12345-def0-4111-8222-deadbeefcafe/chapters/draft");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://upstash.example/pipeline");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    const body = JSON.parse(calls[0].init.body as string) as unknown[][];
    expect(body).toHaveLength(4);
    expect(body[0][0]).toBe("ZREMRANGEBYSCORE");
    expect(body[1][0]).toBe("ZCARD");
    expect(body[2][0]).toBe("ZADD");
    expect(body[3][0]).toBe("PEXPIRE");
    expect(body[1][1]).toBe("rl:/api/novels/:id/chapters/draft:user-1");
  });

  it("reset issues a DEL command", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([{ result: 1 }]), { status: 200 });
    }) as unknown as typeof fetch;
    const limiter = buildLimiter(fetchImpl);
    await limiter.reset("user-1", "/api/novels/x/chapters/draft");

    const body = JSON.parse(calls[0].init.body as string) as unknown[][];
    expect(body[0][0]).toBe("DEL");
  });
});

describe("limiter selection", () => {
  beforeEach(() => {
    _setLimiterForTesting(null);
    delete process.env.E2E_AUTH_BYPASS;
    delete process.env.E2E_DISABLE_RATE_LIMIT;
    delete process.env.RATE_LIMIT_STORE;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("can swap in a custom limiter via _setLimiterForTesting", async () => {
    const stub: ReturnType<typeof MemoryRateLimiter.prototype.isLimited> extends Promise<boolean>
      ? import("./rateLimit").RateLimiter
      : never = {
      isLimited: async () => true,
      reset: async () => undefined,
    };
    _setLimiterForTesting(stub);
    expect(await isRateLimited("u", "/anything")).toBe(true);
    _setLimiterForTesting(null);
  });

  it("can disable limits only for the explicit E2E auth bypass environment", async () => {
    process.env.E2E_AUTH_BYPASS = "1";
    process.env.E2E_DISABLE_RATE_LIMIT = "1";

    for (let i = 0; i < 20; i++) {
      expect(await isRateLimited("e2e-user", "/api/onboarding/sessions/x/bible")).toBe(false);
    }
  });
});
