import type { ChapterDraftView } from "@/app/(app)/editor/[novelId]/EditorClient";
import type { CandidateMode } from "@/app/(app)/editor/[novelId]/CandidatePanel";
import type { BeatItem } from "@/app/(app)/editor/[novelId]/BeatSheetPanel";
import { CHAPTER_CONTENT_MAX_CHARS } from "@/lib/validation/schemas";
import type { ChapterRevisionOperation } from "@/lib/validation/schemas";
import type { StateDiff } from "@/lib/validation/schemas";

export type ChapterStatus = "draft" | "done";
export type ChapterSaveSource = "autosave" | "manual" | "ai";
export type ChapterEditorStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "conflict"
  | "offline"
  | "error"
  | "drafting";

export interface ChapterEditorState {
  chapterId?: string;
  title: string;
  content: string;
  status: ChapterStatus;
  targetWords: number | null;
  lastSavedAt?: string;
  version: number;
}

export interface ChapterTextState {
  title: string;
  content: string;
  status: ChapterStatus;
}

export interface OfflineChapterDraft {
  novelId: string;
  chapterIndex: number;
  chapterId?: string;
  title: string;
  content: string;
  status: ChapterStatus;
  version: number;
  savedAt: string;
}

export interface ChapterContentLimitState {
  level: "ok" | "near" | "at" | "over";
  currentChars: number;
  maxChars: number;
  remainingChars: number;
  message?: string;
}

export interface PersistChapterRequestInput {
  chapterId?: string;
  novelId: string;
  selectedIndex: number;
  title: string;
  content: string;
  status: ChapterStatus;
  source: ChapterSaveSource;
  expectedVersion: number;
}

export interface PersistChapterRequest {
  url: string;
  method: "PATCH" | "POST";
  payload: {
    title: string;
    content: string;
    status: ChapterStatus;
    source?: ChapterSaveSource;
    expected_version?: number;
    chapter_index?: number;
  };
}

export interface JsonRequest<TMethod extends string = string, TPayload = undefined> {
  url: string;
  method: TMethod;
  payload: TPayload;
}

export interface ResumableDraftView {
  sessionId: string;
  status: "streaming" | "completed" | "failed";
  buffer: string;
  errorMessage: string | null;
}

export interface TargetWordsRequest {
  url: string;
  method: "PATCH";
  payload: {
    target_words: number | null;
    source: "manual";
    expected_version: number;
  };
}

export interface DraftChapterRequestInput {
  novelId: string;
  selectedIndex: number;
  title: string;
  existingContent: string;
  beats?: BeatItem[];
}

export interface DraftChapterRequest {
  url: string;
  method: "POST";
  payload: {
    chapter_index: number;
    title: string;
    existing_content: string;
    beat_sheet?: { beats: BeatItem[] };
  };
}

export interface CandidateCriticRequestInput {
  novelId: string;
  selectedIndex: number;
  content: string;
  isRevision?: boolean;
}

export interface CandidateRevisionRequestInput extends CandidateCriticRequestInput {
  issues: Array<{
    type: string;
    severity: string;
    description: string;
    suggestion?: string;
  }>;
}

export interface LocalRevisionRequestInput {
  novelId: string;
  selectedIndex: number;
  title: string;
  operation: ChapterRevisionOperation;
  selectedText: string;
  beforeContext: string;
  afterContext: string;
}

export interface DraftCandidate {
  id: string;
  label: string;
  content: string;
}

export interface DraftSseState {
  /** Primary (c0) accumulated text for backward compat. */
  generated: string;
  /** All candidates when multi-candidate generation is active. */
  candidates?: DraftCandidate[];
  streamError?: string;
  streamErrorCode?: string;
  streamErrorRetryable?: boolean;
  sessionId?: string;
  retrievalStatus?: string;
  retrievalError?: string;
  retrievedMemories?: RetrievedMemoryPreview[];
  retrievalExplanation?: RetrievalExplanationPreview;
  done: boolean;
}

export interface RetrievalExplanationPreview {
  queryTexts: string[];
  keywordFilters: string[];
}

