import { auth } from "@/auth";

function getE2eUserId(): string | null {
  if (process.env.E2E_AUTH_BYPASS !== "1") return null;
  return process.env.E2E_TEST_USER_ID || null;
}

export type CurrentUser = {
  id: string;
  email: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const e2eUserId = getE2eUserId();
  if (e2eUserId) return { id: e2eUserId, email: null };

  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return { id, email: session.user?.email ?? null };
}

export async function getOptionalUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

export async function getRequiredUserId(): Promise<string> {
  const userId = await getOptionalUserId();
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}
