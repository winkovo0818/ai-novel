"use client";

import { diffLines, type Change } from "diff";

interface DiffViewProps {
  before: string;
  after: string;
  /** Hide unchanged context blocks larger than this many lines. */
  collapseContext?: number;
}

/**
 * Side-by-side line diff renderer. Uses the `diff` package's diffLines
 * algorithm, then renders changes as removed (red) / added (green) /
 * unchanged (muted) — collapsing long unchanged stretches into a
 * "...省略 N 行..." marker so users can focus on real differences.
 *
 * Used by:
 *   - VersionsModal:   compare a historic version against current body
 *   - CandidatePanel:  compare AI candidate against current body
 */
export function DiffView({ before, after, collapseContext = 4 }: DiffViewProps) {
  const changes: Change[] = diffLines(before, after);

  // Compute visible lines, collapsing long unchanged runs.
  type Block =
    | { kind: "added" | "removed"; lines: string[] }
    | { kind: "context"; lines: string[]; collapsed?: number };

  const blocks: Block[] = [];
  for (const change of changes) {
    const lines = change.value.split("\n");
    // diff.split keeps an extra empty string at the end if value ends in \n.
    if (lines[lines.length - 1] === "") lines.pop();
    if (lines.length === 0) continue;

    if (change.added) blocks.push({ kind: "added", lines });
    else if (change.removed) blocks.push({ kind: "removed", lines });
    else if (lines.length > collapseContext * 2) {
      const head = lines.slice(0, collapseContext);
      const tail = lines.slice(-collapseContext);
      blocks.push({ kind: "context", lines: head });
      blocks.push({ kind: "context", lines: [], collapsed: lines.length - head.length - tail.length });
      blocks.push({ kind: "context", lines: tail });
    } else {
      blocks.push({ kind: "context", lines });
    }
  }

  if (blocks.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-text-muted">两份内容完全相同。</div>
    );
  }

  return (
    <div className="font-mono text-[12px] leading-[1.7] whitespace-pre-wrap break-words">
      {blocks.map((block, i) => {
        if (block.kind === "context" && block.collapsed) {
          return (
            <div key={i} className="px-3 py-1 text-text-muted bg-secondary/30 text-center text-[11px]">
              … 省略 {block.collapsed} 行未变 …
            </div>
          );
        }
        if (block.kind === "context") {
          return (
            <div key={i}>
              {block.lines.map((line, li) => (
                <div key={li} className="px-3 text-text-secondary">
                  <span className="text-text-muted/50 mr-2">·</span>
                  {line || " "}
                </div>
              ))}
            </div>
          );
        }
        const isAdded = block.kind === "added";
        return (
          <div key={i}>
            {block.lines.map((line, li) => (
              <div
                key={li}
                className={
                  isAdded
                    ? "px-3 bg-emerald-50 text-emerald-900 border-l-2 border-emerald-400"
                    : "px-3 bg-red-50 text-red-900 border-l-2 border-red-400 line-through opacity-80"
                }
              >
                <span className="font-bold mr-2 select-none">{isAdded ? "+" : "−"}</span>
                {line || " "}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
