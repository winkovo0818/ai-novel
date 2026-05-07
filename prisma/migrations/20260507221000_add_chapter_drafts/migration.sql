-- CreateTable
CREATE TABLE "ChapterDraft" (
    "id" TEXT NOT NULL,
    "novel_id" TEXT NOT NULL,
    "chapter_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChapterDraft_novel_id_chapter_index_key" ON "ChapterDraft"("novel_id", "chapter_index");

-- CreateIndex
CREATE INDEX "ChapterDraft_novel_id_idx" ON "ChapterDraft"("novel_id");

-- CreateIndex
CREATE INDEX "ChapterDraft_status_idx" ON "ChapterDraft"("status");

-- AddForeignKey
ALTER TABLE "ChapterDraft" ADD CONSTRAINT "ChapterDraft_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
