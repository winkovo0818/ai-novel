import { collectMetrics } from "@/lib/metrics/collector";
import { formatMetrics } from "@/lib/metrics/prometheus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — Prometheus text exposition.
 *
 * Auth: HTTP Bearer token compared against METRICS_TOKEN env. If the env
 * is unset the endpoint returns 503; we don't ship an unauthenticated
 * metrics endpoint by accident in production. If the env is set but the
 * caller's token mismatches (or is missing), we return 401 — matches
 * standard prom-exporter conventions.
 *
 * Configure a Prometheus scrape job with `bearer_token` set to the same
 * value to start ingesting.
 */
export async function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) {
    return new Response("metrics endpoint disabled (METRICS_TOKEN unset)", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  // Constant-time compare to keep the endpoint immune to timing oracles.
  // The strings may differ in length, so guard that path first.
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return new Response("unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const families = await collectMetrics();
    return new Response(formatMetrics(families), {
      status: 200,
      headers: {
        // The 0.0.4 text format is what Prometheus historically scrapes.
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return new Response(`# metrics collection failed: ${message.slice(0, 200)}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
