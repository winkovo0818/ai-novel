import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import TOML from "@iarna/toml";
import type { CliConfig } from "./types";

const DEFAULT_CONFIG: CliConfig = {
  llm: {
    provider: "deepseek",
    model: "deepseek-chat",
    base_url: "https://api.deepseek.com/v1",
    api_key: "",
    max_tokens: 4096,
    temperature: 0.8,
  },
  generation: {
    default_chapters: 40,
    quality_floor: 85,
    revision_rounds: 2,
    cost_cap_cny: 5.0,
    target_words_per_chapter: 3000,
    max_state_changes: 30,
  },
  output: {
    export_dir: "./output",
    auto_export: true,
  },
};

export function loadConfig(configPath?: string): CliConfig {
  const path = resolve(configPath ?? "cli-config.toml");

  if (!existsSync(path)) {
    console.error(`Config file not found: ${path}`);
    console.error("Run with --setup to create one, or create cli-config.toml manually.");
    process.exit(1);
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = TOML.parse(raw) as unknown as Partial<CliConfig>;

    // Deep merge with defaults
    const config: CliConfig = {
      llm: { ...DEFAULT_CONFIG.llm, ...(parsed.llm ?? {}), extra: parsed.llm?.extra },
      generation: { ...DEFAULT_CONFIG.generation, ...(parsed.generation ?? {}) },
      output: { ...DEFAULT_CONFIG.output, ...(parsed.output ?? {}) },
    };

    if (!config.llm.api_key || config.llm.api_key === "sk-xxx") {
      console.error("Please set a valid api_key in cli-config.toml [llm] section.");
      process.exit(1);
    }

    z.object({
      llm: z.object({ model: z.string().min(1), base_url: z.string().url(), api_key: z.string().min(1),
        max_tokens: z.number().int().positive(), temperature: z.number().min(0).max(2) }),
      generation: z.object({ default_chapters: z.number().int().min(1).max(80),
        quality_floor: z.number().min(0).max(100), revision_rounds: z.number().int().min(0).max(4),
        cost_cap_cny: z.number().positive(), target_words_per_chapter: z.union([z.literal(2000), z.literal(3000), z.literal(5000)]),
        max_state_changes: z.number().int().min(5).max(40) }),
    }).parse(config);
    return config;
  } catch (err) {
    console.error(`Failed to parse config: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
