import React from "react";
import { Box, Text } from "ink";
import type { PanelData } from "../types";

const ROLE_TAGS: Record<string, string> = {
  protagonist: "★主角",
  antagonist: "◆反派",
  mentor: "导师",
  ally: "配角",
  sidekick: "助手",
};

export function CharactersPanel({ data }: { data: PanelData }) {
  const { bible } = data;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>👤 角色图谱 · {bible.characters.length} 位</Text>
      </Box>

      {bible.characters.map((char) => (
        <Box key={char.name} flexDirection="column" marginBottom={1} borderStyle="single" borderColor="gray" padding={1}>
          <Box>
            <Text bold>{ROLE_TAGS[char.role] ?? char.role} </Text>
            <Text color="white">{char.name}</Text>
            {char.age && <Text dimColor> · {char.age}岁</Text>}
          </Box>
          <Text dimColor>{char.personality}</Text>
          <Text dimColor>目标: {char.goals}</Text>
          {char.abilities && char.abilities.length > 0 && (
            <Text dimColor>能力: {char.abilities.join(" · ")}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
