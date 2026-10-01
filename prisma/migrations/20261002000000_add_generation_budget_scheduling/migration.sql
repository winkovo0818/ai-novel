ALTER TABLE "NovelGenerationRun"
  ADD COLUMN "cost_day" TEXT,
  ADD COLUMN "daily_cost_cny_spent" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("daily_cost_cny_spent" >= 0),
  ADD COLUMN "pause_reason" TEXT,
  ADD COLUMN "resume_after" TIMESTAMP(3),
  ADD COLUMN "last_progress_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "NovelGenerationRun" SET "last_progress_at" = "updated_at";
CREATE INDEX "NovelGenerationRun_status_resume_after_idx" ON "NovelGenerationRun"("status", "resume_after");
ALTER TABLE "BackgroundJob" ADD COLUMN "available_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "BackgroundJob_status_available_at_created_at_idx" ON "BackgroundJob"("status", "available_at", "created_at");
CREATE TABLE "NovelGenerationAlert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NovelGenerationAlert_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "NovelGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NovelGenerationAlert_run_id_kind_key" ON "NovelGenerationAlert"("run_id", "kind");
CREATE INDEX "NovelGenerationAlert_resolved_at_created_at_idx" ON "NovelGenerationAlert"("resolved_at", "created_at");
