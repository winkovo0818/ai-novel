import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/utils/supabase/auth";
import type { OnboardingSession } from "@prisma/client";

export type OnboardingAccessResult =
  | { ok: true; userId: string; session: OnboardingSession }
  | { ok: false; status: number; code: string; message: string };

/**
 * Authorize a request against an OnboardingSession:
 * - Caller must be authenticated.
 * - Session must exist.
 * - If session.user_id is set, it must equal the caller's user id.
 * - If session.user_id is null (legacy anonymous session), claim it for the caller
 *   via the explicit claim flow.
 *
 * Always returns a discriminated union — callers should branch on `ok`.
 */
export async function authorizeOnboardingSession(
  sessionId: string,
): Promise<OnboardingAccessResult> {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Login required" };
  }

  const session = await prisma.onboardingSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return {
      ok: false,
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "Onboarding session not found",
    };
  }

  if (session.user_id && session.user_id !== userId) {
    return {
      ok: false,
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "Onboarding session not found",
    };
  }

  if (!session.user_id) {
    // Explicit claim: anonymous onboarding sessions can be claimed by any
    // authenticated user, but only through this controlled onboarding flow.
    const claimed = await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { user_id: userId },
    });
    return { ok: true, userId, session: claimed };
  }

  return { ok: true, userId, session };
}
