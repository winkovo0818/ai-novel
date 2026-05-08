-- Add LlmModel for configurable LLM providers
CREATE TABLE "LlmModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'deepseek',
    "base_url" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LlmModel_provider_model_key" ON "LlmModel"("provider", "model");

-- Insert default DeepSeek model
INSERT INTO "LlmModel" ("id", "name", "provider", "base_url", "api_key", "model", "is_default", "is_enabled")
VALUES (
    gen_random_uuid()::text,
    'DeepSeek V3',
    'deepseek',
    'https://api.deepseek.com/v1',
    '',
    'deepseek-chat',
    true,
    true
);
