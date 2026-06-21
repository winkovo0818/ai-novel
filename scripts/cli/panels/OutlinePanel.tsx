import React from "react";
import { Box, Text } from "ink";
import type { PanelData } from "../types";

const STATUS_ICONS: Record<string, string> = {
  done: "✅",
  generating: "🔄",
  pending: "⏳",
  skipped: "⏭",
};

export function OutlinePanel({ data }: { data: PanelData }) {
  const { outline, progress } = data;
  const currentChapter = progress.current;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>📖 叙事大纲 · {outline.length} 章</Text>
      </Box>

      {outline.slice(0, 20).map((ch) => {
        const status: string =
          ch.index < currentChapter ? "done" :
          ch.index === currentChapter ? "generating" : "pending";
        const icon = STATUS_ICONS[status] ?? "  ";

        return (
          <Box key={ch.index} flexDirection="row" marginBottom={0}>
            <Text>{icon} </Text>
            <Text dimColor={status === "pending"} color={status === "generating" ? "blue" : undefined}>
              {String(ch.index).padStart(2, "0")}  {ch.title}
            </Text>
            <Text dimColor>  {ch.summary.slice(0, 40)}{ch.summary.length > 40 ? "…" : ""}</Text>
          </Box>
        );
      })}

      {outline.length > 20 && (
        <Text dimColor>  ... 还有 {outline.length - 20} 章</Text>
      )}
    </Box>
  );
}
