CREATE TABLE "ExportEvent" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "novel_id" TEXT,
  "scope" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExportEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExportEvent_created_at_idx" ON "ExportEvent"("created_at");
CREATE INDEX "ExportEvent_scope_status_created_at_idx" ON "ExportEvent"("scope", "status", "created_at");
CREATE INDEX "ExportEvent_user_id_created_at_idx" ON "ExportEvent"("user_id", "created_at");
CREATE INDEX "ExportEvent_novel_id_created_at_idx" ON "ExportEvent"("novel_id", "created_at");
