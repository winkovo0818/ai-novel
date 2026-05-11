/**
 * Check whether a user can access an owner-scoped resource.
 *
 * - If the resource has an owner, only that owner can access it.
 * - If the resource has no owner (anonymous/legacy), access is denied
 *   by default. Anonymous onboarding sessions are claimed via the
 *   dedicated authorizeOnboardingSession flow, not through this helper.
 * - Unauthenticated users are always denied.
 */
export function canAccessOwnerResource(
  ownerId: string | null | undefined,
  userId: string | null,
): boolean {
  if (!userId) return false;
  if (!ownerId) return false;
  return ownerId === userId;
}