export interface RetrievedMemoryPreview {
  id?: string;
  source: string;
  reason: string;
  score: number;
  text: string;
  explanation?: {
    chunkType?: string;
    similarity?: number;
    chapterDistance?: number;
    timeDecay?: number;
    importance?: number;
    matchedKeywords?: string[];
  };
}

/**
 * The user may deep-link a chapter via ?chapter=N in the URL. Fall back to
 * chapter 1 if the requested index doesn't exist in the bible outline.
 */
export function resolveStartIndex(
  outline: ReadonlyArray<{ index: number }>,
  requested: number | undefined,
): number {
  const want = requested ?? 1;
  return outline.some((c) => c.index === want) ? want : 1;
}

/**
 * Build the initial editor state for a chapter slot, whether or not a draft
 * has been persisted yet. Used both on hook mount and on selectChapter.
 */
export function deriveChapterStateFromDraft(
  draft: ChapterDraftView | undefined,
  outlineTitle: string | undefined,
  chapterIndex: number,
): ChapterEditorState {
  return {
    chapterId: draft?.id,
    title: draft?.title ?? outlineTitle ?? `第 ${chapterIndex} 章`,
    content: draft?.content ?? "",
    status: draft?.status === "done" ? "done" : "draft",
    targetWords: draft?.target_words ?? null,
    lastSavedAt: draft?.updated_at,
    version: draft?.version ?? 0,
  };
}

/**
 * Sort-aware upsert into the chapters list. When the chapter is brand new
 * we insert and re-sort by chapter_index so the sidebar stays ordered;
 * otherwise we patch in place.
 */
export function mergeChapterIntoList(
  current: ChapterDraftView[],
  next: ChapterDraftView,
): ChapterDraftView[] {
  const exists = current.some((c) => c.id === next.id);
  if (exists) return current.map((c) => (c.id === next.id ? next : c));
  return [...current, next].sort((a, b) => a.chapter_index - b.chapter_index);
}

export function patchChapterInList(
  current: ChapterDraftView[],
  next: ChapterDraftView,
): ChapterDraftView[] {
  return current.map((chapter) => (chapter.id === next.id ? { ...chapter, ...next } : chapter));
}

export function hasUnsavedChapterChanges(
  current: ChapterTextState,
  saved: ChapterTextState,
): boolean {
  return current.title !== saved.title || current.content !== saved.content || current.status !== saved.status;
}

export function markChapterEditorDirty(status: ChapterEditorStatus): ChapterEditorStatus {
  if (status === "saving" || status === "drafting" || status === "conflict" || status === "offline") {
    return status;
  }
  return "dirty";
}

export function resolveSettledChapterStatus(input: {
  hasUnsavedChanges: boolean;
  status: ChapterEditorStatus;
}): ChapterEditorStatus {
  if (input.status === "conflict" || input.status === "offline" || input.status === "error") {
    return input.status;
  }
  return input.hasUnsavedChanges ? "dirty" : "clean";
}

export function shouldAutoSaveChapter(input: {
  hasUnsavedChanges: boolean;
  status: ChapterEditorStatus;
  title: string;
}): boolean {
  return (
    input.hasUnsavedChanges &&
    input.status !== "saving" &&
    input.status !== "drafting" &&
    input.status !== "conflict" &&
    input.status !== "offline" &&
    input.title.trim().length > 0
  );
}

export function getAutosaveDelayMs(contentLength: number): number {
  if (contentLength >= 50_000) return 8_000;
  if (contentLength >= 25_000) return 6_000;
  if (contentLength >= 10_000) return 4_500;
  return 3_000;
}

export function countNonWhitespaceCharacters(content: string): number {
  let count = 0;
  for (let index = 0; index < content.length; index += 1) {
    const char = content.charCodeAt(index);
    if (char !== 9 && char !== 10 && char !== 11 && char !== 12 && char !== 13 && char !== 32) {
      count += 1;
    }
  }
  return count;
}

export function buildOfflineChapterDraftKey(novelId: string, chapterIndex: number): string {
  return `ai-novel:offline-chapter:${novelId}:${chapterIndex}`;
}

