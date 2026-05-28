import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
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
import { recordExportEvent } from "@/lib/export/events";
import { buildCompleteNovelExport, completeNovelExportInclude } from "@/lib/export/projectExport";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import { BibleDraftSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_FORMATS: ExportFormat[] = ["markdown", "txt", "docx", "epub", "json", "zip"];

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
    include: completeNovelExportInclude,
  });

  if (!novel || novel.deleted_at) {
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
    await recordExportEvent({
      userId,
      novelId: id,
      scope: "novel",
      format: String(format),
      status: "err",
      errorCode: "INVALID_FORMAT",
    });
    return Response.json(
      { ok: false, error: { code: "INVALID_FORMAT", message: `format must be one of: ${VALID_FORMATS.join(", ")}`, retryable: false } },
      { status: 400 },
    );
  }
  const isCompleteExport = format === "json" || format === "zip";

  const rangeResult = parseExportRange(url.searchParams.get("range"));
  if (!rangeResult.ok) {
    await recordExportEvent({
      userId,
      novelId: id,
      scope: "novel",
      format,
      status: "err",
      errorCode: "INVALID_RANGE",
    });
    return Response.json(
      { ok: false, error: { code: "INVALID_RANGE", message: rangeResult.error, retryable: false } },
      { status: 400 },
    );
  }

  const includeBible = parseIncludeBibleParam(url.searchParams.get("include_bible"));
  if (includeBible === null) {
    await recordExportEvent({
      userId,
      novelId: id,
      scope: "novel",
      format,
      status: "err",
      errorCode: "INVALID_INCLUDE_BIBLE",
    });
    return Response.json(
      { ok: false, error: { code: "INVALID_INCLUDE_BIBLE", message: "include_bible must be true or false", retryable: false } },
      { status: 400 },
    );
  }

  const exportChapters = novel.chapters.map((chapter) => ({
    chapter_index: chapter.chapter_index,
    title: chapter.title,
    content: chapter.content,
    status: chapter.status,
  }));
  const selectedChapterIndexes = isCompleteExport
    ? new Set(novel.chapters.map((chapter) => chapter.chapter_index))
    : new Set(applyExportRange(exportChapters, rangeResult.range).map((chapter) => chapter.chapter_index));
  const selectedChapters = novel.chapters.filter((chapter) => selectedChapterIndexes.has(chapter.chapter_index));
  const parsedBible = novel.bible ? BibleDraftSchema.safeParse(novel.bible.content) : null;
  const appendixBible = !isCompleteExport && includeBible && parsedBible?.success ? parsedBible : null;

  const moderationPayload = {
    chapters: selectedChapters.map((ch) => ch.content).join("\n"),
    ...(appendixBible?.success ? { bible: appendixBible.data } : {}),
    ...(isCompleteExport && novel.bible ? { bible: novel.bible.content } : {}),
    ...(isCompleteExport && novel.novel_summary ? { novel_summary: novel.novel_summary.summary } : {}),
    ...(isCompleteExport && novel.memory_chunks.length > 0
      ? { memory_chunks: novel.memory_chunks.map((chunk) => chunk.text).join("\n") }
      : {}),
  };
  const moderationText = stringifyForModeration(moderationPayload);
  if (
    moderationPayload.chapters.trim().length > 0 ||
    appendixBible?.success ||
    (isCompleteExport && (novel.bible || novel.novel_summary || novel.memory_chunks.length > 0))
  ) {
    const moderation = await moderateContent({
      route: `/api/novels/:id/export`,
      text: moderationText,
      userId,
      novelId: id,
    });
    if (!moderation.allowed) {
      await recordExportEvent({
        userId,
        novelId: id,
        scope: "novel",
        format,
        status: "err",
        errorCode: "MODERATION_BLOCKED",
      });
      return Response.json(
        { ok: false, error: { code: "MODERATION_BLOCKED", message: moderation.reason ?? "内容审核未通过", retryable: false } },
        { status: 422 },
      );
    }
  }

  const completeExport = isCompleteExport ? buildCompleteNovelExport(novel) : null;
  const exportData = completeExport ?? {
    title: novel.title,
    chapters: selectedChapters.map((ch) => ({
      chapter_index: ch.chapter_index,
      title: ch.title,
      content: ch.content,
      status: ch.status,
    })),
    ...(appendixBible?.success ? { bible: appendixBible.data } : {}),
  };

  const body = await formatNovel(exportData, format);
  const filename = sanitizeFilename(novel.title) + fileExtensionFor(format);
  await recordExportEvent({
    userId,
    novelId: id,
    scope: "novel",
    format,
    status: "ok",
  });

  return new Response(body, {
    headers: {
      "Content-Type": contentTypeFor(format),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
