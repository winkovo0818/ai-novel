export type LogLevel = "info" | "warn" | "error";

export type LogFieldValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogFieldValue>;

export function errorMessage(err: unknown, fallback = "unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return String(err);
  } catch {
    return fallback;
  }
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const payload: Record<string, string | number | boolean | null> = {
    ts: new Date().toISOString(),
    level,
    event,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, fields?: LogFields): void {
  logEvent("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  logEvent("warn", event, fields);
}

export function logError(event: string, fields?: LogFields): void {
  logEvent("error", event, fields);
}
