CREATE TABLE "AdminAudit" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAudit_actor_user_id_idx" ON "AdminAudit"("actor_user_id");
CREATE INDEX "AdminAudit_action_idx" ON "AdminAudit"("action");
CREATE INDEX "AdminAudit_target_type_target_id_idx" ON "AdminAudit"("target_type", "target_id");
CREATE INDEX "AdminAudit_created_at_idx" ON "AdminAudit"("created_at");
