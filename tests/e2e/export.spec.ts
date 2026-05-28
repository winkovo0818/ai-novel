import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../lib/db";

function makeBible(title: string) {
  return {
    meta: { suggested_title: title.slice(0, 8), alternative_titles: ["导出一", "导出二", "导出三"] },
    characters: [
      {
        role: "protagonist",
        name: "沈言",
        age: 18,
        appearance: "黑衣少年",
        personality: "坚韧",
        catchphrase: "我会回来",
        abilities: ["剑术"],
        goals: "找到旧航线",
        motivation: "保护故乡",
        secrets: ["身世"],
        relations: ["导师"],
      },
      {
        role: "mentor",
        name: "许灯",
        age: 42,
        appearance: "白袍",
        personality: "沉稳",
        catchphrase: "慢一点",
        abilities: ["医术"],
        goals: "培养主角",
        motivation: "赎罪",
        secrets: ["旧案"],
        relations: ["沈言"],
      },
      {
        role: "antagonist",
        name: "黑帆主",
        age: 35,
        appearance: "黑袍",
        personality: "偏执",
        catchphrase: "规则属于胜者",
        abilities: ["谋略"],
        goals: "夺取权力",
        motivation: "复仇",
        secrets: ["内应"],
        relations: ["沈言"],
      },
    ],
    world: {
      setting_summary: "一个被风暴隔开的群岛世界，航线与古老规则决定所有人的命运，每座岛屿都依赖灯塔维持通行秩序。",
      factions: [
        { name: "灯塔会", alignment: "中立", role: "维护航线" },
        { name: "黑帆", alignment: "敌对", role: "劫掠商船" },
      ],
      rules: ["风暴夜不可点灯", "旧航线只在涨潮时出现"],
      geography: ["灯塔港", "沉船湾"],
    },
    outline: {
      volume_1: {
        name: "序章卷",
        theme: "启程",
        chapter_count_estimate: 8,
        chapters: Array.from({ length: 8 }, (_, index) => ({
          index: index + 1,
          title: `第${index + 1}章`,
          summary: `第${index + 1}章发生关键事件，推动主角离开安全地带并继续追查旧航线真相。`,
        })),
      },
    },
    first_chapter_beats: Array.from({ length: 5 }, (_, index) => ({
      beat: index + 1,
      scene: `场景${index + 1}`,
      purpose: `目的${index + 1}`,
    })),
  };
}

async function seedExportNovel(title: string) {
  const userId = process.env.E2E_TEST_USER_ID ?? "e2e-user";
  const novel = await prisma.novel.create({
    data: {
      user_id: userId,
      title,
      profile: { genre_main: "web", genre_sub: "玄幻", description: "导出中心 E2E" },
      bible: {
        create: {
          content: makeBible(title),
        },
      },
      chapters: {
        create: [
          {
            chapter_index: 1,
            title: "第一章 起点",
            content: "第一章正文，用于导出中心 E2E。",
            status: "done",
          },
        ],
      },
    },
    select: { id: true },
  });

  return novel.id;
}

async function openExportCenterWithContent(page: Page, title: string) {
  const novelId = await seedExportNovel(title);

  await page.goto(`/novels/${novelId}/export`);
  await expect(page.getByRole("heading", { name: "导出中心" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /下载 \.md/ })).toBeEnabled();
}

test("export center downloads all formats with range and bible parameters", async ({ page }) => {
  await openExportCenterWithContent(page, "导出中心下载 E2E");

  const seenFormats: string[] = [];
  await page.route("**/api/novels/*/export?**", async (route) => {
    const url = new URL(route.request().url());
    const format = url.searchParams.get("format") ?? "markdown";
    seenFormats.push(format);

    expect(url.searchParams.get("range")).toBe("1");
    expect(url.searchParams.get("include_bible")).toBe("true");

    const extension = format === "markdown" ? "md" : format;
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": format === "txt" ? "text/plain; charset=utf-8" : "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`导出中心下载.${extension}`)}`,
      },
      body: `fake ${format} export`,
    });
  });

  await page.getByPlaceholder("全部章节，或输入 1-10 / 1,3,5-8").fill("1");
  await page.getByLabel("附带作品 Bible").check();

  const cases = [
    { name: /下载 \.md/, filename: "导出中心下载.md" },
    { name: /下载 \.txt/, filename: "导出中心下载.txt" },
    { name: /下载 \.docx/, filename: "导出中心下载.docx" },
    { name: /下载 \.epub/, filename: "导出中心下载.epub" },
    { name: /下载 \.json/, filename: "导出中心下载.json" },
    { name: /下载 \.zip/, filename: "导出中心下载.zip" },
  ];

  for (const item of cases) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: item.name }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(item.filename);
  }

  expect(seenFormats).toEqual(["markdown", "txt", "docx", "epub", "json", "zip"]);
});

test("export center shows API errors and does not start a download", async ({ page }) => {
  await openExportCenterWithContent(page, "导出中心失败 E2E");

  let downloadCount = 0;
  page.on("download", () => {
    downloadCount += 1;
  });

  await page.route("**/api/novels/*/export?**", async (route) => {
    const url = new URL(route.request().url());
    const range = url.searchParams.get("range");
    if (range === "5-2") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "INVALID_RANGE", message: "range start must be <= end", retryable: false },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "MODERATION_BLOCKED", message: "内容审核未通过", retryable: false },
      }),
    });
  });

  const rangeInput = page.getByPlaceholder("全部章节，或输入 1-10 / 1,3,5-8");
  await rangeInput.fill("5-2");
  await page.getByRole("button", { name: /下载 \.md/ }).click();
  await expect(page.getByText("range start must be <= end")).toBeVisible();

  await rangeInput.fill("1");
  await page.getByRole("button", { name: /下载 \.txt/ }).click();
  await expect(page.getByText("内容审核未通过")).toBeVisible();

  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
});
