-- Add ChapterVersion table for version history
CREATE TABLE "ChapterVersion" (
    "id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChapterVersion_chapter_id_idx" ON "ChapterVersion"("chapter_id");
CREATE INDEX "ChapterVersion_created_at_idx" ON "ChapterVersion"("created_at");

ALTER TABLE "ChapterVersion" ADD CONSTRAINT "ChapterVersion_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "ChapterDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
