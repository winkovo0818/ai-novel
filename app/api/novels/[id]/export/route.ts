import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import {
  formatNovel,
  contentTypeFor,
  fileExtensionFor,
  sanitizeFilename,
  type ExportFormat,
} from "@/lib/export/formatNovel";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_FORMATS: ExportFormat[] = ["markdown", "txt"];

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      chapters: { orderBy: { chapter_index: "asc" } },
      bible: true,
    },
  });

  if (!novel) {
    return Response.json(
      { ok: false, error: { code: "NOVEL_NOT_FOUND", message: "Novel not found", retryable: false } },
      { status: 404 },
    );
  }

  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return Response.json(
      { ok: false, error: { code: "NOVEL_NOT_FOUND", message: "Novel not found", retryable: false } },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "markdown") as ExportFormat;
  if (!VALID_FORMATS.includes(format)) {
    return Response.json(
      { ok: false, error: { code: "INVALID_FORMAT", message: `format must be one of: ${VALID_FORMATS.join(", ")}`, retryable: false } },
      { status: 400 },
    );
  }

  const allContent = novel.chapters.map((ch) => ch.content).join("\n");
  if (allContent.trim().length > 0) {
    const moderation = await moderateContent({
      route: `/api/novels/:id/export`,
      text: stringifyForModeration(allContent),
    });
    if (!moderation.allowed) {
      return Response.json(
        { ok: false, error: { code: "MODERATION_BLOCKED", message: moderation.reason ?? "内容审核未通过", retryable: false } },
        { status: 422 },
      );
    }
  }

  const exportData = {
    title: novel.title,
    chapters: novel.chapters.map((ch) => ({
      chapter_index: ch.chapter_index,
      title: ch.title,
      content: ch.content,
      status: ch.status,
    })),
  };

  const body = formatNovel(exportData, format);
  const filename = sanitizeFilename(novel.title) + fileExtensionFor(format);

  return new Response(body, {
    headers: {
      "Content-Type": contentTypeFor(format),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}