import { describe, expect, it, vi } from "vitest";

import {
  applyCspResponseHeaders,
  buildContentSecurityPolicy,
  buildCspRequestHeaders,
  createCspNonce,
} from "./csp";

describe("content security policy helpers", () => {
  it("builds a nonce-based production CSP without unsafe-inline", () => {
    const policy = buildContentSecurityPolicy("nonce-1", {
      isDev: false,
      supabaseUrl: "https://project.supabase.co",
    });

    expect(policy).toContain("script-src 'self' 'nonce-nonce-1' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'nonce-nonce-1'");
    expect(policy).toContain("style-src-attr 'none'");
    expect(policy).toContain("connect-src 'self' https://project.supabase.co wss://project.supabase.co");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("allows local dev sockets and eval only outside production", () => {
    const policy = buildContentSecurityPolicy("dev-nonce", { isDev: true });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("http://localhost:*");
    expect(policy).toContain("ws://localhost:*");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("adds CSP and nonce to forwarded request headers", () => {
    const headers = buildCspRequestHeaders(new Headers({ accept: "text/html" }), "n-1", "policy");

    expect(headers.get("accept")).toBe("text/html");
    expect(headers.get("x-nonce")).toBe("n-1");
    expect(headers.get("Content-Security-Policy")).toBe("policy");
  });

  it("adds CSP and nonce to response headers", () => {
    const response = new Response("ok");

    applyCspResponseHeaders(response, "n-1", "policy");

    expect(response.headers.get("x-nonce")).toBe("n-1");
    expect(response.headers.get("Content-Security-Policy")).toBe("policy");
  });

  it("creates a base64 nonce from crypto randomness", () => {
    const getRandomValues = vi.spyOn(crypto, "getRandomValues");

    const nonce = createCspNonce();

    expect(getRandomValues).toHaveBeenCalled();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(nonce.length).toBeGreaterThan(16);
  });
});
