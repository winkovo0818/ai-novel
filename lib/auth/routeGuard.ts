/**
 * Route-level auth guard.  Collapses the three-step preamble (auth,
 * rate-limit, ownership) that repeats across ~50 route handlers into a
 * single call.  Returns the authenticated userId on success, or a
 * Response-shaped error object the caller should forward.
 */

import { getRequiredUserId } from "./session";
import { canAccessOwnerResource } from "./ownership";
import { isRateLimited } from "./rateLimit";
import { jsonError } from "@/lib/http/json";

export interface ResourceGuard {
  type: string;
  id: string;
  ownerId: string | null;
}

export interface RouteGuardResult {
  userId: string;
}

export interface RouteGuardError {
  response: Response;
}

const RESOURCE_LABELS: Record<string, string> = {
  novel: "Novel",
  chapter: "Chapter draft",
  session: "Onboarding session",
  model: "LLM model",
  "embedding-model": "Embedding model",
};

function notFoundCode(type: string): string {
  const label = RESOURCE_LABELS[type] ?? type.toUpperCase();
  return `${label.replace(/\s+/g, "_").toUpperCase()}_NOT_FOUND`;
}

function notFoundMessage(type: string): string {
  const label = RESOURCE_LABELS[type] ?? type;
  return `${label} not found`;
}

export async function routeGuard(opts: {
  route: string;
  resource?: ResourceGuard;
}): Promise<RouteGuardResult | RouteGuardError> {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return { response: jsonError("UNAUTHORIZED", "Login required", false, 401) };
  }

  if (await isRateLimited(userId, opts.route)) {
    return {
      response: jsonError(
        "RATE_LIMITED",
        "Too many requests, please try again later",
        false,
        429,
      ),
    };
  }

  if (opts.resource) {
    const { type, ownerId } = opts.resource;
    if (!canAccessOwnerResource(ownerId, userId)) {
      return {
        response: jsonError(notFoundCode(type), notFoundMessage(type), false, 404),
      };
    }
  }

  return { userId };
}
