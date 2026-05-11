import { beforeEach, describe, expect, it, vi } from "vitest";

const collectMetrics = vi.fn();

vi.mock("@/lib/metrics/collector", () => ({
  collectMetrics,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/metrics", { headers });
}

describe("GET /api/metrics", () => {
  it("returns 503 when METRICS_TOKEN is unset", async () => {
    vi.stubEnv("METRICS_TOKEN", "");
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer anything" }));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("METRICS_TOKEN unset");
    expect(collectMetrics).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns 401 when the bearer token is missing", async () => {
    vi.stubEnv("METRICS_TOKEN", "secret");
    const { GET } = await import("./route");

    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
    expect(collectMetrics).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns 401 when the bearer token is wrong", async () => {
    vi.stubEnv("METRICS_TOKEN", "secret");
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer wrong-value" }));
    expect(res.status).toBe(401);
    expect(collectMetrics).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns 401 when the auth header is not a Bearer scheme", async () => {
    vi.stubEnv("METRICS_TOKEN", "secret");
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Basic c2VjcmV0" }));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("emits Prometheus text on a valid bearer token", async () => {
    vi.stubEnv("METRICS_TOKEN", "secret");
    collectMetrics.mockResolvedValue([
      {
        name: "ai_novel_novels_total",
        help: "Total novels",
        type: "gauge",
        samples: [{ value: 5 }],
      },
    ]);
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer secret" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("# HELP ai_novel_novels_total");
    expect(body).toContain("ai_novel_novels_total 5");
    expect(collectMetrics).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("returns 500 with a sanitized comment when collection throws", async () => {
    vi.stubEnv("METRICS_TOKEN", "secret");
    collectMetrics.mockRejectedValue(new Error("db down"));
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer secret" }));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("db down");
    vi.unstubAllEnvs();
  });
});
