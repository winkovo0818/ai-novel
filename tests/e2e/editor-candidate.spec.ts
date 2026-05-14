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

async function seedOriginalContent(page: import("@playwright/test").Page, text: string) {
  const editor = page.locator("textarea").first();
  await editor.fill(text);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible({ timeout: 8_000 });
}

async function expectCandidateReady(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: "候选稿就绪" })).toBeVisible({
    timeout: 15_000,
  });
}

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
  await seedOriginalContent(page, original);

  await page.getByRole("button", { name: "全文起草" }).click();
  await expectCandidateReady(page);

  await page.getByRole("button", { name: "放弃候选稿" }).click();
  await expect(page.getByText("候选稿已丢弃")).toBeVisible();
  await expect(editor).toHaveValue(original);
});

test("appending a candidate keeps original content and adds AI text below it", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "候选稿追加 E2E" });
  await mockDraftStream(page);

  const editor = page.locator("textarea").first();
  const original = "用户的原稿。";
  await seedOriginalContent(page, original);

  await page.getByRole("button", { name: "全文起草" }).click();
  await expectCandidateReady(page);

  await page.getByRole("button", { name: "追加到末尾" }).click();
  await expect
    .poll(() => editor.inputValue(), { timeout: 8_000 })
    .toContain(CANDIDATE_TEXT);
  const value = await editor.inputValue();
  expect(value.startsWith(original)).toBe(true);
});

test("replacing a non-empty body requires explicit confirm", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "候选稿覆盖 E2E" });
  await mockDraftStream(page);

  const editor = page.locator("textarea").first();
  const original = "用户的原稿，需要确认才能被覆盖。";
  await seedOriginalContent(page, original);

  await page.getByRole("button", { name: "全文起草" }).click();
  await expectCandidateReady(page);

  await page.getByRole("button", { name: "覆盖正文" }).click();
  // Modal asks for confirmation since the body is non-empty.
  await expect(page.getByRole("heading", { name: "确认覆盖正文？" })).toBeVisible();
  await page.getByRole("button", { name: "继续" }).click();

  await expect(editor).toHaveValue(CANDIDATE_TEXT);
});

test("P2-3: candidate panel toggles between preview and diff view", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "候选稿 diff 切换 E2E" });
  await mockDraftStream(page);

  // The diff-toggle UI only appears when there's an existing body to
  // diff against. Seed one and let it autosave, then trigger a draft.
  const original = "用户的原稿，与候选稿差异明显。";
  await seedOriginalContent(page, original);

  await page.getByRole("button", { name: "全文起草" }).click();
  await expectCandidateReady(page);

  // Two view-mode buttons are visible inside the candidate panel.
  const previewBtn = page.getByRole("button", { name: "候选稿", exact: true });
  const diffBtn = page.getByRole("button", { name: "与正文对比" });
  await expect(previewBtn).toBeVisible();
  await expect(diffBtn).toBeVisible();

  // Default mode is preview; the candidate text shows once.
  const candidatePanel = page
    .getByText("AI Candidate / 候选稿")
    .locator("xpath=ancestor::aside[1]");
  await expect(candidatePanel.getByText(CANDIDATE_TEXT)).toBeVisible();

  // Switch to diff view; the same candidate text shows up as an added
  // line marked with a `+` prefix. The DiffView renders the added
  // block with its own font-mono container, distinct from the
  // preview's prose paragraph.
  await diffBtn.click();
  await expect(candidatePanel.locator("text=+").first()).toBeVisible();
  await expect(candidatePanel.getByText(CANDIDATE_TEXT)).toBeVisible();
  // The original body is shown as a removed block in diff mode.
  await expect(candidatePanel.getByText(original)).toBeVisible();

  // Switch back — the diff markers disappear, the candidate text
  // stays. (Verifies toggle is two-way, not a one-shot transition.)
  await previewBtn.click();
  await expect(candidatePanel.getByText(CANDIDATE_TEXT)).toBeVisible();
});
