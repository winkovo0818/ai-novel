import { z } from "zod";
import { validateLlmBaseUrl } from "./llmModel";

/**
 * Phase B locks embedding dimension to 1024 to match the
 * `MemoryChunk.embedding vector(1024)` column. Other dimensions need a
 * separate migration + chunk re-embedding flow (see PHASE-B-EMBEDDINGS-
 * CONTEXT §B-D-02).
 */
export const ALLOWED_EMBEDDING_DIM = 1024;

const baseUrlSchema = z
  .string()
  .min(1)
  .transform((val, ctx) => {
    try {
      return validateLlmBaseUrl(val);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "Invalid base_url",
      });
      return z.NEVER;
    }
  });

const dimSchema = z
  .number()
  .int()
  .refine((n) => n === ALLOWED_EMBEDDING_DIM, {
    message: `dim must be ${ALLOWED_EMBEDDING_DIM} (other dimensions require a separate migration)`,
  });

export const EmbeddingModelInputSchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.string().min(1).max(64),
  base_url: baseUrlSchema,
  api_key: z.string().min(1).max(512),
  model: z.string().min(1).max(128),
  dim: dimSchema.optional(),
  is_default: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
});

export type EmbeddingModelInput = z.infer<typeof EmbeddingModelInputSchema>;

export const EmbeddingModelPatchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  provider: z.string().min(1).max(64).optional(),
  base_url: baseUrlSchema.optional(),
  api_key: z.string().min(1).max(512).optional(),
  model: z.string().min(1).max(128).optional(),
  dim: dimSchema.optional(),
  is_default: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
});

export type EmbeddingModelPatch = z.infer<typeof EmbeddingModelPatchSchema>;
