import { prisma } from "@/lib/db";
import type { MetricFamily } from "./prometheus";

/**
 * Collect application metrics for the Prometheus exposition endpoint.
 *
 * Strategy:
 *   - Counters (requests, tokens, cost, jobs) are computed as all-time
 *     sums from Postgres tables (LlmUsage, BackgroundJob). Prometheus
 *     `rate()` derives per-interval rates at query time, so a monotonic
 *     all-time total is the correct counter semantics — and a fresh
 *     serverless instance returns the same number, no in-memory state.
 *   - Gauges (active jobs, novel/chapter counts) reflect the *current*
 *     row count.
 *
 * All queries run in parallel to keep scrape latency well under a second.
 */
export async function collectMetrics(): Promise<MetricFamily[]> {
  const [
    llmByStatus,
    llmByAgent,
    llmCost24h,
    llmCost30d,
    llmP95ByRoute,
    moderationDecisions24h,
    moderationReviewQueue,
    jobsByStatus,
    jobsActive,
    novelCount,
    chaptersByStatus,
  ] = await Promise.all([
    prisma.llmUsage.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.llmUsage.groupBy({
      by: ["agent"],
      _count: { _all: true },
      _sum: { token_in: true, token_out: true, cost_cny: true },
    }),
    prisma.llmUsage.aggregate({
      where: {
        status: "ok",
        created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _sum: { cost_cny: true },
    }),
    prisma.llmUsage.aggregate({
      where: {
        status: "ok",
        created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { cost_cny: true },
    }),
    prisma.$queryRaw<Array<{ route: string; p95_ms: number | bigint }>>`
      SELECT
        route,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY took_ms) AS p95_ms
      FROM "LlmUsage"
      WHERE took_ms IS NOT NULL
        AND created_at >= NOW() - INTERVAL '1 hour'
      GROUP BY route
    `,
    prisma.moderationAudit.groupBy({
      by: ["source", "action", "outcome"],
      where: {
        created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
    prisma.moderationAudit.groupBy({
      by: ["review_status"],
      // Bound the scan with the leading column of @@index([review_status,
      // created_at]) — without a window this becomes a full-table seq scan
      // as the 90-day retention grows. 30d matches the operational horizon
      // for unresolved review backlog; older rows fall off the audit dashboard.
      where: {
        created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
    prisma.backgroundJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.backgroundJob.count({
      where: { status: { in: ["pending", "running"] } },
    }),
    prisma.novel.count(),
    prisma.chapterDraft.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const families: MetricFamily[] = [];

  families.push({
    name: "ai_novel_llm_requests_total",
    help: "Total LLM requests by status (all-time counter).",
    type: "counter",
    samples: llmByStatus.map((row) => ({
      labels: { status: row.status },
      value: row._count._all,
    })),
  });

  // Per-agent volume splits — agent may be null in legacy rows; bucket as
  // 'unknown' to keep a stable label set.
  families.push({
    name: "ai_novel_llm_requests_by_agent_total",
    help: "Total LLM requests by agent (all-time counter).",
    type: "counter",
    samples: llmByAgent.map((row) => ({
      labels: { agent: row.agent ?? "unknown" },
      value: row._count._all,
    })),
  });

  families.push({
    name: "ai_novel_llm_tokens_total",
    help: "Total LLM tokens by direction and agent (all-time counter).",
    type: "counter",
    samples: llmByAgent.flatMap((row) => [
      {
        labels: { direction: "in", agent: row.agent ?? "unknown" },
        value: row._sum.token_in ?? 0,
      },
      {
        labels: { direction: "out", agent: row.agent ?? "unknown" },
        value: row._sum.token_out ?? 0,
      },
    ]),
  });

  families.push({
    name: "ai_novel_llm_cost_cny_total",
    help: "Total LLM cost in CNY by agent (all-time counter).",
    type: "counter",
    samples: llmByAgent.map((row) => ({
      labels: { agent: row.agent ?? "unknown" },
      value: Number((row._sum.cost_cny ?? 0).toFixed(6)),
    })),
  });

  families.push({
    name: "ai_novel_llm_cost_cny_window",
    help: "LLM cost in CNY over recent alerting windows.",
    type: "gauge",
    samples: [
      {
        labels: { window: "24h" },
        value: Number((llmCost24h._sum.cost_cny ?? 0).toFixed(6)),
      },
      {
        labels: { window: "30d" },
        value: Number((llmCost30d._sum.cost_cny ?? 0).toFixed(6)),
      },
    ],
  });

  families.push({
    name: "ai_novel_llm_took_ms_p95",
    help: "LLM request p95 latency in milliseconds by route over the last hour.",
    type: "gauge",
    samples: llmP95ByRoute.map((row) => ({
      labels: { route: row.route, window: "1h" },
      value: Number(row.p95_ms),
    })),
  });

  families.push({
    name: "ai_novel_moderation_decisions_total",
    help: "Moderation decisions over recent alerting windows.",
    type: "gauge",
    samples: moderationDecisions24h.map((row) => ({
      labels: {
        source: row.source,
        action: row.action,
        outcome: row.outcome,
        window: "24h",
      },
      value: row._count._all,
    })),
  });

  families.push({
    name: "ai_novel_moderation_review_queue",
    help: "Current moderation audit rows by review status.",
    type: "gauge",
    samples: moderationReviewQueue.map((row) => ({
      labels: { review_status: row.review_status },
      value: row._count._all,
    })),
  });

  families.push({
    name: "ai_novel_jobs_total",
    help: "Total background jobs by status (all-time counter).",
    type: "counter",
    samples: jobsByStatus.map((row) => ({
      labels: { status: row.status },
      value: row._count._all,
    })),
  });

  families.push({
    name: "ai_novel_jobs_active",
    help: "Background jobs currently pending or running.",
    type: "gauge",
    samples: [{ value: jobsActive }],
  });

  families.push({
    name: "ai_novel_novels_total",
    help: "Total novels (current).",
    type: "gauge",
    samples: [{ value: novelCount }],
  });

  families.push({
    name: "ai_novel_chapters_total",
    help: "Chapter drafts by status (current gauge).",
    type: "gauge",
    samples: chaptersByStatus.map((row) => ({
      labels: { status: row.status },
      value: row._count._all,
    })),
  });

  return families;
}
