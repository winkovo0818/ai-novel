import { errorMessage, type LogFieldValue } from "./logger";

type SentryLevel = "fatal" | "error" | "warning" | "info" | "debug";

interface SentryDsn {
  dsn: string;
  envelopeUrl: string;
}

export interface CaptureExceptionContext {
  level?: SentryLevel;
  source?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, LogFieldValue>;
}

export interface CaptureResult {
  sent: boolean;
  eventId?: string;
  reason?: "disabled" | "invalid_dsn" | "network_error" | "http_error";
  status?: number;
}

function parseDsn(raw: string | undefined): SentryDsn | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const projectId = url.pathname.split("/").filter(Boolean).at(-1);
    if (!url.username || !projectId || !/^https?:$/.test(url.protocol)) {
      return null;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    pathParts.pop();
    const basePath = pathParts.length > 0 ? `/${pathParts.join("/")}` : "";
    return {
      dsn: raw,
      envelopeUrl: `${url.protocol}//${url.host}${basePath}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

function envOrUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function cleanRecord(
  values: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function exceptionPayload(err: unknown) {
  if (!(err instanceof Error)) return undefined;
  return {
    values: [
      {
        type: err.name || "Error",
        value: err.message,
      },
    ],
  };
}

function randomEventId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, "");
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export async function captureException(
  err: unknown,
  context: CaptureExceptionContext = {},
): Promise<CaptureResult> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!process.env.SENTRY_DSN) return { sent: false, reason: "disabled" };
  if (!dsn) return { sent: false, reason: "invalid_dsn" };

  const eventId = randomEventId();
  const timestamp = new Date().toISOString();
  const tags = cleanRecord({
    source: context.source,
    route: context.route,
    method: context.method,
    status_code: context.statusCode,
    ...context.tags,
  });
  const extra = cleanRecord({
    ...context.extra,
    stack: err instanceof Error ? err.stack?.slice(0, 5000) : undefined,
  });

  const event = cleanRecord({
    event_id: eventId,
    timestamp,
    platform: "javascript",
    level: context.level ?? "error",
    environment: envOrUndefined(process.env.SENTRY_ENVIRONMENT) ?? process.env.NODE_ENV ?? "development",
    release: envOrUndefined(process.env.SENTRY_RELEASE) ?? envOrUndefined(process.env.VERCEL_GIT_COMMIT_SHA),
    server_name: envOrUndefined(process.env.VERCEL_REGION),
    message: errorMessage(err),
  }) as Record<string, unknown>;

  if (Object.keys(tags).length > 0) event.tags = tags;
  if (Object.keys(extra).length > 0) event.extra = extra;
  const exception = exceptionPayload(err);
  if (exception) event.exception = exception;

  const envelope = [
    JSON.stringify({
      dsn: dsn.dsn,
      sent_at: timestamp,
      sdk: { name: "ai-novel-minimal-sentry", version: "1.0.0" },
    }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n") + "\n";

  try {
    const res = await fetch(dsn.envelopeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });
    if (!res.ok) return { sent: false, reason: "http_error", status: res.status };
    return { sent: true, eventId };
  } catch {
    return { sent: false, reason: "network_error" };
  }
}

export const sentryForTest = {
  parseDsn,
  randomEventId,
};
