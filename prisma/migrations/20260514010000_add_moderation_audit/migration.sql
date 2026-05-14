-- Durable, privacy-conscious audit trail for moderation decisions.
-- Stores metadata and a sha256 hash of moderated text, not the text itself.
CREATE TABLE "ModerationAudit" (
    "id"              TEXT NOT NULL,
    "user_id"          TEXT,
    "novel_id"         TEXT,
    "route"            TEXT NOT NULL,
    "source"           TEXT NOT NULL,
    "action"           TEXT NOT NULL,
    "outcome"          TEXT NOT NULL,
    "mode"             TEXT,
    "code"             TEXT,
    "reason"           TEXT,
    "matched_pattern"  TEXT,
    "review_status"    TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by"      TEXT,
    "reviewed_at"      TIMESTAMP(3),
    "review_note"      TEXT,
    "text_hash"        TEXT NOT NULL,
    "text_chars"       INTEGER NOT NULL,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationAudit_created_at_idx" ON "ModerationAudit"("created_at");
CREATE INDEX "ModerationAudit_review_status_created_at_idx" ON "ModerationAudit"("review_status", "created_at");
CREATE INDEX "ModerationAudit_route_created_at_idx" ON "ModerationAudit"("route", "created_at");
CREATE INDEX "ModerationAudit_source_action_created_at_idx" ON "ModerationAudit"("source", "action", "created_at");
CREATE INDEX "ModerationAudit_outcome_created_at_idx" ON "ModerationAudit"("outcome", "created_at");
CREATE INDEX "ModerationAudit_user_id_created_at_idx" ON "ModerationAudit"("user_id", "created_at");
CREATE INDEX "ModerationAudit_novel_id_created_at_idx" ON "ModerationAudit"("novel_id", "created_at");
