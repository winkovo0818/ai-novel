import { expect, test } from "@playwright/test";

import { completeOnboardingToEditor } from "./helpers/onboarding";

/**
 * E2E coverage for M1.3 candidate-draft flow.
 *
 * The mocked SSE stream emits a deterministic candidate so we can assert on
 * specific text rather than relying on LLM output. Critic returns "consistent"
 * to keep the happy path one-click.
 */

const CANDIDATE_TEXT = "AI 候选稿正文：龙吟自远方传来。";

async function mockDraftStream(page: import("@playwright/test").Page) {
  await page.route("**/api/novels/*/chapters/draft", async (route) => {
    const body = [
      `event: chapter_delta\ndata: {"delta":"${CANDIDATE_TEXT}"}\n\n`,
      `event: done\ndata: {}\n\n`,
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
}

test("discarding a candidate leaves the editor body unchanged", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "候选稿丢弃 E2E" });
  await mockDraftStream(page);

  const editor = page.locator("textarea").first();
  const original = "用户的原稿。";
  await editor.fill(original);
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 8_000 });

  await page.getByRole("button", { name: "全文起草" }).click();
  await expect(page.getByText("候选稿就绪")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "放弃候选稿" }).click();
  await expect(page.getByText("候选稿已丢弃")).toBeVisible();
  await expect(editor).toHaveValue(original);
});

test("appending a candidate keeps original content and adds AI text below it", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "候选稿追加 E2E" });
  await mockDraftStream(page);

  const editor = page.locator("textarea").first();
  const original = "用户的原稿。";
  await editor.fill(original);
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 8_000 });

  await page.getByRole("button", { name: "全文起草" }).click();
  await expect(page.getByText("候选稿就绪")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "追加到末尾" }).click();
  await expect(page.getByText("候选稿已追加到末尾")).toBeVisible({ timeout: 8_000 });

  const value = await editor.inputValue();
  expect(value.startsWith(original)).toBe(true);
  expect(value.includes(CANDIDATE_TEXT)).toBe(true);
});

test("replacing a non-empty body requires explicit confirm", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "候选稿覆盖 E2E" });
  await mockDraftStream(page);

  const editor = page.locator("textarea").first();
  const original = "用户的原稿，需要确认才能被覆盖。";
  await editor.fill(original);
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 8_000 });

  await page.getByRole("button", { name: "全文起草" }).click();
  await expect(page.getByText("候选稿就绪")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "覆盖正文" }).click();
  // Modal asks for confirmation since the body is non-empty.
  await expect(page.getByRole("heading", { name: "确认覆盖正文？" })).toBeVisible();
  await page.getByRole("button", { name: "继续" }).click();

  await expect(page.getByText("候选稿已替换正文")).toBeVisible({ timeout: 8_000 });
  await expect(editor).toHaveValue(CANDIDATE_TEXT);
});
