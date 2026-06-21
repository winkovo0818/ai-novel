import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
// TextInput replaced with direct useInput
import Spinner from "ink-spinner";
import { usePoller } from "./Poller";
import { MainPanel } from "./panels/MainPanel";
import { OutlinePanel } from "./panels/OutlinePanel";
import { CharactersPanel } from "./panels/CharactersPanel";
import { UsagePanel } from "./panels/UsagePanel";
import { bootstrapNovel } from "./bootstrap";
import { runAutoGeneration } from "./generator";
import { initProjectDir, saveNovelMeta, saveBible, saveOutline, saveProgress } from "./storage";
import type { CliConfig,  } from "./types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Screen = "welcome" | "setup" | "bootstrapping" | "generating" | "done" | "error";

const THEMES = [
  { value: "玄幻", label: "玄幻", desc: "东方仙侠、剑魂觉醒、逆天改命" },
  { value: "都市", label: "都市", desc: "现代都市、商战、情感纠葛" },
  { value: "科幻", label: "科幻", desc: "未来世界、星际航行、AI觉醒" },
  { value: "历史", label: "历史", desc: "架空历史、权谋争霸" },
  { value: "悬疑", label: "悬疑", desc: "推理破案、心理惊悚" },
  { value: "言情", label: "言情", desc: "古风言情、现代都市爱情" },
];

/* ------------------------------------------------------------------ */
/*  Setup Wizard                                                        */
/* ------------------------------------------------------------------ */

