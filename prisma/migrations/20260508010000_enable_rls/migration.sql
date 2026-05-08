-- Enable Row Level Security on all tables
ALTER TABLE "OnboardingSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Novel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BibleDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChapterDraft" ENABLE ROW LEVEL SECURITY;

-- OnboardingSession: users can only see their own sessions
CREATE POLICY "Users can view their own onboarding sessions"
  ON "OnboardingSession" FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert their own onboarding sessions"
  ON "OnboardingSession" FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update their own onboarding sessions"
  ON "OnboardingSession" FOR UPDATE
  USING (user_id = current_setting('app.current_user_id', true));

-- Novel: users can only see their own novels
CREATE POLICY "Users can view their own novels"
  ON "Novel" FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert their own novels"
  ON "Novel" FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update their own novels"
  ON "Novel" FOR UPDATE
  USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can delete their own novels"
  ON "Novel" FOR DELETE
  USING (user_id = current_setting('app.current_user_id', true));

-- BibleDraft: inherits from Novel ownership
CREATE POLICY "Users can view bible drafts of their novels"
  ON "BibleDraft" FOR SELECT
  USING (novel_id IN (SELECT id FROM "Novel" WHERE user_id = current_setting('app.current_user_id', true)));

CREATE POLICY "Users can insert bible drafts for their novels"
  ON "BibleDraft" FOR INSERT
  WITH CHECK (novel_id IN (SELECT id FROM "Novel" WHERE user_id = current_setting('app.current_user_id', true)));

CREATE POLICY "Users can update bible drafts of their novels"
  ON "BibleDraft" FOR UPDATE
  USING (novel_id IN (SELECT id FROM "Novel" WHERE user_id = current_setting('app.current_user_id', true)));

-- ChapterDraft: inherits from Novel ownership
CREATE POLICY "Users can view chapter drafts of their novels"
  ON "ChapterDraft" FOR SELECT
  USING (novel_id IN (SELECT id FROM "Novel" WHERE user_id = current_setting('app.current_user_id', true)));

CREATE POLICY "Users can insert chapter drafts for their novels"
  ON "ChapterDraft" FOR INSERT
  WITH CHECK (novel_id IN (SELECT id FROM "Novel" WHERE user_id = current_setting('app.current_user_id', true)));

CREATE POLICY "Users can update chapter drafts of their novels"
  ON "ChapterDraft" FOR UPDATE
  USING (novel_id IN (SELECT id FROM "Novel" WHERE user_id = current_setting('app.current_user_id', true)));

CREATE POLICY "Users can delete chapter drafts of their novels"
  ON "ChapterDraft" FOR DELETE
  USING (novel_id IN (SELECT id FROM "Novel" WHERE user_id = current_setting('app.current_user_id', true)));

-- Superuser bypasses RLS (for migrations and admin tasks)
-- By default, table owner bypasses RLS; no additional policy needed.
