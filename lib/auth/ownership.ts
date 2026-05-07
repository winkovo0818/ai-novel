export function canAccessOwnerResource(ownerId: string | null | undefined, userId: string | null) {
  return !ownerId || ownerId === userId;
}
