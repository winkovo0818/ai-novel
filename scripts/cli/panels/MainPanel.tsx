import React from "react";
import { Box, Text } from "ink";
import type { PanelData } from "../types";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planning: { label: "大纲规划中", color: "magenta" },
  running: { label: "自动生成中", color: "blue" },
  paused: { label: "已暂停", color: "yellow" },
  needs_review: { label: "需人工审核", color: "yellow" },
  completed: { label: "已完成", color: "green" },
  cancelled: { label: "已取消", color: "gray" },
};

export function MainPanel({ data }: { data: PanelData }) {
  const { novel, progress, quality, currentChapterContent } = data;
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round((pct / 100) * barWidth);
  const statusInfo = STATUS_MAP[progress.status] ?? { label: progress.status, color: "white" };

  // Last 300 chars of current chapter for streaming preview
  const preview = currentChapterContent.slice(-300);

  // Last quality score
  const latestQuality = quality.length > 0 ? quality[quality.length - 1] : null;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text bold color="white">{novel.title}</Text>
          <Text color="gray"> · {statusInfo.label}</Text>
        </Box>
        <Text color="gray">¥{progress.cost.toFixed(2)} / ¥{progress.cost_cap.toFixed(0)}</Text>
      </Box>

      {/* Progress bar */}
      <Box marginBottom={1}>
        <Text color="gray">进度 </Text>
        <Text color={statusInfo.color}>
          {"█".repeat(filled)}{"░".repeat(barWidth - filled)}
        </Text>
        <Text> {progress.current}/{progress.total} 章 ({pct}%)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">当前: 第 {progress.current} 章 · 模型 {progress.model}</Text>
      </Box>

      {/* Streaming preview */}
      {preview && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          padding={1}
          marginBottom={1}
        >
          <Text dimColor>{preview}</Text>
        </Box>
      )}

      {/* Quality bar */}
      {latestQuality && (
        <Box marginBottom={1}>
          <Text color="gray">质量 </Text>
          <Text color={latestQuality.score >= 85 ? "green" : latestQuality.score >= 70 ? "yellow" : "red"}>
            {latestQuality.score}%
          </Text>
        </Box>
      )}

      {/* Footer hotkeys */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>1 全部</Text>
        <Text dimColor>2 大纲</Text>
        <Text dimColor>3 角色</Text>
        <Text dimColor>4 用量</Text>
        <Text dimColor>p 暂停</Text>
        <Text dimColor>q 退出</Text>
      </Box>
    </Box>
  );
}
