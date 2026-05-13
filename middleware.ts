import { type NextRequest } from "next/server";
import {
  applyCspResponseHeaders,
  buildContentSecurityPolicy,
  buildCspRequestHeaders,
  createCspNonce,
} from "@/lib/security/csp";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = buildCspRequestHeaders(request.headers, nonce, csp);
  const response = await updateSession(request, requestHeaders);
  applyCspResponseHeaders(response, nonce, csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