export function buildOfflineChapterDraft(input: {
  novelId: string;
  chapterIndex: number;
  chapterId?: string;
  title: string;
  content: string;
  status: ChapterStatus;
  version: number;
  savedAt?: string;
}): OfflineChapterDraft {
  return {
    novelId: input.novelId,
    chapterIndex: input.chapterIndex,
    chapterId: input.chapterId,
    title: input.title,
    content: input.content,
    status: input.status,
    version: input.version,
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
}

export function parseOfflineChapterDraft(value: string | null): OfflineChapterDraft | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Partial<OfflineChapterDraft>;
    if (
      typeof raw.novelId !== "string" ||
      typeof raw.chapterIndex !== "number" ||
      typeof raw.title !== "string" ||
      typeof raw.content !== "string" ||
      (raw.status !== "draft" && raw.status !== "done") ||
      typeof raw.version !== "number" ||
      typeof raw.savedAt !== "string"
    ) {
      return null;
    }

    return {
      novelId: raw.novelId,
      chapterIndex: raw.chapterIndex,
      chapterId: typeof raw.chapterId === "string" ? raw.chapterId : undefined,
      title: raw.title,
      content: raw.content,
      status: raw.status,
      version: raw.version,
      savedAt: raw.savedAt,
    };
  } catch {
    return null;
  }
}

export function getChapterContentLimitState(
  content: string,
  maxChars = CHAPTER_CONTENT_MAX_CHARS,
  warnAtRatio = 0.95,
): ChapterContentLimitState {
  const currentChars = content.length;
  const remainingChars = Math.max(0, maxChars - currentChars);
  const warnAt = Math.floor(maxChars * warnAtRatio);

  if (currentChars > maxChars) {
    return {
      level: "over",
      currentChars,
      maxChars,
      remainingChars,
      message: `已超过本章上限 ${maxChars.toLocaleString()} 字，请删减 ${(
        currentChars - maxChars
      ).toLocaleString()} 字或拆为下一章后再保存。`,
    };
  }

  if (currentChars === maxChars) {
    return {
      level: "at",
      currentChars,
      maxChars,
      remainingChars,
      message: `已达到本章上限 ${maxChars.toLocaleString()} 字，再写一字将无法保存。建议拆为下一章。`,
    };
  }

  if (currentChars >= warnAt) {
    return {
      level: "near",
      currentChars,
      maxChars,
      remainingChars,
      message: `当前 ${currentChars.toLocaleString()} / ${maxChars.toLocaleString()} 字，剩余 ${remainingChars.toLocaleString()} 字，接近本章上限。`,
    };
  }

  return {
    level: "ok",
    currentChars,
    maxChars,
    remainingChars,
  };
}

export function buildPersistChapterRequest(
  input: PersistChapterRequestInput,
): PersistChapterRequest {
  const basePayload = {
    title: input.title,
    content: input.content,
    status: input.status,
  };

  if (input.chapterId) {
    return {
      url: `/api/chapters/${input.chapterId}`,
      method: "PATCH",
      payload: {
        ...basePayload,
        source: input.source,
        expected_version: input.expectedVersion,
      },
    };
  }

  return {
    url: `/api/novels/${input.novelId}/chapters`,
    method: "POST",
    payload: {
      ...basePayload,
      chapter_index: input.selectedIndex,
    },
  };
}

export function buildTargetWordsRequest(
  chapterId: string,
  value: number | null,
  expectedVersion: number,
): TargetWordsRequest {
  return {
    url: `/api/chapters/${chapterId}`,
    method: "PATCH",
    payload: {
      target_words: value,
      source: "manual",
      expected_version: expectedVersion,
    },
  };
}

export function buildDraftChapterRequest(
  input: DraftChapterRequestInput,
): DraftChapterRequest {
  return {
    url: `/api/novels/${input.novelId}/chapters/draft`,
    method: "POST",
    payload: {
      chapter_index: input.selectedIndex,
      title: input.title,
      existing_content: input.existingContent,
      ...(input.beats && input.beats.length > 0 ? { beat_sheet: { beats: input.beats } } : {}),
    },
  };
}

export function buildResumableDraftRequest(
  novelId: string,
  chapterIndex: number,
  method: "GET" | "DELETE" = "GET",
): JsonRequest<"GET" | "DELETE"> {
  return {
    url: `/api/novels/${novelId}/chapters/draft/resume?chapter_index=${chapterIndex}`,
    method,
    payload: undefined,
  };
}

