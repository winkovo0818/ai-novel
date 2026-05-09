import { z } from "zod";

const ALLOWED_PROVIDERS = ["deepseek", "openai", "azure", "anthropic", "custom"] as const;

function isPrivateIp(hostname: string): boolean {
  const lowered = hostname.toLowerCase();

  // IPv6 loopback / link-local / unique-local
  if (lowered === "localhost" || lowered === "[::1]" || lowered.startsWith("[fe80:") || lowered.startsWith("[fc")) {
    return true;
  }

  // File protocol host (empty or not applicable, but keep for completeness)
  if (lowered === "" || lowered.startsWith("\\")) {
    return true;
  }

  // IPv4 private ranges
  if (lowered === "localhost") return true;
  if (/^127\./.test(lowered)) return true;
  if (/^10\./.test(lowered)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lowered)) return true;
  if (/^192\.168\./.test(lowered)) return true;
  if (/^169\.254\./.test(lowered)) return true; // link-local
  if (/^0\./.test(lowered)) return true;
  if (/^255\./.test(lowered)) return true;

  return false;
}

export function validateLlmBaseUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme !== "https:") {
    // Allow localhost HTTP only in development
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (!(process.env.NODE_ENV === "development" && isLocalhost && scheme === "http:")) {
      throw new Error("URL scheme must be https (or http://localhost in development)");
    }
  }

  if (isPrivateIp(url.hostname)) {
    throw new Error("Private/internal addresses are not allowed");
  }

  // Normalize: strip trailing slashes
  const normalized = url.toString().replace(/\/+$/, "");
  return normalized;
}

export const LlmModelInputSchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.enum(ALLOWED_PROVIDERS),
  base_url: z
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
    }),
  api_key: z.string().min(1).max(512),
  model: z.string().min(1).max(128),
  is_default: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
});

export type LlmModelInput = z.infer<typeof LlmModelInputSchema>;

export const LlmModelPatchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  provider: z.enum(ALLOWED_PROVIDERS).optional(),
  base_url: z
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
    })
    .optional(),
  api_key: z.string().min(1).max(512).optional(),
  model: z.string().min(1).max(128).optional(),
  is_default: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
});

export type LlmModelPatch = z.infer<typeof LlmModelPatchSchema>;
