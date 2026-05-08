-- Add ChapterSummary for long-form memory
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChapterSummary_chapter_id_key" ON "ChapterSummary"("chapter_id");

ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "ChapterDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
