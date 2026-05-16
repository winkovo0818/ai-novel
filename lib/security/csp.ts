const DEFAULT_CONNECT_ORIGINS = process.env.NEXT_PUBLIC_CONNECT_ORIGINS;

interface BuildContentSecurityPolicyOptions {
  isDev?: boolean;
  connectOrigins?: string;
}

function compactPolicy(policy: string): string {
  return policy.replace(/\s{2,}/g, " ").trim();
}

function originFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function parseConnectOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => originFromUrl(entry.trim()))
    .filter((entry): entry is string => Boolean(entry));
}

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(raw);
}

export function buildContentSecurityPolicy(
  nonce: string,
  {
    isDev = process.env.NODE_ENV !== "production",
    connectOrigins = DEFAULT_CONNECT_ORIGINS,
  }: BuildContentSecurityPolicyOptions = {},
): string {
  const connectSrc = [
    "'self'",
    ...parseConnectOrigins(connectOrigins),
    isDev ? "http://localhost:*" : undefined,
    isDev ? "ws://localhost:*" : undefined,
  ].filter(Boolean);

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""}`,
    isDev ? undefined : "style-src-attr 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    isDev ? undefined : "upgrade-insecure-requests",
  ].filter(Boolean);

  return compactPolicy(directives.join("; "));
}

export function buildCspRequestHeaders(headers: Headers, nonce: string, csp: string): Headers {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return requestHeaders;
}

export function applyCspResponseHeaders(response: Response, nonce: string, csp: string): void {
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", csp);
}
