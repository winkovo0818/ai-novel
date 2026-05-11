-- UX3: resumable AI chapter-draft sessions. The /draft SSE endpoint writes
-- the accumulated buffer to this row on a throttled cadence; a
-- /resume endpoint reads it back when the client reconnects after a drop.
-- One row per (user_id, novel_id, chapter_index) — starting a new draft
-- for the same slot replaces the previous attempt.
CREATE TABLE "DraftSession" (
    "id"            TEXT NOT NULL,
    "user_id"       TEXT NOT NULL,
    "novel_id"      TEXT NOT NULL,
    "chapter_index" INTEGER NOT NULL,
    "buffer"        TEXT NOT NULL DEFAULT '',
    "status"        TEXT NOT NULL DEFAULT 'streaming',
    "error_code"    TEXT,
    "error_message" TEXT,
    "retrieval"     JSONB,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftSession_pkey" PRIMARY KEY ("id")
);

-- One active draft per (user, novel, chapter) slot.
CREATE UNIQUE INDEX "DraftSession_user_id_novel_id_chapter_index_key"
    ON "DraftSession"("user_id", "novel_id", "chapter_index");

CREATE INDEX "DraftSession_user_id_novel_id_idx" ON "DraftSession"("user_id", "novel_id");
CREATE INDEX "DraftSession_updated_at_idx" ON "DraftSession"("updated_at");
