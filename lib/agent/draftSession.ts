import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { errorMessage as formatErrorMessage, logWarn } from "@/lib/observability/logger";

/**
 * Throttled buffer writer for resumable AI chapter drafts.
 *
 * The /draft SSE handler calls schedule() on every delta but only one
 * write actually hits the DB every FLUSH_INTERVAL_MS or every
 * FLUSH_CHARS_BATCH characters, whichever comes first. This keeps
 * per-keystroke pressure off Postgres on a long generation while
 * guaranteeing the on-disk buffer is never more than a few hundred
 * characters / half-second behind what the client has seen.
 *
 * When the stream ends (normally or via error) callers must invoke
 * `finalize` to flush whatever's in the pending slot before transitioning
 * the row out of "streaming" state.
 */
const FLUSH_INTERVAL_MS = 500;
const FLUSH_CHARS_BATCH = 256;

/**
 * P0-5: how long a DraftSession may stay in `streaming` before reads treat
 * it as dead. Serverless functions can be torn down mid-SSE (Vercel timeout,
 * Lambda cold-shedding) and the `finalize` block never runs — the row sits
 * in `streaming` forever and `getResumableDraftSession` keeps returning a
 * half-buffer that will never grow. Five minutes is well past the 60s draft
 * timeout used by the chat client, so any `streaming` row older than this
 * is provably orphaned. Override via env when running long debug sessions
 * against a local LLM.
 */
const STALE_STREAMING_TIMEOUT_MS = Number(
  process.env.DRAFT_STALE_STREAMING_MS ?? 5 * 60 * 1000,
);

export interface DraftSessionStarter {
  userId: string;
  novelId: string;
  chapterIndex: number;
}

/**
 * Replace any prior session for this slot with a fresh "streaming" row.
 * The unique (user_id, novel_id, chapter_index) constraint means
 * upserting is the right primitive — starting a new draft logically
 * abandons the previous attempt.
 */
export async function createDraftSession(
  starter: DraftSessionStarter,
): Promise<string> {
  const row = await prisma.draftSession.upsert({
    where: {
      user_id_novel_id_chapter_index: {
        user_id: starter.userId,
        novel_id: starter.novelId,
        chapter_index: starter.chapterIndex,
      },
    },
    create: {
      user_id: starter.userId,
      novel_id: starter.novelId,
      chapter_index: starter.chapterIndex,
      buffer: "",
      status: "streaming",
    },
    update: {
      buffer: "",
      status: "streaming",
      error_code: null,
      error_message: null,
      retrieval: Prisma.JsonNull,
    },
  });
  return row.id;
}

export interface DraftBufferFlusher {
  /** Called on every delta; debounced internally. */
  schedule(buffer: string): void;
  /** Flush whatever's pending. Idempotent. */
  flush(): Promise<void>;
}

export function createDraftBufferFlusher(sessionId: string): DraftBufferFlusher {
  let pending: string | null = null;
  let lastFlushedLength = 0;
  let lastFlushedAt = Date.now();
  let inFlight: Promise<void> | null = null;

  async function persist(buffer: string): Promise<void> {
    await prisma.draftSession.update({
      where: { id: sessionId },
      data: { buffer },
    });
    lastFlushedLength = buffer.length;
    lastFlushedAt = Date.now();
  }

  return {
    schedule(buffer: string) {
      pending = buffer;
      if (inFlight) return; // a write is mid-flight; piggyback on the next tick
      const due =
        buffer.length - lastFlushedLength >= FLUSH_CHARS_BATCH ||
        Date.now() - lastFlushedAt >= FLUSH_INTERVAL_MS;
      if (!due) return;

      const snapshot = pending;
      pending = null;
      inFlight = persist(snapshot).catch((err) => {
        // Persistence failures are best-effort: don't break the stream
        // for the user just because resume support degraded.
        logWarn("draft_session.flush_failed", {
          session_id: sessionId,
          error: formatErrorMessage(err),
        });
      }).finally(() => {
        inFlight = null;
      });
    },
    async flush() {
      if (inFlight) {
        await inFlight;
      }
      if (pending !== null) {
        const snapshot = pending;
        pending = null;
        await persist(snapshot).catch((err) => {
          logWarn("draft_session.final_flush_failed", {
            session_id: sessionId,
            error: formatErrorMessage(err),
          });
        });
      }
    },
  };
}

