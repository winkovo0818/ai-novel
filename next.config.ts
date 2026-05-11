import type { NextConfig } from "next";
import path from "node:path";

/**
 * Baseline production security headers.
 *
 * What we set vs what we skip:
 *
 *   ✅ X-Content-Type-Options — block MIME sniffing.
 *   ✅ X-Frame-Options — refuse to be framed (clickjacking).
 *      `frame-ancestors 'none'` in CSP would be the modern equivalent
 *      but X-Frame-Options is still respected by old browsers.
 *   ✅ Referrer-Policy — strip URL path / query when crossing origins.
 *   ✅ Permissions-Policy — disable APIs the app never asks for.
 *   ✅ Strict-Transport-Security — only meaningful over HTTPS, but
 *      browsers ignore the header on plain HTTP so it's harmless to
 *      set unconditionally; production reverse proxies (Vercel,
 *      Cloudflare) terminate TLS so this kicks in there.
 *
 *   ❌ Content-Security-Policy — Next.js 15 hydration injects inline
 *      scripts. A correct CSP needs nonce middleware; a lazy
 *      `'unsafe-inline'` would shred the protection. Tracked as a
 *      separate phase — see HEALTH.md.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        // Apply to every route. Path-level overrides (e.g. allowing a
        // specific page to be framed) should be added as additional
        // entries with their own `source`.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
