-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "genre_main" TEXT NOT NULL,
    "genre_sub" TEXT NOT NULL,
    "title" TEXT,
    "logline" TEXT,
    "logline_suggestions" JSONB,
    "questions" JSONB,
    "answers" JSONB,
    "bible_draft" JSONB,
    "regeneration_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Novel" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Novel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibleDraft" (
    "id" TEXT NOT NULL,
    "novel_id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibleDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingSession_user_id_idx" ON "OnboardingSession"("user_id");

-- CreateIndex
CREATE INDEX "OnboardingSession_status_idx" ON "OnboardingSession"("status");

-- CreateIndex
CREATE INDEX "Novel_user_id_idx" ON "Novel"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "BibleDraft_novel_id_key" ON "BibleDraft"("novel_id");

-- AddForeignKey
ALTER TABLE "BibleDraft" ADD CONSTRAINT "BibleDraft_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
