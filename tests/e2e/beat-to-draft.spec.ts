import { expect, test, type Page } from "@playwright/test";

import { completeOnboardingToEditor } from "./helpers/onboarding";

const BEAT_ONE = "让沈言发现第二章的关键线索，并决定主动试探门主。";
const BEAT_TWO = "剑魂提出危险的训练方式，逼迫沈言做出选择。";
const BEAT_THREE = "执事突然出现打断训练，把冲突推向下一场考核。";
const EDITED_BEAT = "让沈言主动用假线索试探门主，确认旧案有人隐瞒。";
const CANDIDATE_TEXT = "基于节拍起草的第二章正文：沈言把假线索藏进柴灰。";

async function mockBeatSheetAndDraft(page: Page) {
  let draftPayload: Record<string, unknown> | undefined;

  await page.route("**/api/novels/*/chapters/outline", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          beats: [
            { index: 1, description: BEAT_ONE },
            { index: 2, description: BEAT_TWO },
            { index: 3, description: BEAT_THREE },
          ],
        },
      }),
    });
  });

  await page.route("**/api/novels/*/chapters/draft", async (route) => {
    draftPayload = route.request().postDataJSON() as Record<string, unknown>;
    const body = [
      `event: chapter_delta\ndata: {"delta":"${CANDIDATE_TEXT}"}\n\n`,
      "event: done\ndata: {}\n\n",
    ].join("");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body,
    });
  });

  await page.route("**/api/novels/*/chapters/critic", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { consistent: true, issues: [] } }),
    });
  });

  return () => draftPayload;
}

test("beat sheet generation can be edited and used to draft a candidate", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "节拍起草 E2E" });
  const getDraftPayload = await mockBeatSheetAndDraft(page);

  const editor = page.locator("textarea").first();
  await page.getByRole("button", { name: /UNIT 02/ }).click();
  await expect(editor).toHaveValue("");

  await page
    .getByPlaceholder("（可选）本章节目标，例：让主角与师傅决裂")
    .fill("让主角发现旧案线索");
  await page.getByRole("button", { name: "生成节拍" }).click();
  await expect(page.getByText("章节节拍（3）")).toBeVisible();

  const beatsPanel = page.getByText("章节节拍（3）").locator("xpath=ancestor::section[1]");
  const firstBeatInput = beatsPanel.locator("textarea").first();
  await expect(firstBeatInput).toHaveValue(BEAT_ONE);
  await firstBeatInput.fill(EDITED_BEAT);

  await page.getByRole("button", { name: "基于节拍起草本章" }).click();
  await expect(page.getByRole("heading", { name: "候选稿就绪" })).toBeVisible({
    timeout: 15_000,
  });

  expect(getDraftPayload()).toMatchObject({
    chapter_index: 2,
    beat_sheet: {
      beats: [
        { index: 1, description: EDITED_BEAT },
        { index: 2, description: BEAT_TWO },
        { index: 3, description: BEAT_THREE },
      ],
    },
  });

  await page.getByRole("button", { name: "覆盖正文" }).click();
  await expect(editor).toHaveValue(CANDIDATE_TEXT);
});
