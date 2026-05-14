import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";
import {
  applyExportRange,
  formatNovel,
  contentTypeFor,
  fileExtensionFor,
  parseExportRange,
  parseIncludeBibleParam,
  sanitizeFilename,
  type ExportFormat,
} from "@/lib/export/formatNovel";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import { BibleDraftSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_FORMATS: ExportFormat[] = ["markdown", "txt", "docx", "epub"];

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

  const rangeResult = parseExportRange(url.searchParams.get("range"));
  if (!rangeResult.ok) {
    return Response.json(
      { ok: false, error: { code: "INVALID_RANGE", message: rangeResult.error, retryable: false } },
      { status: 400 },
    );
  }

  const includeBible = parseIncludeBibleParam(url.searchParams.get("include_bible"));
  if (includeBible === null) {
    return Response.json(
      { ok: false, error: { code: "INVALID_INCLUDE_BIBLE", message: "include_bible must be true or false", retryable: false } },
      { status: 400 },
    );
  }

  const selectedChapters = applyExportRange(novel.chapters, rangeResult.range);
  const bible = includeBible && novel.bible
    ? BibleDraftSchema.safeParse(novel.bible.content)
    : null;

  const moderationPayload = {
    chapters: selectedChapters.map((ch) => ch.content).join("\n"),
    ...(bible?.success ? { bible: bible.data } : {}),
  };
  const moderationText = stringifyForModeration(moderationPayload);
  if (moderationPayload.chapters.trim().length > 0 || bible?.success) {
    const moderation = await moderateContent({
      route: `/api/novels/:id/export`,
      text: moderationText,
      userId,
      novelId: id,
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
    chapters: selectedChapters.map((ch) => ({
      chapter_index: ch.chapter_index,
      title: ch.title,
      content: ch.content,
      status: ch.status,
    })),
    ...(bible?.success ? { bible: bible.data } : {}),
  };

  const body = await formatNovel(exportData, format);
  const filename = sanitizeFilename(novel.title) + fileExtensionFor(format);

  return new Response(body, {
    headers: {
      "Content-Type": contentTypeFor(format),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
