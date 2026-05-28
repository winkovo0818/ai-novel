import type {
  MemoryFreshness,
  MemoryLibraryChunkType,
  MemoryLibraryFilterType,
  MemoryLibraryPreview,
} from "@/lib/agent/contracts";

export const MEMORY_LIBRARY_CHUNK_TYPES: readonly MemoryLibraryChunkType[] = [
  "scene",
  "dialogue",
  "character_fact",
  "world_rule",
  "plot_thread",
  "summary",
] as const;

export const MEMORY_LIBRARY_FILTER_TYPES: readonly MemoryLibraryFilterType[] = [
  "all",
  "chapter_summary",
  "volume_summary",
  "novel_summary",
  "memory_chunk",
  ...MEMORY_LIBRARY_CHUNK_TYPES,
] as const;

const FILTER_SET = new Set<MemoryLibraryFilterType>(MEMORY_LIBRARY_FILTER_TYPES);
const CHUNK_TYPE_SET = new Set<MemoryLibraryChunkType>(MEMORY_LIBRARY_CHUNK_TYPES);

export interface MemoryLibraryDeps {
  chapterDraft: {
    findMany(args: unknown): Promise<Array<{
      id: string;
      chapter_index: number;
      title: string;
      content: string;
      status: string;
      summary_dirty: boolean;
      index_dirty: boolean;
      updated_at: Date | string;
      summary?: { id: string; summary: string; updated_at: Date | string } | null;
    }>>;
  };
  memoryChunk: {
    groupBy(args: unknown): Promise<Array<{ chapter_id: string | null; _count: { _all: number } }>>;
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<Array<{
      id: string;
      chapter_id: string | null;
      chunk_type: string;
      source_kind?: string | null;
      importance?: number | null;
      last_used_at?: Date | string | null;
      text: string;
      metadata: unknown;
      created_at: Date | string;
      updated_at: Date | string;
    }>>;
  };
  volumeSummary: {
    findMany(args: unknown): Promise<Array<{
      id: string;
      volume_index: number;
      summary: string;
      covered_chapters: string[];
      updated_at: Date | string;
    }>>;
  };
  novelSummary: {
    findUnique(args: unknown): Promise<{ id: string; summary: string; updated_at: Date | string } | null>;
  };
}

export interface MemoryLibraryQuery {
  chapterIndex?: number;
  type?: MemoryLibraryFilterType | string;
  page?: number;
  pageSize?: number;
}

export function normalizeMemoryLibraryQuery(query: MemoryLibraryQuery = {}) {
  return {
    chapterIndex: query.chapterIndex && query.chapterIndex >= 1
      ? Math.floor(query.chapterIndex)
      : undefined,
    type: query.type && FILTER_SET.has(query.type as MemoryLibraryFilterType)
      ? (query.type as MemoryLibraryFilterType)
      : "all",
    page: clampPositiveInt(query.page, 1, 10_000),
    pageSize: clampPositiveInt(query.pageSize, 20, 100),
  };
}

