import { prisma } from "@/lib/db";
import { getRequiredUserId } from "@/lib/auth/session";
import { recordExportEvent } from "@/lib/export/events";
import { buildCompleteNovelExport, completeNovelExportInclude } from "@/lib/export/projectExport";
import { sanitizeFilename } from "@/lib/export/formatNovel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      created_at: true,
      updated_at: true,
    },
  });
  if (!user) {
    return Response.json(
      { ok: false, error: { code: "NOT_FOUND", message: "用户不存在", retryable: false } },
      { status: 404 },
    );
  }

  const exportedAt = new Date();
  const novels = await prisma.novel.findMany({
    where: { user_id: userId, deleted_at: null },
    orderBy: { created_at: "asc" },
    include: completeNovelExportInclude,
  });
  const payload = {
    export_schema_version: 1,
    exported_at: exportedAt.toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
    },
    novels: novels.map((novel) => buildCompleteNovelExport(novel, exportedAt)),
  };
  const filenameStem = sanitizeFilename(user.name || user.email || "ai-novel-account") || "ai-novel-account";
  await recordExportEvent({
    userId,
    scope: "profile",
    format: "json",
    status: "ok",
  });

  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${filenameStem}-data.json`)}`,
    },
  });
}
