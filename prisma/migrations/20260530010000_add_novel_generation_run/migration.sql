-- CreateTable
CREATE TABLE "NovelGenerationRun" (
  "id" TEXT NOT NULL,
  "novel_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planning',
  "total_chapters" INTEGER NOT NULL,
  "current_chapter" INTEGER NOT NULL DEFAULT 0,
  "revision_rounds" INTEGER NOT NULL DEFAULT 2,
  "quality_floor" DOUBLE PRECISION NOT NULL DEFAULT 85,
  "checkpoint_mode" TEXT NOT NULL DEFAULT 'on_fail',
  "cost_cny_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cost_cap_cny" DOUBLE PRECISION,
  "config" JSONB NOT NULL,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NovelGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NovelGenerationRun_novel_id_idx" ON "NovelGenerationRun"("novel_id");

-- CreateIndex
CREATE INDEX "NovelGenerationRun_status_idx" ON "NovelGenerationRun"("status");