export function buildCandidateCriticRequest(
  input: CandidateCriticRequestInput,
): JsonRequest<"POST", { chapter_index: number; content: string; is_revision?: boolean }> {
  return {
    url: `/api/novels/${input.novelId}/chapters/critic`,
    method: "POST",
    payload: {
      chapter_index: input.selectedIndex,
      content: input.content,
      ...(input.isRevision ? { is_revision: true } : {}),
    },
  };
}

export function buildCandidateRevisionRequest(
  input: CandidateRevisionRequestInput,
): JsonRequest<"POST", { chapter_index: number; content: string; issues: CandidateRevisionRequestInput["issues"] }> {
  return {
    url: `/api/novels/${input.novelId}/chapters/draft/revise`,
    method: "POST",
    payload: {
      chapter_index: input.selectedIndex,
      content: input.content,
      issues: input.issues,
    },
  };
}

export function buildLocalRevisionRequest(
  input: LocalRevisionRequestInput,
): JsonRequest<"POST", {
  operation: ChapterRevisionOperation;
  chapter_index: number;
  title: string;
  selected_text: string;
  before_context: string;
  after_context: string;
}> {
  return {
    url: `/api/novels/${input.novelId}/chapters/draft/revise`,
    method: "POST",
    payload: {
      operation: input.operation,
      chapter_index: input.selectedIndex,
      title: input.title,
      selected_text: input.selectedText,
      before_context: input.beforeContext,
      after_context: input.afterContext,
    },
  };
}

export function buildConsistencyRequest(novelId: string): JsonRequest<"POST"> {
  return {
    url: `/api/novels/${novelId}/consistency`,
    method: "POST",
    payload: undefined,
  };
}

export function buildChapterVersionsRequest(chapterId: string): JsonRequest<"GET"> {
  return {
    url: `/api/chapters/${chapterId}/versions`,
    method: "GET",
    payload: undefined,
  };
}

export function buildStateDiffRequest(chapterId: string): JsonRequest<"POST"> {
  return {
    url: `/api/chapters/${chapterId}/state-diff`,
    method: "POST",
    payload: undefined,
  };
}

export function buildDeleteChapterRequest(chapterId: string): JsonRequest<"DELETE"> {
  return {
    url: `/api/chapters/${chapterId}`,
    method: "DELETE",
    payload: undefined,
  };
}

export function buildBeatSheetRequest(input: {
  novelId: string;
  selectedIndex: number;
  chapterTitle: string;
  chapterGoal?: string;
}): JsonRequest<"POST", { chapter_index: number; chapter_title: string; chapter_goal?: string }> {
  return {
    url: `/api/novels/${input.novelId}/chapters/outline`,
    method: "POST",
    payload: {
      chapter_index: input.selectedIndex,
      chapter_title: input.chapterTitle,
      ...(input.chapterGoal ? { chapter_goal: input.chapterGoal } : {}),
    },
  };
}

export interface EditorSelection {
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
}

export function normalizeEditorSelection(
  content: string,
  start: number | null | undefined,
  end: number | null | undefined,
): EditorSelection | null {
  if (typeof start !== "number" || !Number.isFinite(start)) return null;
  const max = content.length;
  const rawEnd = typeof end === "number" && Number.isFinite(end) ? end : start;
  const selectionStart = Math.max(0, Math.min(Math.min(start, rawEnd), max));
  const selectionEnd = Math.max(0, Math.min(Math.max(start, rawEnd), max));
  return {
    selectionStart,
    selectionEnd,
    selectedText: content.slice(selectionStart, selectionEnd),
  };
}

/**
 * Compose the next chapter body when the user accepts an AI candidate.
 * `discard` is handled by the caller (no content change), so this helper
 * only deals with the three productive modes.
 */
