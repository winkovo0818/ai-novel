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
- `ai_novel_llm_success_rate{window="15m"}`
- `ai_novel_llm_took_ms_p95{route,window="1h"}`
- `ai_novel_moderation_decisions_total{source,action,outcome,window="24h"}`
- `ai_novel_moderation_review_queue{review_status}`
- `ai_novel_moderation_block_rate{window="15m"}`
- `ai_novel_exports_total{scope,status,window="24h"}`
- `ai_novel_exports_failure_rate{window="24h"}`
- `ai_novel_jobs_backlog{status="pending|running|failed"}`
- `ai_novel_jobs_oldest_age_seconds{status="pending|running|failed"}`
- `ai_novel_jobs_failure_rate{window="15m"}`
- `ai_novel_draft_sessions_active{window="15m"}`
- `ai_novel_draft_sessions_failure_rate{window="15m"}`

Grafana alert provisioning lives in:

- `lib/observability/grafana/ai-novel-alert-rules.yaml`

The bundled rules cover LLM fail rate > 5%, draft SSE p95 > 8s, 24h LLM cost
above 40 CNY, draft SSE failure/stuck sessions, job backlog and failure
signals, moderation fallback/block/review spikes, and export failure ratio.
Tune the thresholds per environment before production import.

Recommended provisioning check:

- Place the file under Grafana provisioning `alerting/` and restart Grafana, or
  import it through the API used by your deployment.
- Confirm the `AI Novel` folder appears and all rule UIDs start with
  `ai-novel-`.
- In Grafana Explore, run the metric query from a new rule before enabling its
  notification route.

## Alert Runbook

Use `/api/metrics` as the source of truth first. A missing `METRICS_TOKEN`
returns `503`; a missing or wrong bearer token returns `401`.

### LLM failure or low success rate

Triggered by `ai-novel-llm-fail-rate-high` or
`ai-novel-llm-success-rate-low`.

- Check `ai_novel_llm_requests_total{status="err"}` and
  `ai_novel_llm_requests_by_agent_total` to locate the affected agent.
- Inspect recent `/admin/ai-calls` rows for provider error messages, model
  names, route, and user/novel concentration.
- If errors are quota-related, check `/api/usage` details and the daily,
  monthly, and single-request limits.
- If one route dominates, reproduce it with `LLM_MOCK=1` first, then with the
  configured provider and a low-risk test novel.

### Draft SSE latency, failures, or stuck sessions

Triggered by `ai-novel-draft-sse-p95-high`,
`ai-novel-draft-sse-failure-rate-high`, or
`ai-novel-draft-sse-active-high`.

- Check `ai_novel_llm_took_ms_p95{route="/api/novels/[id]/chapters/draft"}`,
  `ai_novel_draft_sessions_failure_rate`, and
  `ai_novel_draft_sessions_active`.
- In `/admin/ai-calls`, compare prompt size, token output, model, and route for
  failed draft calls.
- Review application logs for draft `sessionId`, stream aborts, moderation
  blocks, or provider timeouts.
- If active sessions stay high while request volume is low, verify clients can
  receive SSE and that aborted streams mark sessions as failed.

### Background job backlog or failures

Triggered by `ai-novel-background-job-backlog-high`,
`ai-novel-background-job-backlog-stale`,
`ai-novel-background-job-failures`, or
`ai-novel-background-job-failure-rate-high`.

- Check `ai_novel_jobs_backlog`, `ai_novel_jobs_oldest_age_seconds`, and
  `ai_novel_jobs_failure_rate`.
- Confirm `npm run jobs:worker` is running in the target environment and can
  reach the database.
- If `pending` age grows, inspect worker logs for dequeue errors or lock
  contention.
- If `failed` grows, open the novel job list, inspect the failure reason, and
  retry only after the underlying route/model/database issue is fixed.

### Moderation fallback, block spike, or review backlog

Triggered by `ai-novel-moderation-fallback-detected`,
`ai-novel-moderation-block-rate-high`, or
`ai-novel-moderation-review-queue-high`.

- Check `ai_novel_moderation_decisions_total{source="failure_mode"}` to see
  whether the moderation provider is failing and the app is using fallback
  behavior.
- Check `ai_novel_moderation_block_rate` plus route-level structured logs for
  sudden prompt/template regressions or a real unsafe-content spike.
- Open `/admin/moderation` and review pending rows; mark false positives so the
  queue does not hide new incidents.
- If fallback is unexpected, verify moderation model configuration, provider
  credentials, network egress, and the current failure-mode setting.

### Export failure rate

Triggered by `ai-novel-export-failure-rate-high`.

- Check `ai_novel_exports_total{scope,status,window="24h"}` to determine
  whether failures are novel exports, profile exports, or both.
- Inspect export route logs for `INVALID_FORMAT`, `INVALID_RANGE`,
  `INVALID_INCLUDE_BIBLE`, `MODERATION_BLOCKED`, or writer errors.
- Reproduce with the same export format and range on a test account. For ZIP,
  EPUB, or DOCX failures, verify the formatter can handle empty chapters,
  deleted novels, and missing Bible metadata.
- If failures are mostly moderation blocks, follow the moderation runbook before
  changing export code.

## Background Jobs

Jobs are persisted in `BackgroundJob` and consumed by `npm run jobs:worker`.
The app API only enqueues work; it does not run handlers inline.

Useful checks when memory refresh looks stuck:

- Query `/api/metrics` and inspect `ai_novel_jobs_backlog` plus
  `ai_novel_jobs_oldest_age_seconds`.
- If `pending` age grows, confirm the worker service is running and can reach
  the database.
- If `failed` backlog or `ai_novel_jobs_failure_rate` rises, inspect recent
  jobs through `GET /api/novels/:id/jobs` and retry failed rows from the UI.
- If jobs stay `running` past the stale timeout, the worker sweep will requeue
  them and increment the stale-running log line.

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