export async function buildMemoryLibraryPreview(
  deps: MemoryLibraryDeps,
  novelId: string,
  query: MemoryLibraryQuery = {},
): Promise<MemoryLibraryPreview> {
  const { chapterIndex, type, page, pageSize } = normalizeMemoryLibraryQuery(query);
  const chapters = await deps.chapterDraft.findMany({
    where: {
      novel_id: novelId,
      ...(chapterIndex ? { chapter_index: chapterIndex } : {}),
    },
    orderBy: { chapter_index: "asc" },
    select: {
      id: true,
      chapter_index: true,
      title: true,
      content: true,
      status: true,
      summary_dirty: true,
      index_dirty: true,
      updated_at: true,
      summary: { select: { id: true, summary: true, updated_at: true } },
    },
  });
  const chapterIds = chapters.map((chapter) => chapter.id);
  const chunkCounts = chapterIds.length > 0
    ? await deps.memoryChunk.groupBy({
        by: ["chapter_id"],
        where: { novel_id: novelId, chapter_id: { in: chapterIds } },
        _count: { _all: true },
      })
    : [];
  const countByChapter = new Map(
    chunkCounts.map((row) => [row.chapter_id, row._count._all] as const),
  );

  const freshnessChapters = chapters.map((chapter) => {
    const chunkCount = countByChapter.get(chapter.id) ?? 0;
    return {
      chapterId: chapter.id,
      chapterIndex: chapter.chapter_index,
      title: chapter.title,
      status: chapter.status,
      updatedAt: toIso(chapter.updated_at),
      summaryFreshness: summaryFreshness(chapter),
      indexFreshness: indexFreshness({ ...chapter, chunkCount }),
      memoryChunkCount: chunkCount,
      summaryUpdatedAt: chapter.summary ? toIso(chapter.summary.updated_at) : undefined,
    };
  });

  const chapterSummaries = includeSummaryType(type, "chapter_summary")
    ? chapters
        .filter((chapter) => chapter.summary)
        .map((chapter) => ({
          id: chapter.summary!.id,
          chapterId: chapter.id,
          chapterIndex: chapter.chapter_index,
          title: chapter.title,
          summary: chapter.summary!.summary,
          updatedAt: toIso(chapter.summary!.updated_at),
          freshness: summaryFreshness(chapter),
        }))
    : [];

  const volumeSummaries = includeSummaryType(type, "volume_summary")
    ? await deps.volumeSummary.findMany({
        where: { novel_id: novelId },
        orderBy: { volume_index: "asc" },
        select: {
          id: true,
          volume_index: true,
          summary: true,
          covered_chapters: true,
          updated_at: true,
        },
      })
    : [];

  const novelSummary = includeSummaryType(type, "novel_summary")
    ? await deps.novelSummary.findUnique({
        where: { novel_id: novelId },
        select: { id: true, summary: true, updated_at: true },
      })
    : null;

  const chunkWhere = {
    novel_id: novelId,
    ...(chapterIndex ? { chapter_id: { in: chapterIds } } : {}),
    ...(CHUNK_TYPE_SET.has(type as MemoryLibraryChunkType) ? { chunk_type: type } : {}),
  };
  const shouldLoadChunks = includeMemoryChunks(type);
  const [totalChunks, rawChunks] = shouldLoadChunks
    ? await Promise.all([
        deps.memoryChunk.count({ where: chunkWhere }),
        deps.memoryChunk.findMany({
          where: chunkWhere,
          orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            chapter_id: true,
            chunk_type: true,
            source_kind: true,
            importance: true,
            last_used_at: true,
            text: true,
            metadata: true,
            created_at: true,
            updated_at: true,
          },
        }),
      ])
    : [0, []];
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const totalPages = Math.max(1, Math.ceil(totalChunks / pageSize));

  return {
    novelId,
    filters: { chapterIndex, type },
    freshness: {
      chapters: freshnessChapters,
      staleSummaryCount: freshnessChapters.filter((chapter) => chapter.summaryFreshness === "stale").length,
      staleIndexCount: freshnessChapters.filter((chapter) => chapter.indexFreshness === "stale").length,
      missingSummaryCount: freshnessChapters.filter((chapter) => chapter.summaryFreshness === "missing").length,
      missingIndexCount: freshnessChapters.filter((chapter) => chapter.indexFreshness === "missing").length,
    },
    chapterSummaries,
    volumeSummaries: volumeSummaries.map((summary) => ({
      id: summary.id,
      volumeIndex: summary.volume_index,
      summary: summary.summary,
      coveredChapters: summary.covered_chapters,
      updatedAt: toIso(summary.updated_at),
    })),
    novelSummary: novelSummary
      ? { id: novelSummary.id, summary: novelSummary.summary, updatedAt: toIso(novelSummary.updated_at) }
      : null,
    memoryChunks: {
      items: rawChunks.map((chunk) => {
        const chapter = chunk.chapter_id ? chapterById.get(chunk.chapter_id) : undefined;
        return {
          id: chunk.id,
          chapterId: chunk.chapter_id ?? undefined,
          chapterIndex: chapter?.chapter_index,
          chapterTitle: chapter?.title,
          type: chunk.chunk_type,
          sourceKind: chunk.source_kind ?? "chapter",
          importance: chunk.importance ?? 1,
          lastUsedAt: chunk.last_used_at ? toIso(chunk.last_used_at) : undefined,
          text: chunk.text,
          metadata: chunk.metadata,
          createdAt: toIso(chunk.created_at),
          updatedAt: toIso(chunk.updated_at),
        };
      }),
      pagination: {
        page,
        pageSize,
        total: totalChunks,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    },
  };
}

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function summaryFreshness(chapter: {
  content: string;
  summary_dirty: boolean;
  summary?: { updated_at: Date | string } | null;
}): MemoryFreshness {
  if (!chapter.content.trim()) return "missing";
  if (!chapter.summary) return "missing";
  return chapter.summary_dirty ? "stale" : "fresh";
}

function indexFreshness(chapter: {
  content: string;
  index_dirty: boolean;
  chunkCount: number;
}): MemoryFreshness {
  if (!chapter.content.trim()) return "missing";
  if (chapter.chunkCount <= 0) return "missing";
  return chapter.index_dirty ? "stale" : "fresh";
}

function includeSummaryType(type: MemoryLibraryFilterType, wanted: MemoryLibraryFilterType): boolean {
  return type === "all" || type === wanted;
}

function includeMemoryChunks(type: MemoryLibraryFilterType): boolean {
  return type === "all" || type === "memory_chunk" || CHUNK_TYPE_SET.has(type as MemoryLibraryChunkType);
}
