import {
  applyCspResponseHeaders,
  buildContentSecurityPolicy,
  buildCspRequestHeaders,
  createCspNonce,
} from "@/lib/security/csp";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const publicPaths = ["/", "/login", "/signup", "/reset-password", "/update-password"];
const apiPublicPrefixes = ["/api/healthz", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  if (publicPaths.includes(pathname)) return true;
  if (apiPublicPrefixes.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith("/_next")) return true;
  return false;
}

const { auth } = NextAuth({ ...authConfig, providers: [] });

export default auth((request) => {
  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = buildCspRequestHeaders(request.headers, nonce, csp);
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const hasE2eUser = process.env.E2E_AUTH_BYPASS === "1" && process.env.E2E_TEST_USER_ID;
  const user = hasE2eUser ? { id: process.env.E2E_TEST_USER_ID } : request.auth?.user;

  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    response = NextResponse.redirect(url);
  } else if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    response = NextResponse.redirect(url);
  }

  applyCspResponseHeaders(response, nonce, csp);
  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
