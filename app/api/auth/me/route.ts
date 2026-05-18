import { getCurrentUser } from "@/lib/auth/session";
import { isAdminUser } from "@/lib/auth/admin";
import { jsonOk, jsonError } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("UNAUTHORIZED", "Not authenticated", false, 401);
  }
  const isAdmin = isAdminUser(user.id, user.email);
  return jsonOk({ id: user.id, email: user.email, isAdmin });
}