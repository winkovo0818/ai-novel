/**
 * Bible Prompt 5.3 离线调试脚本。
 *
 * 前置：
 *   .env 含真实 DEEPSEEK_API_KEY
 *
 * 运行：
 *   npm run prompt:bible
 *
 * 行为：
 *   1. 读 scripts/fixtures/bible-loglines.json 的 5 条 fixture
 *   2. 每条调一次 chatCompletion（responseFormat=json_object）
 *   3. 用 BibleDraftSchema 校验输出
 *   4. 写 tmp/{id}.json 落盘（成功的输出 + 失败的原始输出便于人工质检）
 *   5. 打印 pass/fail 汇总
 *
 * 退出码：0 全过；1 任意一条失败
 */

import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

import { chatCompletionWithRetry } from "../lib/llm/client";
import { buildBiblePrompt } from "../lib/llm/prompts/bible";
import {
  BibleDraftSchema,
  NovelProfileSchema,
  type NovelProfile,
} from "../lib/validation/schemas";

interface Fixture {
  id: string;
  description: string;
  inputs: {
    logline: string;
    profile: NovelProfile;
    answers?: Record<string, string | string[]>;
  };
}

const FIXTURES_PATH = path.join("scripts", "fixtures", "bible-loglines.json");
const TMP_DIR = "tmp";

// 优先加载 .env，其次 .env
loadEnv({ path: ".env" });
loadEnv();

async function main() {
  const raw = await fs.readFile(FIXTURES_PATH, "utf-8");
  const fixtures = JSON.parse(raw) as Fixture[];

  await fs.mkdir(TMP_DIR, { recursive: true });

  let pass = 0;
  let fail = 0;

  for (const fx of fixtures) {
    console.log(`\n[fx:${fx.id}] ${fx.description}`);

    // 兜底：profile 字段补默认
    const profile = NovelProfileSchema.parse(fx.inputs.profile);
    const messages = buildBiblePrompt({
      logline: fx.inputs.logline,
      profile,
      answers: fx.inputs.answers,
    });

    let rawContent = "";
    try {
      const result = await chatCompletionWithRetry({
        route: `/scripts/test-bible-prompt#${fx.id}`,
        messages,
        responseFormat: "json_object",
        temperature: 0.7,
        timeoutMs: 60_000,
      });
      rawContent = result.content;

      const json = JSON.parse(result.content);
      const parsed = BibleDraftSchema.safeParse(json);

      const outPath = path.join(TMP_DIR, `${fx.id}.json`);
      await fs.writeFile(outPath, JSON.stringify(json, null, 2), "utf-8");

      if (parsed.success) {
        console.log(`  ✓ schema valid（${result.tookMs}ms，¥${result.costCny.toFixed(4)}）→ ${outPath}`);
        pass++;
      } else {
        const errs = parsed.error.errors.slice(0, 5);
        console.log(`  ✗ schema invalid：`);
        errs.forEach((e) =>
          console.log(`    - ${e.path.join(".") || "<root>"}: ${e.message}`),
        );
        fail++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ 调用/解析失败: ${msg}`);
      if (rawContent) {
        const errPath = path.join(TMP_DIR, `${fx.id}.error.txt`);
        await fs.writeFile(errPath, rawContent, "utf-8");
        console.log(`    原始输出已落盘 → ${errPath}`);
      }
      fail++;
    }
  }

  console.log(
    `\n[result] passed ${pass}/${fixtures.length}, failed ${fail}`,
  );
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
