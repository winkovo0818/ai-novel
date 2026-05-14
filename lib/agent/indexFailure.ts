export interface MemoryIndexFailureLocation {
  chunkIndex: number;
  chunkCount: number;
  paragraphs: string;
  stage: "embedding" | "insert";
  preview: string;
}

const INDEX_FAILURE_RE =
  /MEMORY_CHUNK_INDEX_FAILED chunk=(\d+)\/(\d+) paragraphs=([^\s]+) stage=(embedding|insert) preview="([^"]*)"/;

export function parseMemoryIndexFailure(message: string | null | undefined): MemoryIndexFailureLocation | null {
  if (!message) return null;
  const match = message.match(INDEX_FAILURE_RE);
  if (!match) return null;
  return {
    chunkIndex: Number(match[1]),
    chunkCount: Number(match[2]),
    paragraphs: match[3],
    stage: match[4] as MemoryIndexFailureLocation["stage"],
    preview: match[5],
  };
}

export function formatMemoryIndexFailureLocation(location: MemoryIndexFailureLocation): string {
  const stageLabel = location.stage === "embedding" ? "向量生成" : "入库";
  return `索引失败：第 ${location.paragraphs} 段 · chunk ${location.chunkIndex}/${location.chunkCount} · ${stageLabel}`;
}
