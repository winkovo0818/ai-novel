ALTER TABLE "Novel" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "Novel_user_id_deleted_at_idx" ON "Novel"("user_id", "deleted_at");
