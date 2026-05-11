import { expect, test } from "@playwright/test";

import { completeOnboardingToEditor } from "./helpers/onboarding";

/**
 * Main-line onboarding → editor smoke. Uses the LLM_MOCK stream that always
 * yields chapter prose containing "沈言" so the spec can assert on
 * deterministic text without depending on real DeepSeek output.
 *
 * Updated post-M1.3: AI drafting writes to the candidate panel rather than
 * the textarea, so the spec accepts the candidate via "覆盖正文" before
 * asserting on body content. Removed the legacy "标记完成" / "恢复草稿"
 * assertions — those toolbar affordances were dropped during M3.5 UI 降噪.
 */
test("completes onboarding, accepts AI candidate, and protects unsaved switches", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "逆魂纪 E2E" });

  const editor = page.locator("textarea").first();
  await expect(editor).toHaveValue("");

  // ── Chapter 1: AI draft → candidate → accept ─────────────────────────
  await page.getByRole("button", { name: "全文起草" }).click();
  await expect(page.getByText("候选稿就绪")).toBeVisible({ timeout: 30_000 });

  // Empty body → no confirm modal; "覆盖正文" applies immediately.
  await page.getByRole("button", { name: "覆盖正文" }).click();
  await expect(page.getByText("候选稿已替换正文")).toBeVisible({ timeout: 15_000 });
  await expect(editor).toHaveValue(/沈言/);

  // Persistence check: reload should keep the accepted content.
  await page.reload();
  await expect(editor).toHaveValue(/沈言/, { timeout: 15_000 });

  // ── Manual edit → save ───────────────────────────────────────────────
  await editor.fill("烟雨夜，火房里只剩一盏将熄的灯。\n沈言听见剑魂第一次低语。");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();

  // ── Chapter switch protection ────────────────────────────────────────
  await page.getByRole("button", { name: /UNIT 02/ }).click();
  await expect(editor).toHaveValue("");
  await editor.fill("第二章未保存草稿。");

  // Switching back without saving must prompt confirm.
  await page.getByRole("button", { name: /UNIT 01/ }).click();
  await expect(page.getByRole("dialog", { name: /切换章节/ })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(editor).toHaveValue("第二章未保存草稿。");

  // Accept the second prompt; confirm chapter 1 reloads.
  await page.getByRole("button", { name: /UNIT 01/ }).click();
  await expect(page.getByRole("dialog", { name: /切换章节/ })).toBeVisible();
  await page.getByRole("button", { name: "切换并丢弃" }).click();
  await expect(editor).toHaveValue(/沈言听见剑魂/);

  // ── Autosave + Ctrl+S on chapter 2 ───────────────────────────────────
  await page.getByRole("button", { name: /UNIT 02/ }).click();
  await editor.fill("第二章自动保存草稿。");
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 8_000 });

  await editor.fill("第二章快捷键保存草稿。");
  await page.keyboard.press("Control+S");
  await expect(page.getByText("草稿已保存")).toBeVisible();
});
