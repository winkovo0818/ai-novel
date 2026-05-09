import { describe, expect, it } from "vitest";

import { jsonError, jsonOk } from "./json";

describe("jsonError", () => {
  it("returns the canonical error envelope and status", async () => {
    const res = jsonError("INVALID_INPUT", "bad request", false, 400);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: { code: "INVALID_INPUT", message: "bad request", retryable: false },
    });
  });

  it("forwards extra response init headers", async () => {
    const res = jsonError("RATE_LIMITED", "slow down", true, 429, {
      headers: { "Retry-After": "30" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });
});

describe("jsonOk", () => {
  it("wraps payload in {ok:true,data}", async () => {
    const res = jsonOk({ id: "abc" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { id: "abc" } });
  });
});
