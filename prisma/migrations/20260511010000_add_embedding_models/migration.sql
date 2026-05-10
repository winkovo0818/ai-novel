-- Configurable embedding providers. Mirrors LlmModel layout but tracks
-- `dim` so we can reject mismatched-dimension models at the API layer.
-- Phase B locks dim to 1024 to match MemoryChunk.embedding vector(1024).
CREATE TABLE "EmbeddingModel" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "provider"   TEXT NOT NULL DEFAULT 'edgefn',
    "base_url"   TEXT NOT NULL,
    "api_key"    TEXT NOT NULL,
    "model"      TEXT NOT NULL,
    "dim"        INTEGER NOT NULL DEFAULT 1024,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbeddingModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmbeddingModel_provider_model_key" ON "EmbeddingModel"("provider", "model");