export interface CompleteOptions {
  buffer: string;
  retrieval?: unknown;
}

export async function completeDraftSession(
  sessionId: string,
  opts: CompleteOptions,
): Promise<void> {
  await prisma.draftSession
    .update({
      where: { id: sessionId },
      data: {
        buffer: opts.buffer,
        status: "completed",
        retrieval:
          opts.retrieval === undefined
            ? Prisma.JsonNull
            : (opts.retrieval as Prisma.InputJsonValue),
      },
    })
    .catch((err) => {
      logWarn("draft_session.complete_failed", {
        session_id: sessionId,
        error: formatErrorMessage(err),
      });
    });
}

export interface FailOptions {
  buffer: string;
  code: string;
  message: string;
}

export async function failDraftSession(
  sessionId: string,
  opts: FailOptions,
): Promise<void> {
  await prisma.draftSession
    .update({
      where: { id: sessionId },
      data: {
        buffer: opts.buffer,
        status: "failed",
        error_code: opts.code,
        error_message: opts.message.slice(0, 500),
      },
    })
    .catch((err) => {
      logWarn("draft_session.fail_state_write_failed", {
        session_id: sessionId,
        error: formatErrorMessage(err),
      });
    });
}

export interface ResumableDraft {
  id: string;
  status: "streaming" | "completed" | "failed";
  buffer: string;
  errorCode: string | null;
  errorMessage: string | null;
  retrieval: unknown;
  chapterIndex: number;
  updatedAt: Date;
}

export async function getResumableDraftSession(
  userId: string,
  novelId: string,
  chapterIndex: number,
): Promise<ResumableDraft | null> {
  const row = await prisma.draftSession.findUnique({
    where: {
      user_id_novel_id_chapter_index: {
        user_id: userId,
        novel_id: novelId,
        chapter_index: chapterIndex,
      },
    },
  });
  if (!row) return null;

  // P0-5: a `streaming` row whose updated_at is older than the TTL is the
  // tell-tale signature of a Serverless function that got killed before it
  // could mark the session failed/completed. Materialize that fact: write
  // the row to `failed` so /resume stops handing back a frozen buffer, and
  // return the rewritten view. Best-effort — if the DB write loses (e.g.
  // racing with another reader), the next call will retry the same path.
  if (
    row.status === "streaming" &&
    Date.now() - row.updated_at.getTime() > STALE_STREAMING_TIMEOUT_MS
  ) {
    const errorCode = "STALE_STREAMING_TIMEOUT";
    const errorMessage = "上次起草超时未完成,请重新生成";
    await prisma.draftSession
      .update({
        where: { id: row.id },
        data: {
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
        },
      })
      .catch((err) => {
        logWarn("draft_session.stale_streaming_sweep_failed", {
          session_id: row.id,
          error: formatErrorMessage(err),
        });
      });
    return {
      id: row.id,
      status: "failed",
      buffer: row.buffer,
      errorCode,
      errorMessage,
      retrieval: row.retrieval,
      chapterIndex: row.chapter_index,
      updatedAt: row.updated_at,
    };
  }

  return {
    id: row.id,
    status: row.status as ResumableDraft["status"],
    buffer: row.buffer,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retrieval: row.retrieval,
    chapterIndex: row.chapter_index,
    updatedAt: row.updated_at,
  };
}

export async function dismissDraftSession(
  userId: string,
  novelId: string,
  chapterIndex: number,
): Promise<void> {
  await prisma.draftSession
    .deleteMany({
      where: {
        user_id: userId,
        novel_id: novelId,
        chapter_index: chapterIndex,
      },
    })
    .catch((err) => {
      logWarn("draft_session.dismiss_failed", {
        user_id: userId,
        novel_id: novelId,
        chapter_index: chapterIndex,
        error: formatErrorMessage(err),
      });
    });
}
