-- LlmUsage: persistent LLM call logging for cost control and audit
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "novel_id" TEXT,
    "route" TEXT NOT NULL,
    "agent" TEXT,
    "model" TEXT NOT NULL,
    "token_in" INTEGER NOT NULL DEFAULT 0,
    "token_out" INTEGER NOT NULL DEFAULT 0,
    "cost_cny" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmUsage_user_id_idx" ON "LlmUsage"("user_id");
CREATE INDEX "LlmUsage_user_id_created_at_idx" ON "LlmUsage"("user_id", "created_at");
CREATE INDEX "LlmUsage_novel_id_idx" ON "LlmUsage"("novel_id");
CREATE INDEX "LlmUsage_route_idx" ON "LlmUsage"("route");