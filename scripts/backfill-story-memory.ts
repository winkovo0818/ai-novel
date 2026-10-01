/** Backfill compatibility Bibles. Dry run by default; --apply explicitly writes projections. */
import { prisma } from "../lib/db";
import { BibleDraftSchema } from "../lib/validation/schemas";
import { ensureStoryMemory, memoryEntries } from "../lib/agent/storyMemory";
const args = process.argv.slice(2);
const novelPosition = args.indexOf("--novel");
const novelId = novelPosition >= 0 ? args[novelPosition + 1] : undefined;
if (novelPosition >= 0 && (!novelId || novelId.startsWith("--"))) throw new Error("--novel requires an ID");
const apply = args.includes("--apply");
try {
  let cursor: string | undefined;
  let processed = 0, invalid = 0;
  while (true) {
    const rows = await prisma.bibleDraft.findMany({ where: novelId ? { novel_id: novelId } : { novel: { deleted_at: null } },
      orderBy: { id: "asc" }, take: 20, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!rows.length) break;
    for (const row of rows) {
      const bible = BibleDraftSchema.safeParse(row.content);
      if (!bible.success) { invalid++; console.warn(`[story-memory] invalid Bible: novel=${row.novel_id}`); continue; }
      if (apply) await ensureStoryMemory(row.novel_id, bible.data, row.updated_at);
      processed++;
      console.log(`[story-memory] ${apply ? "applied" : "dry-run"} novel=${row.novel_id} snapshot_records=${memoryEntries(bible.data.story_state).length}`);
    }
    cursor = rows.at(-1)!.id;
  }
  console.log(`[story-memory] processed=${processed} invalid=${invalid} mode=${apply ? "apply" : "dry-run"}`);
  if (invalid) process.exitCode = 1;
} finally { await prisma.$disconnect(); }
