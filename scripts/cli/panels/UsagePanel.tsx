import React from "react";
import { Box, Text } from "ink";
import type { PanelData } from "../types";

export function UsagePanel({ data }: { data: PanelData }) {
  const { usage, progress } = data;
  const totalCost = usage.reduce((s, r) => s + r.total_cost, 0);
  const remaining = Math.max(0, progress.cost_cap - totalCost);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>💰 用量明细</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>累计 ¥{totalCost.toFixed(4)} · 预估剩余 ¥{remaining.toFixed(2)} · 上限 ¥{progress.cost_cap.toFixed(0)}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>章节         起草        审校      修订      小计</Text>
      </Box>

      {usage.slice(-15).map((r) => (
        <Box key={r.chapter}>
          <Text>{String(r.chapter).padStart(2, "0")} {r.title.slice(0, 8).padEnd(8)}</Text>
          <Text dimColor>  {r.draft_cost.toFixed(4).padStart(8)}</Text>
          <Text dimColor>  {r.critic_cost.toFixed(4).padStart(8)}</Text>
          <Text dimColor>  {r.revise_cost.toFixed(4).padStart(8)}</Text>
          <Text dimColor>  {r.total_cost.toFixed(4).padStart(8)}</Text>
        </Box>
      ))}

      {usage.length > 15 && (
        <Text dimColor>  ... 还有 {usage.length - 15} 章</Text>
      )}
    </Box>
  );
}
