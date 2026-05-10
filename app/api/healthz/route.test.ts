import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const $queryRaw = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

// $queryRaw is invoked twice per request (db check + pgvector). We tag each
// call by the SQL text the route emits via a Prisma TemplateStringsArray.
function classifyCall(strings: TemplateStringsArray | string): "db" | "pgvector" | "other" {
  const text = Array.isArray(strings) ? strings.join("") : String(strings);
  if (text.includes("pg_extension")) return "pgvector";
  if (text.includes("SELECT 1")) return "db";
  return "other";
}

function setupQueryRaw(answers: { db?: "ok" | Error; pgvector?: { installed: boolean } | Error }) {
  $queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const kind = classifyCall(strings);
    if (kind === "db") {
      if (answers.db instanceof Error) return Promise.reject(answers.db);
      return Promise.resolve([{ "?column?": 1 }]);
    }
    if (kind === "pgvector") {
      const v = answers.pgvector;
      if (v instanceof Error) return Promise.reject(v);
      return Promise.resolve([{ installed: v?.installed ?? true }]);
    }
    return Promise.resolve([]);
  });
}

describe("GET /api/healthz", () => {
  it("returns 200 with ok=true when DB + pgvector + Supabase env all pass", async () => {
    setupQueryRaw({ db: "ok", pgvector: { installed: true } });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.checks.db.ok).toBe(true);
    expect(json.checks.pgvector.ok).toBe(true);
    expect(json.checks.supabase.ok).toBe(true);
    expect(typeof json.checks.db.took_ms).toBe("number");
  });

  it("returns 503 with code=PGVECTOR_MISSING when the extension isn't installed", async () => {
    setupQueryRaw({ db: "ok", pgvector: { installed: false } });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.checks.pgvector.ok).toBe(false);
    expect(json.checks.pgvector.code).toBe("PGVECTOR_MISSING");
    // Other checks should still report their state — failures are independent.
    expect(json.checks.db.ok).toBe(true);
    expect(json.checks.supabase.ok).toBe(true);
  });

  it("returns 503 with code=DB_UNREACHABLE when SELECT 1 throws", async () => {
    setupQueryRaw({ db: new Error("connection refused"), pgvector: { installed: true } });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.checks.db.ok).toBe(false);
    expect(json.checks.db.code).toBe("DB_UNREACHABLE");
    expect(json.checks.db.message).toContain("connection refused");
  });

  it("flags Supabase config holes without hitting the network", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    setupQueryRaw({ db: "ok", pgvector: { installed: true } });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.checks.supabase.ok).toBe(false);
    expect(json.checks.supabase.code).toBe("SUPABASE_CONFIG_MISSING");
    // No extra DB calls beyond the two real probes.
    expect($queryRaw).toHaveBeenCalledTimes(2);
  });

  it("classifies timeout-flavored errors with a _TIMEOUT suffix", async () => {
    setupQueryRaw({
      db: new Error("Query timed out after 1500ms"),
      pgvector: { installed: true },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();

    expect(json.checks.db.code).toBe("DB_UNREACHABLE_TIMEOUT");
  });

  it("truncates very long error messages so the public payload stays bounded", async () => {
    setupQueryRaw({ db: new Error("x".repeat(500)), pgvector: { installed: true } });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();

    expect(json.checks.db.message.length).toBeLessThanOrEqual(200);
  });
});
