import { z } from "zod";

/**
 * Roles the API will accept on grant/revoke. Phase A: 'admin' only.
 * Phase B will extend with 'embedding_admin' once that capability ships.
 */
export const ALLOWED_ROLES = ["admin"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export const RoleSchema = z.enum(ALLOWED_ROLES);

export const GrantRoleSchema = z.object({
  role: RoleSchema,
});
