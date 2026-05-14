# Observability

## Sentry

Server-side unhandled Next.js request errors are reported through `instrumentation.ts`.
No Sentry SDK package is required: set `SENTRY_DSN`, and the app sends Sentry
envelopes directly from `lib/observability/sentry.ts`.

Optional environment labels:

- `SENTRY_ENVIRONMENT` — deployment name, defaults to `NODE_ENV`.
- `SENTRY_RELEASE` — release identifier, defaults to `VERCEL_GIT_COMMIT_SHA`.

## Prometheus / Grafana

`/api/metrics` exposes Prometheus text metrics and requires:

- `METRICS_TOKEN` — bearer token used by the Prometheus scrape job.

The collector includes alerting gauges for:

- `ai_novel_llm_cost_cny_window{window="24h|30d"}`
- `ai_novel_llm_took_ms_p95{route,window="1h"}`
- `ai_novel_moderation_decisions_total{source,action,outcome,window="24h"}`
- `ai_novel_moderation_review_queue{review_status}`

Grafana alert provisioning lives in:

- `observability/grafana/ai-novel-alert-rules.yaml`

The bundled rules cover LLM fail rate > 5%, draft SSE p95 > 8s, 24h LLM cost
above 40 CNY, and new failed background jobs. Tune the thresholds per
environment before production import.

## Moderation Decisions

`moderateContent()` emits a structured `moderation.decision` log and writes a
best-effort `ModerationAudit` row when content is blocked or when the
moderation service falls back to a failure mode. Clean allowed content is not
logged or persisted to keep volume low.

`ModerationAudit` stores decision metadata plus `text_hash` and `text_chars`;
it does not store the moderated text itself.

Decision fields:

- `route` — API route that requested moderation.
- `source` — `local_keyword`, `llm`, or `failure_mode`.
- `action` — `block`, `allow`, or `review`.
- `outcome` — `blocked` or `allowed`.
- `mode` — present for failure-mode decisions.
- `matched_pattern` — present for local keyword blocks; telemetry only.

Admins can review persisted rows at `/admin/moderation`. The page lists the
pending queue by default and supports marking decisions as confirmed,
false-positive, or ignored. Review metadata is stored on `ModerationAudit` as
`review_status`, `reviewed_by`, `reviewed_at`, and `review_note`.

Use these logs and rows to build review dashboards for block volume, fail-open
volume, queue size, and route-level moderation hot spots. `/api/metrics` exposes
the 24h decision counts plus current queue size by review status for
Prometheus/Grafana.

Retention is handled by `GET /api/cron/moderation-audits/cleanup`, protected by
`CRON_SECRET` bearer auth and scheduled in `vercel.json` at `20 3 * * *`.
Default retention is 90 days; override with `MODERATION_AUDIT_RETENTION_MS`.