export function applyAcceptMode(
  currentContent: string,
  candidateContent: string,
  mode: Exclude<CandidateMode, "discard">,
  cursorPos: number | null | EditorSelection,
): string {
  if (mode === "replace") return candidateContent;
  if (mode === "replace_selection") {
    const selection = typeof cursorPos === "object" ? cursorPos : null;
    if (!selection || selection.selectionEnd <= selection.selectionStart) return currentContent;
    const max = currentContent.length;
    const start = Math.max(0, Math.min(selection.selectionStart, max));
    const end = Math.max(start, Math.min(selection.selectionEnd, max));
    return `${currentContent.slice(0, start)}${candidateContent}${currentContent.slice(end)}`;
  }
  if (mode === "append") {
    return currentContent
      ? `${currentContent.replace(/\s+$/, "")}\n\n${candidateContent}`
      : candidateContent;
  }
  // insert at cursor — clamp to [0, currentContent.length].
  const max = currentContent.length;
  const raw = typeof cursorPos === "number"
    ? cursorPos
    : cursorPos?.selectionStart ?? max;
  const pos = Math.max(0, Math.min(raw, max));
  return `${currentContent.slice(0, pos)}${candidateContent}${currentContent.slice(pos)}`;
}

export function candidateAcceptedMessage(mode: Exclude<CandidateMode, "discard">): string {
  if (mode === "replace") return "候选稿已替换正文";
  if (mode === "append") return "候选稿已追加到末尾";
  if (mode === "replace_selection") return "候选稿已替换选区";
  return "候选稿已插入光标处";
}

export function resumableDraftLoadedMessage(status: ResumableDraftView["status"]): string {
  return status === "completed"
    ? "已加载上次未完成的候选稿"
    : "已加载上次中断的部分候选稿，可继续编辑或丢弃";
}

export function applyDraftSseEvent(
  state: DraftSseState,
  event: { event: string; data: unknown },
): DraftSseState {
  if (event.event === "session") {
    const data = event.data as { sessionId?: unknown };
    return {
      ...state,
      sessionId: typeof data.sessionId === "string" ? data.sessionId : state.sessionId,
    };
  }

  if (event.event === "chapter_delta") {
    const data = event.data as { delta?: unknown };
    const delta = typeof data.delta === "string" ? data.delta : "";
    return delta ? { ...state, generated: state.generated + delta } : state;
  }

  if (event.event === "retrieval") {
    const data = event.data as {
      status?: unknown;
      error?: unknown;
      memories?: unknown;
      explanation?: unknown;
    };
    return {
      ...state,
      retrievalStatus: typeof data.status === "string" ? data.status : state.retrievalStatus,
      retrievalError: typeof data.error === "string" ? data.error : state.retrievalError,
      retrievedMemories: Array.isArray(data.memories)
        ? data.memories.filter(isRetrievedMemory)
        : state.retrievedMemories,
      retrievalExplanation: isRetrievalExplanation(data.explanation)
        ? data.explanation
        : state.retrievalExplanation,
    };
  }

  if (event.event === "error") {
    const data = event.data as {
      code?: unknown;
      message?: unknown;
      retryable?: unknown;
      sessionId?: unknown;
    };
    const code = typeof data.code === "string" ? data.code : undefined;
    const message =
      typeof data.message === "string"
        ? data.message
        : code
          ? `章节起草失败：${code}`
          : "章节起草失败";
    return {
      ...state,
      streamError: message,
      streamErrorCode: code,
      streamErrorRetryable:
        typeof data.retryable === "boolean" ? data.retryable : state.streamErrorRetryable,
      sessionId: typeof data.sessionId === "string" ? data.sessionId : state.sessionId,
    };
  }

  if (event.event === "candidates") {
    const data = event.data as { ids?: unknown; labels?: unknown };
    const ids = Array.isArray(data.ids) ? data.ids.filter((v): v is string => typeof v === "string") : [];
    const labels = Array.isArray(data.labels) ? data.labels.filter((v): v is string => typeof v === "string") : [];
    return {
      ...state,
      candidates: ids.map((id, i) => ({ id, label: labels[i] ?? id, content: "" })),
    };
  }

  if (event.event === "candidate_delta") {
    const data = event.data as { candidate?: unknown; delta?: unknown };
    const cid = typeof data.candidate === "string" ? data.candidate : "";
    const delta = typeof data.delta === "string" ? data.delta : "";
    if (!delta || !state.candidates) return state;
    const updated = state.candidates.map((c) =>
      c.id === cid ? { ...c, content: c.content + delta } : c,
    );
    const primary = updated[0]?.content ?? state.generated;
    return { ...state, candidates: updated, generated: primary };
  }

  if (event.event === "done") {
    const data = event.data as {
      retrieval_status?: unknown;
      candidates?: unknown;
    };
    // If server sent final candidates, replace the streaming-built ones.
    const finalCandidates: DraftCandidate[] | undefined =
      Array.isArray(data.candidates)
        ? (data.candidates as Array<Record<string, unknown>>)
            .filter(
              (c) =>
                typeof c.id === "string" &&
                typeof c.content === "string",
            )
            .map((c) => ({
              id: c.id as string,
              label: (typeof c.label === "string" ? c.label : c.id) as string,
              content: c.content as string,
            }))
        : undefined;
    const primaryContent = finalCandidates?.[0]?.content ?? state.generated;
    return {
      ...state,
      done: true,
      generated: primaryContent,
      candidates: finalCandidates ?? state.candidates,
      retrievalStatus: typeof data.retrieval_status === "string"
        ? data.retrieval_status
        : state.retrievalStatus,
    };
  }

  return state;
}

