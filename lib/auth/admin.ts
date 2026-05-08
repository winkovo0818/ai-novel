import { createClient } from "@/utils/supabase/server";

/**
 * Result of an admin check. We split UNAUTHORIZED vs FORBIDDEN so callers
 * can map them to the correct HTTP status (401 vs 403).
 */
export type AdminCheckResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; reason: "UNAUTHORIZED" }
  | { ok: false; reason: "FORBIDDEN"; userId: string; email: string | null };

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Decide whether a user is an admin based on env-configured allowlists.
 * - ADMIN_USER_IDS: comma-separated Supabase user UUIDs
 * - ADMIN_EMAILS: comma-separated emails (case-insensitive)
 */
export function isAdminUser(userId: string, email: string | null): boolean {
  const ids = parseList(process.env.ADMIN_USER_IDS);
  if (ids.includes(userId)) return true;
  if (email) {
    const lower = email.toLowerCase();
    const emails = parseList(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());
    if (emails.includes(lower)) return true;
  }
  return false;
}

export async function checkAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, reason: "UNAUTHORIZED" };
  }
  const userId = data.user.id;
  const email = data.user.email ?? null;
  if (!isAdminUser(userId, email)) {
    return { ok: false, reason: "FORBIDDEN", userId, email };
  }
  return { ok: true, userId, email };
}

/**
 * Standard JSON response for non-admin callers in API routes.
 * Returns null when the caller IS an admin (so the route can continue).
 */
export async function adminGuardResponse(): Promise<Response | null> {
  const result = await checkAdmin();
  if (result.ok) return null;
  if (result.reason === "UNAUTHORIZED") {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }
  return Response.json(
    { ok: false, error: { code: "FORBIDDEN", message: "Admin access required", retryable: false } },
    { status: 403 },
  );
}
