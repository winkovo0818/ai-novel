import { diffLines } from "diff";

export interface SummaryDiffMetadata {
  changed: boolean;
  beforeCharacters: number;
  afterCharacters: number;
  addedCharacters: number;
  removedCharacters: number;
  addedLines: number;
  removedLines: number;
}

function countDiffLines(value: string): number {
  if (!value) return 0;
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

export function buildSummaryDiffMetadata(before: string, after: string): SummaryDiffMetadata {
  const changes = diffLines(before, after);
  let addedCharacters = 0;
  let removedCharacters = 0;
  let addedLines = 0;
  let removedLines = 0;

  for (const change of changes) {
    if (change.added) {
      addedCharacters += change.value.length;
      addedLines += countDiffLines(change.value);
    } else if (change.removed) {
      removedCharacters += change.value.length;
      removedLines += countDiffLines(change.value);
    }
  }

  return {
    changed: before !== after,
    beforeCharacters: before.length,
    afterCharacters: after.length,
    addedCharacters,
    removedCharacters,
    addedLines,
    removedLines,
  };
}
