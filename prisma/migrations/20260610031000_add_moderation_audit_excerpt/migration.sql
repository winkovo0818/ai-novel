-- Store a short evidence excerpt for human moderation review.
-- This is intentionally bounded and is not a full copy of the moderated text.
ALTER TABLE "ModerationAudit"
ADD COLUMN "text_excerpt" TEXT;
