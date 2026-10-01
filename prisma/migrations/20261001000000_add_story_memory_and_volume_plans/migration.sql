CREATE TABLE "StoryMemoryCheckpoint" (
  "novel_id" TEXT NOT NULL PRIMARY KEY,
  "bible_updated_at" TIMESTAMP(3) NOT NULL,
  "baseline_chapter" INTEGER NOT NULL CHECK ("baseline_chapter" >= 0),
  "latest_chapter" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "snapshot_hash" TEXT NOT NULL,
  "outline_hash" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "StoryMemoryRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novel_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "memory_key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "content_hash" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "valid_from_chapter" INTEGER NOT NULL CHECK ("valid_from_chapter" >= 0),
  "valid_to_chapter" INTEGER,
  "source_kind" TEXT NOT NULL,
  "source_chapter_id" TEXT,
  "source_chapter_version" INTEGER,
  "source_bible_updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("valid_to_chapter" IS NULL OR "valid_to_chapter" >= "valid_from_chapter"),
  FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StoryMemoryRecord_novel_id_category_memory_key_revision_key" ON "StoryMemoryRecord"("novel_id", "category", "memory_key", "revision");
CREATE UNIQUE INDEX "StoryMemoryRecord_one_current_version" ON "StoryMemoryRecord"("novel_id", "category", "memory_key") WHERE "valid_to_chapter" IS NULL;
CREATE INDEX "StoryMemoryRecord_temporal_lookup" ON "StoryMemoryRecord"("novel_id", "category", "valid_to_chapter", "valid_from_chapter");
CREATE INDEX "StoryMemoryRecord_source_chapter_id_idx" ON "StoryMemoryRecord"("source_chapter_id");
CREATE TABLE "NovelOutlineChapter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novel_id" TEXT NOT NULL,
  "chapter_index" INTEGER NOT NULL,
  "volume_index" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "source_kind" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NovelOutlineChapter_novel_id_chapter_index_key" ON "NovelOutlineChapter"("novel_id", "chapter_index");
CREATE INDEX "NovelOutlineChapter_novel_id_volume_index_chapter_index_idx" ON "NovelOutlineChapter"("novel_id", "volume_index", "chapter_index");
CREATE TABLE "NovelVolumePlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novel_id" TEXT NOT NULL,
  "volume_index" INTEGER NOT NULL,
  "start_chapter" INTEGER NOT NULL,
  "end_chapter" INTEGER NOT NULL,
  "planned_after_chapter" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "source_bible_updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CHECK ("start_chapter" > 0 AND "end_chapter" >= "start_chapter"),
  FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NovelVolumePlan_novel_id_volume_index_key" ON "NovelVolumePlan"("novel_id", "volume_index");
CREATE INDEX "NovelVolumePlan_novel_id_start_chapter_end_chapter_idx" ON "NovelVolumePlan"("novel_id", "start_chapter", "end_chapter");
