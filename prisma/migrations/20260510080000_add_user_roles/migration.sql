-- DB-driven role grants. Composite PK (user_id, role) lets a user hold
-- multiple roles without schema churn (Phase A: 'admin'; later phases may
-- add e.g. 'embedding_admin'). user_id is not a FK because Supabase
-- auth.users lives outside Prisma — dangling rows must be cleaned up
-- separately when users are deleted in Supabase.
CREATE TABLE "UserRole" (
    "user_id"    TEXT NOT NULL,
    "role"       TEXT NOT NULL,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("user_id", "role")
);

CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");