function isRetrievedMemory(
  value: unknown,
): value is RetrievedMemoryPreview {
  if (!value || typeof value !== "object") return false;
  const item = value as { id?: unknown; source?: unknown; reason?: unknown; score?: unknown; text?: unknown; explanation?: unknown };
  return (
    (item.id === undefined || typeof item.id === "string") &&
    typeof item.source === "string" &&
    typeof item.reason === "string" &&
    typeof item.score === "number" &&
    typeof item.text === "string" &&
    (item.explanation === undefined || isRetrievedMemoryExplanation(item.explanation))
  );
}

function isRetrievedMemoryExplanation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as {
    chunkType?: unknown;
    similarity?: unknown;
    chapterDistance?: unknown;
    timeDecay?: unknown;
    importance?: unknown;
    matchedKeywords?: unknown;
  };
  return (
    (item.chunkType === undefined || typeof item.chunkType === "string") &&
    (item.similarity === undefined || typeof item.similarity === "number") &&
    (item.chapterDistance === undefined || typeof item.chapterDistance === "number") &&
    (item.timeDecay === undefined || typeof item.timeDecay === "number") &&
    (item.importance === undefined || typeof item.importance === "number") &&
    (item.matchedKeywords === undefined ||
      (Array.isArray(item.matchedKeywords) && item.matchedKeywords.every((keyword) => typeof keyword === "string")))
  );
}

function isRetrievalExplanation(value: unknown): value is RetrievalExplanationPreview {
  if (!value || typeof value !== "object") return false;
  const item = value as { queryTexts?: unknown; keywordFilters?: unknown };
  return (
    Array.isArray(item.queryTexts) &&
    item.queryTexts.every((query) => typeof query === "string") &&
    Array.isArray(item.keywordFilters) &&
    item.keywordFilters.every((keyword) => typeof keyword === "string")
  );
}

export function hasStateDiffChanges(diff: StateDiff): boolean {
  return (
    diff.character_updates.length > 0 ||
    diff.timeline_events.length > 0 ||
    diff.plot_thread_updates.length > 0 ||
    diff.new_entities.length > 0
  );
}

export function normalizeResumableDraftPayload(
  payload: unknown,
  minBufferChars = 10,
): ResumableDraftView | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as {
    ok?: unknown;
    data?: {
      id?: unknown;
      status?: unknown;
      buffer?: unknown;
      error_message?: unknown;
    };
  };
  if (root.ok !== true || !root.data) return null;

  const buffer = typeof root.data.buffer === "string" ? root.data.buffer : "";
  if (buffer.trim().length < minBufferChars) return null;

  const status =
    root.data.status === "completed" || root.data.status === "failed" || root.data.status === "streaming"
      ? root.data.status
      : "streaming";

  return {
    sessionId: typeof root.data.id === "string" ? root.data.id : "",
    status,
    buffer,
    errorMessage:
      typeof root.data.error_message === "string" ? root.data.error_message : null,
  };
}
