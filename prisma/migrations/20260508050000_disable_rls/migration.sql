-- Disable Row Level Security across all tables that previously enabled it.
-- Decision: 当前版本只依赖应用层 ownership(lib/auth/ownership.ts、SSR/API guards)作为隔离边界。
-- 之前的 enable_rls migration 启用了 RLS，但业务查询从未在事务中调用 SET LOCAL app.current_user_id，
-- 实际不可依赖。保留会造成"假安全"，因此显式回滚。

-- Drop policies (idempotent via IF EXISTS).
DROP POLICY IF EXISTS "Users can view their own onboarding sessions" ON "OnboardingSession";
DROP POLICY IF EXISTS "Users can insert their own onboarding sessions" ON "OnboardingSession";
DROP POLICY IF EXISTS "Users can update their own onboarding sessions" ON "OnboardingSession";

DROP POLICY IF EXISTS "Users can view their own novels" ON "Novel";
DROP POLICY IF EXISTS "Users can insert their own novels" ON "Novel";
DROP POLICY IF EXISTS "Users can update their own novels" ON "Novel";
DROP POLICY IF EXISTS "Users can delete their own novels" ON "Novel";

DROP POLICY IF EXISTS "Users can view bible drafts of their novels" ON "BibleDraft";
DROP POLICY IF EXISTS "Users can insert bible drafts for their novels" ON "BibleDraft";
DROP POLICY IF EXISTS "Users can update bible drafts of their novels" ON "BibleDraft";

DROP POLICY IF EXISTS "Users can view chapter drafts of their novels" ON "ChapterDraft";
DROP POLICY IF EXISTS "Users can insert chapter drafts for their novels" ON "ChapterDraft";
DROP POLICY IF EXISTS "Users can update chapter drafts of their novels" ON "ChapterDraft";
DROP POLICY IF EXISTS "Users can delete chapter drafts of their novels" ON "ChapterDraft";

-- Disable RLS on the affected tables.
ALTER TABLE "OnboardingSession" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Novel" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "BibleDraft" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ChapterDraft" DISABLE ROW LEVEL SECURITY;
