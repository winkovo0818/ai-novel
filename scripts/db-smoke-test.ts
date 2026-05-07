/**
 * CRUD smoke test — 跑通 MVP 核心表的增/读/改/删。
 *
 * 前置：
 *   1. docker compose up -d        # 起本地 PG（决策 D-01）
 *   2. npm run db:migrate          # 应用 Prisma 迁移
 *
 * 运行：
 *   npm run db:smoke
 *
 * 退出码：
 *   0 — 全部通过
 *   1 — 任何环节失败
 */

import { prisma } from "../lib/db";

async function main() {
  const startedAt = Date.now();
  console.log("[smoke] starting CRUD smoke test...");

  // 1) Create OnboardingSession
  const session = await prisma.onboardingSession.create({
    data: {
      genre_main: "web",
      genre_sub: "玄幻",
      title: "smoke-test",
    },
  });
  console.log(`[smoke] created session: ${session.id}`);

  // 2) Read
  const found = await prisma.onboardingSession.findUnique({
    where: { id: session.id },
  });
  if (!found) throw new Error("session read failed");
  console.log("[smoke] read session: ok");

  // 3) Update（覆盖 Json 字段与 regeneration_count）
  await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      logline: "测试 logline",
      regeneration_count: 1,
      logline_suggestions: ["a", "b", "c", "d", "e"],
      answers: { protagonist_personality: "表面懦弱内心坚韧" },
    },
  });
  console.log("[smoke] updated session: ok");

  // 4) Create Novel + BibleDraft（关联建立）
  const novel = await prisma.novel.create({
    data: {
      title: "smoke-novel",
      profile: { genre_main: "web", genre_sub: "玄幻" },
      session_id: session.id,
      bible: {
        create: {
          content: { meta: { suggested_title: "测试" } },
        },
      },
    },
    include: { bible: true },
  });
  if (!novel.bible) throw new Error("bible draft not created");
  console.log(
    `[smoke] created novel: ${novel.id} bible: ${novel.bible.id}`,
  );

  // 5) Create + update ChapterDraft
  const chapter = await prisma.chapterDraft.create({
    data: {
      novel_id: novel.id,
      chapter_index: 1,
      title: "第一章",
      content: "烟雨夜，火房里只剩一盏将熄的灯。",
    },
  });
  await prisma.chapterDraft.update({
    where: { id: chapter.id },
    data: { content: `${chapter.content}\n沈言听见剑魂第一次低语。` },
  });
  console.log(`[smoke] chapter draft: ${chapter.id}`);

  // 6) Cleanup（Cascade 会一并删 BibleDraft / ChapterDraft）
  await prisma.novel.delete({ where: { id: novel.id } });
  await prisma.onboardingSession.delete({ where: { id: session.id } });
  console.log("[smoke] cleanup: ok");

  console.log(`[smoke] all CRUD passed in ${Date.now() - startedAt}ms ✓`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("[smoke] failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