function SetupWizard({
  config,
  prefillTheme,
  prefillLogline,
  prefillChapters,
  onSubmit,
}: {
  config: CliConfig;
  prefillTheme?: string;
  prefillLogline?: string;
  prefillChapters?: number;
  onSubmit(state: { theme: string; logline: string; chapters: number }): void;
}) {
  const [themeIdx, setThemeIdx] = useState(
    Math.max(0, THEMES.findIndex((t) => t.value === prefillTheme))
  );
  const [logline, setLogline] = useState(prefillLogline ?? "");
  const [chaptersStr, setChaptersStr] = useState(
    String(prefillChapters ?? config.generation.default_chapters)
  );
  const [focusField, setFocusField] = useState<"theme" | "logline" | "chapters" | "confirm">(
    prefillTheme && prefillLogline ? "confirm" : "theme"
  );

  useInput((input, key) => {
    // Only handle printable character input (no control chars, no IME intermediates)
    const isPrintable = input && input.length >= 1 && input !== "\t" && input !== "\r" && input !== "\n" &&
      !input.startsWith("\x1b") && !input.startsWith("\u001b");

    // Text input: logline
    if (focusField === "logline" && isPrintable) {
      setLogline((prev) => prev + input);
      return;
    }
    if (focusField === "logline" && (key.backspace || key.delete)) {
      setLogline((prev) => prev.slice(0, -1));
      return;
    }
    // Text input: chapters (digits only)
    if (focusField === "chapters" && isPrintable && /^[0-9]$/.test(input)) {
      setChaptersStr((prev) => prev + input);
      return;
    }
    if (focusField === "chapters" && (key.backspace || key.delete)) {
      setChaptersStr((prev) => prev.slice(0, -1));
      return;
    }
    // Navigation
    if (focusField === "theme") {
      if (key.upArrow) setThemeIdx((i) => Math.max(0, i - 1));
      if (key.downArrow) setThemeIdx((i) => Math.min(THEMES.length - 1, i + 1));
      if (key.return) setFocusField("logline");
    } else if (focusField === "logline" && key.return) {
      setFocusField("chapters");
    } else if (focusField === "chapters" && key.return) {
      setFocusField("confirm");
    } else if (focusField === "confirm" && key.return) {
      const chapters = Math.max(1, Math.min(80, parseInt(chaptersStr) || 40));
      onSubmit({ theme: THEMES[themeIdx].value, logline, chapters });
    }
    if (key.escape && focusField !== "theme") {
      if (focusField === "logline") setFocusField("theme");
      else if (focusField === "chapters") setFocusField("logline");
      else if (focusField === "confirm") setFocusField("chapters");
    }
  });


  return (
    <Box flexDirection="column" padding={1} minHeight={20}>
      <Box marginBottom={1}>
        <Text bold color="white">🖋  开始创作</Text>
      </Box>

      {/* Theme picker */}
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor={focusField !== "theme"}>
          {focusField === "theme" ? "▸ " : "  "}
          题材选择
        </Text>
        <Box marginLeft={2} flexDirection="column">
          {THEMES.map((t, i) => (
            <Box key={t.value}>
              <Text color={i === themeIdx ? "blue" : undefined} bold={i === themeIdx}>
                {i === themeIdx ? "●" : "○"} {t.label}
              </Text>
              {i === themeIdx && focusField === "theme" && (
                <Text dimColor>  — {t.desc}</Text>
              )}
            </Box>
          ))}
        </Box>
        {focusField === "theme" && <Text dimColor>  ↑↓ 选择  Enter 确认</Text>}
      </Box>

      {/* Logline */}
      <Box marginBottom={1}>
        <Text dimColor={focusField !== "logline"}>
          {focusField === "logline" ? "▸ " : "  "}
          一句话核心冲突:{" "}
        </Text>
        <Text color="white">
          {logline || (focusField === "logline" ? "▍" : "")}
        </Text>
      </Box>

      {/* Chapters */}
      <Box marginBottom={1}>
        <Text dimColor={focusField !== "chapters"}>
          {focusField === "chapters" ? "▸ " : "  "}
          目标章数:{" "}
        </Text>
        <Text color="white">
          {focusField === "chapters" ? `${chaptersStr}▍` : chaptersStr}
        </Text>
      </Box>

      {/* Confirm button */}
      <Box marginTop={1}>
        <Text
          color={focusField === "confirm" ? "green" : "gray"}
          bold={focusField === "confirm"}
        >
          {focusField === "confirm" ? "▸ " : "  "}
          {focusField === "confirm" ? "确认开始生成 →" : "  确认开始生成"}
        </Text>
      </Box>

      <Box marginTop={2}>
        <Text dimColor>Tab/↓ 下一项  Esc 返回  Enter 确认</Text>
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Main App                                                            */
/* ------------------------------------------------------------------ */

interface AppProps {
  config: CliConfig;
  prefillTheme?: string;
  prefillLogline?: string;
  prefillChapters?: number;
  resumeDir?: string;
}

export default function App({ config, prefillTheme, prefillLogline, prefillChapters, resumeDir }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(
    prefillTheme && prefillLogline ? "bootstrapping" : "setup"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [bootstrapLabel, setBootstrapLabel] = useState<string>("");
  const [bootstrapText, setBootstrapText] = useState<string>("");
  const [genDir, setGenDir] = useState<string>(resumeDir ?? "");
  const [totalChapters, setTotalChapters] = useState(prefillChapters ?? config.generation.default_chapters);
  const [currentChapter, setCurrentChapter] = useState(1);

  const { data } = usePoller({
    dir: genDir,
    currentChapterIndex: currentChapter,
    intervalMs: 2000,
  });

  // Sync chapter from progress
  if (data?.progress.current) {
    if (data.progress.current !== currentChapter) {
      setCurrentChapter(data.progress.current);
    }
    if (data.progress.status === "completed" && screen === "generating") {
      setScreen("done");
    }
  }

  const handleSetupSubmit = useCallback(
    async (state: { theme: string; logline: string; chapters: number }) => {
      setTotalChapters(state.chapters);
      setScreen("bootstrapping");

      try {
        const { bible, outline } = await bootstrapNovel(
          config, state.theme, state.logline, state.chapters,
          (label, text) => { setBootstrapLabel(label); setBootstrapText(text); },
        );
        const title = bible.meta.suggested_title;
        const dir = initProjectDir(config.output.export_dir, title);
        const novelId = `cli-${Date.now()}`;

        saveNovelMeta(dir, { title, theme: state.theme, logline: state.logline, created_at: new Date().toISOString() });
        saveBible(dir, bible);
        saveOutline(dir, outline.slice(0, state.chapters));
        saveProgress(dir, {
          total: state.chapters,
          current: 0,
          status: "running",
          cost: 0,
          cost_cap: config.generation.cost_cap_cny,
          model: config.llm.model,
          started_at: new Date().toISOString(),
          last_chapter_at: new Date().toISOString(),
        });
        setGenDir(dir);

        // Start generation in background
        runAutoGeneration({
          config,
          dir,
          novelId,
          bible,
          outline,
          totalChapters: state.chapters,
          model: config.llm.model,
        }).catch((err) => {
          setErrorMsg(err instanceof Error ? err.message : "Generation failed");
          setScreen("error");
        });

        setScreen("generating");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Bootstrap failed");
        setScreen("error");
      }
    },
    [config],
  );

  // Keyboard handler for generation mode
  const [genPanel, setGenPanel] = useState<1 | 2 | 3 | 4>(1);
  useInput((input, key) => {
    if (screen === "generating" || screen === "done") {
      if (input === "1") setGenPanel(1);
      if (input === "2") setGenPanel(2);
      if (input === "3") setGenPanel(3);
      if (input === "4") setGenPanel(4);
    }
    if (input === "q" || input === "Q") exit();
    if (key.escape) exit();
  });

  /* ---- Render ---- */

  if (screen === "setup") {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1} minHeight={20}>
        <SetupWizard
          config={config}
          prefillTheme={prefillTheme}
          prefillLogline={prefillLogline}
          prefillChapters={prefillChapters}
          onSubmit={handleSetupSubmit}
        />
      </Box>
    );
  }

  if (screen === "bootstrapping") {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1} minHeight={15}>
        <Box marginBottom={1}>
          <Text color="green">
            <Spinner type="dots" />{" "}
          </Text>
          <Text bold>{bootstrapLabel || "正在生成叙事圣经和大纲…"}</Text>
        </Box>
        {bootstrapText && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>
              {bootstrapText.slice(-500)}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (screen === "error") {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="red" padding={1}>
        <Text color="red" bold>发生错误</Text>
        <Text>{errorMsg}</Text>
        <Box marginTop={1}>
          <Text dimColor>按 q 退出</Text>
        </Box>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1} minHeight={10}>
        <Text dimColor>等待生成数据…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" minHeight={20}>
      {/* Title bar */}
      <Box borderStyle="single" borderColor="gray" padding={1} justifyContent="space-between">
        <Box>
          <Text bold>{data.novel.title}</Text>
          <Text dimColor> · 全自动生成引擎</Text>
        </Box>
        <Box gap={1}>
          <Text color={genPanel === 1 ? "white" : "gray"}>[1]全部</Text>
          <Text color={genPanel === 2 ? "white" : "gray"}>[2]大纲</Text>
          <Text color={genPanel === 3 ? "white" : "gray"}>[3]角色</Text>
          <Text color={genPanel === 4 ? "white" : "gray"}>[4]用量</Text>
        </Box>
      </Box>

      {/* Panel content */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" minHeight={15}>
        {genPanel === 1 && <MainPanel data={data} />}
        {genPanel === 2 && <OutlinePanel data={data} />}
        {genPanel === 3 && <CharactersPanel data={data} />}
        {genPanel === 4 && <UsagePanel data={data} />}
      </Box>

      {/* Bottom bar */}
      <Box borderStyle="single" borderColor="gray" padding={1} justifyContent="space-between">
        <Text dimColor>1-4 切换面板</Text>
        <Text dimColor>
          {screen === "done" ? "✅ 已完成" : `${data.progress.current}/${totalChapters} 章`}
        </Text>
        <Text dimColor>q 退出</Text>
      </Box>
    </Box>
  );
}
