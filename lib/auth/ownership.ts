/**
 * Check whether a user can access an owner-scoped resource.
 *
 * - If the resource has an owner, only that owner can access it.
 * - If the resource has no owner (anonymous/legacy), any authenticated user
 *   can access it (they may claim it later).
 * - Unauthenticated users are always denied.
 */
export function canAccessOwnerResource(
  ownerId: string | null | undefined,
  userId: string | null,
): boolean {
  if (!userId) return false;
  if (!ownerId) return true;
  return ownerId === userId;
}
