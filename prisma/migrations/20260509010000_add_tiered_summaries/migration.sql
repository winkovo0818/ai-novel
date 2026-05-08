-- Add VolumeSummary and NovelSummary for tiered long-form memory
CREATE TABLE "VolumeSummary" (
    "id" TEXT NOT NULL,
    "novel_id" TEXT NOT NULL,
    "volume_index" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "covered_chapters" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VolumeSummary_novel_id_volume_index_key" ON "VolumeSummary"("novel_id", "volume_index");
CREATE INDEX "VolumeSummary_novel_id_idx" ON "VolumeSummary"("novel_id");

ALTER TABLE "VolumeSummary" ADD CONSTRAINT "VolumeSummary_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NovelSummary" (
    "id" TEXT NOT NULL,
    "novel_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NovelSummary_novel_id_key" ON "NovelSummary"("novel_id");

ALTER TABLE "NovelSummary" ADD CONSTRAINT "NovelSummary_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
