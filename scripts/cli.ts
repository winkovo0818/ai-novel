#!/usr/bin/env tsx
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { loadConfig } from "./cli/config";

const program = new Command();

program
  .name("ai-novel")
  .description("AI 全自动小说生成 CLI")
  .version("1.0.0");

program
  .command("new")
  .description("创建并生成一本新小说（无参数进入交互式设置）")
  .option("-t, --theme <theme>", "题材（玄幻/都市/科幻/历史…）")
  .option("-l, --logline <logline>", "一句话核心冲突")
  .option("-c, --chapters <n>", "目标章数")
  .option("-m, --model <model>", "指定模型")
  .action(async (opts) => {
    const config = loadConfig();
    if (opts.model) config.llm.model = opts.model;

    const App = (await import("./cli/app")).default;
    const { waitUntilExit } = render(
      React.createElement(App, {
        config,
        prefillTheme: opts.theme,
        prefillLogline: opts.logline,
        prefillChapters: opts.chapters ? parseInt(opts.chapters) : undefined,
      }),
      { patchConsole: false },
    );
    await waitUntilExit();
  });

program
  .command("resume")
  .description("恢复生成指定项目")
  .requiredOption("-p, --path <path>", "项目目录路径")
  .action(async (opts) => {
    const config = loadConfig();
    const App = (await import("./cli/app")).default;
    const { waitUntilExit } = render(
      React.createElement(App, { config, resumeDir: opts.path }),
      { patchConsole: false },
    );
    await waitUntilExit();
  });

program.parse();
