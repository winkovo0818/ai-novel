/**
 * 一次性状态回填：为「被质量门拦下后人工批准」的章节补跑 state-diff。
 *
 * 背景（2026-10-02 P1.2）：gate 拦下的章节保存为 draft 时不应用 state-diff，
 * 人工批准路径也不回填 —— 状态层滞后的章节越多，下一次 diff 越容易超过
 * 防回灌上限（级联止链）。本脚本按章节顺序补齐，恢复记忆/伏笔层。
 *
 * 用法（仅限隔离验收库）：
 *   SERIAL_DATABASE_URL=postgresql://... npx tsx scripts/backfill-state-diff.ts \
 *     --novel <novel-id> --from 5 --to 9 [--max-state-changes 40]
 */
import dotenv from "dotenv";
import { Command } from "commander";

dotenv.config({ quiet: true });
const options = new Command()
  .option("--novel <id>", "Novel id")
  .option("--from <n>", "First chapter to backfill", "1")
  .option("--to <n>", "Last chapter to backfill")
  .option("--max-state-changes <n>", "Per-chapter state-diff cap", "40")
  .parse().opts<{ novel?: string; from: string; to?: string; maxStateChanges: string }>();
const raw = process.env.SERIAL_DATABASE_URL;
if (!raw || !["localhost", "127.0.0.1"].includes(new URL(raw).hostname)) {
  throw new Error("SERIAL_DATABASE_URL must name a dedicated local database");
}
process.env.DATABASE_URL = raw;
process.env.DIRECT_URL = raw;
if (!options.novel || !options.to) throw new Error("--novel and --to are required");

const { prisma } = await import("../lib/db");
const { chatCompletionWithRetry } = await import("../lib/llm/client");
const { parseFirstJsonObject } = await import("../lib/llm/extractJson");
const { buildStateDiffPrompt } = await import("../lib/llm/prompts/stateDiff");
const { StateDiffSchema, BibleDraftSchema } = await import("../lib/validation/schemas");
const { applyStateDiff, validateStateDiff } = await import("../lib/validation/stateDiffMerge");
const { syncStoryMemory } = await import("../lib/agent/storyMemory");

const maxStateChanges = Number(options.maxStateChanges);
const novel = await prisma.novel.findUniqueOrThrow({
  where: { id: options.novel }, include: { bible: true, chapters: { orderBy: { chapter_index: "asc" } } },
});
let bible = BibleDraftSchema.parse(novel.bible!.content);
let applied = 0;
for (let i = Number(options.from); i <= Number(options.to); i++) {
  const chapter = novel.chapters.find(c => c.chapter_index === i);
  if (!chapter || !chapter.content.trim()) throw new Error(`第 ${i} 章无正文，无法回填`);
  const response = await chatCompletionWithRetry({
    route: "/backfill/state-diff", agent: "state_updater", novelId: novel.id,
    messages: buildStateDiffPrompt({ bible, storyState: bible.story_state,
      chapterIndex: i, chapterTitle: chapter.title, chapterContent: chapter.content }),
    responseFormat: "json_object", temperature: 0, timeoutMs: 90_000,
  });
  const diff = StateDiffSchema.safeParse(parseFirstJsonObject(response.content));
  if (!diff.success) throw new Error(`第 ${i} 章 state-diff JSON 无法解析，中止（已应用 ${applied} 章）`);
  const issues = validateStateDiff(bible, diff.data, chapter.content, { maxStateChanges });
  if (issues.length) throw new Error(`第 ${i} 章校验失败：${issues.map(x => x.message).join("；")}（已应用 ${applied} 章）`);
  bible = applyStateDiff(bible, diff.data, i);
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.bibleDraft.update({
      where: { novel_id: novel.id, updated_at: novel.bible!.updated_at },
      data: { content: bible as never },
    });
    await syncStoryMemory(tx, novel.id, bible, row.updated_at,
      { kind: "generated_chapter", chapterIndex: i, chapterId: chapter.id, chapterVersion: chapter.version });
    return row;
  });
  novel.bible!.updated_at = updated.updated_at; // 串行推进乐观锁水位
  applied++;
  console.log(JSON.stringify({ chapter: i, items: diff.data.character_updates.length +
    diff.data.timeline_events.length + diff.data.plot_thread_updates.length + diff.data.new_entities.length, applied }));
}
await prisma.$disconnect();
console.log(`回填完成：第 ${options.from}-${options.to} 章，共 ${applied} 章`);
