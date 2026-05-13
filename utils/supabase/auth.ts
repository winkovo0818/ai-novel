import { createClient } from "./server";

function getE2eUserId(): string | null {
  if (process.env.E2E_AUTH_BYPASS !== "1") return null;
  return process.env.E2E_TEST_USER_ID || null;
}

export async function getOptionalUserId(): Promise<string | null> {
  const e2eUserId = getE2eUserId();
  if (e2eUserId) return e2eUserId;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getRequiredUserId(): Promise<string> {
  const e2eUserId = getE2eUserId();
  if (e2eUserId) return e2eUserId;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("UNAUTHORIZED");
  }
  return data.user.id;
}
