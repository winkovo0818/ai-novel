-- Add a unique constraint on session_id to prevent duplicate novel creation
-- from repeated finalize calls.

-- session_id can be NULL (for novels created outside the onboarding flow),
-- and NULL values are not considered equal in unique constraints, so this
-- is safe: multiple novels can have session_id=NULL but only one novel
-- can be linked to a given session.

CREATE UNIQUE INDEX IF NOT EXISTS "Novel_session_id_key" ON "Novel"("session_id") WHERE "session_id" IS NOT NULL;