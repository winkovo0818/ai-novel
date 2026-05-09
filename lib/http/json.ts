/**
 * Shared API response helpers.
 *
 * Every route handler used to define its own copy of jsonError. Centralising
 * keeps the shape consistent and lets us evolve (e.g. add Retry-After headers,
 * structured logs, or an ApiErrorCode union) in one place.
 */

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface ApiOkBody<T> {
  ok: true;
  data: T;
}

export function jsonError(
  code: string,
  message: string,
  retryable: boolean,
  status: number,
  init?: ResponseInit,
): Response {
  return Response.json(
    { ok: false, error: { code, message, retryable } } satisfies ApiErrorBody,
    { ...init, status },
  );
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data } satisfies ApiOkBody<T>, init);
}
