import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { resolve, join } from "path";
import type {
  NovelMeta,
  BibleData,
  OutlineChapter,
  ProgressData,
  QualityRecord,
  UsageRecord,
  NotesData,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Path helpers                                                       */
/* ------------------------------------------------------------------ */

export function projectDir(exportDir: string, title: string): string {
  return resolve(exportDir, title);
}

export function initProjectDir(exportDir: string, title: string): string {
  const dir = projectDir(exportDir, title);
  mkdirSync(join(dir, "chapters"), { recursive: true });
  mkdirSync(join(dir, "exports"), { recursive: true });
  return dir;
}

/* ------------------------------------------------------------------ */
/*  Generic read/write                                                  */
/* ------------------------------------------------------------------ */

function saveJson<T>(filePath: string, data: T): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function loadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Novel                                                               */
/* ------------------------------------------------------------------ */

export function saveNovelMeta(dir: string, meta: NovelMeta): void {
  saveJson(join(dir, "novel.json"), meta);
}

export function loadNovelMeta(dir: string): NovelMeta | null {
  const p = join(dir, "novel.json");
  if (!existsSync(p)) return null;
  return loadJson<NovelMeta | null>(p, null);
}

/* ------------------------------------------------------------------ */
/*  Bible                                                               */
/* ------------------------------------------------------------------ */

export function saveBible(dir: string, bible: BibleData): void {
  saveJson(join(dir, "bible.json"), bible);
}

export function loadBible(dir: string): BibleData | null {
  const p = join(dir, "bible.json");
  if (!existsSync(p)) return null;
  return loadJson<BibleData | null>(p, null);
}

/* ------------------------------------------------------------------ */
/*  Outline                                                             */
/* ------------------------------------------------------------------ */

export function saveOutline(dir: string, outline: OutlineChapter[]): void {
  saveJson(join(dir, "outline.json"), outline);
}

export function loadOutline(dir: string): OutlineChapter[] {
  return loadJson<OutlineChapter[]>(join(dir, "outline.json"), []);
}

/* ------------------------------------------------------------------ */
/*  Progress                                                            */
/* ------------------------------------------------------------------ */

export function saveProgress(dir: string, progress: ProgressData): void {
  saveJson(join(dir, "progress.json"), progress);
}

export function loadProgress(dir: string): ProgressData | null {
  const p = join(dir, "progress.json");
  if (!existsSync(p)) return null;
  return loadJson<ProgressData | null>(p, null);
}

/* ------------------------------------------------------------------ */
/*  Quality                                                             */
/* ------------------------------------------------------------------ */

export function appendQuality(dir: string, record: QualityRecord): void {
  const records = loadJson<QualityRecord[]>(join(dir, "quality.json"), []);
  records.push(record);
  saveJson(join(dir, "quality.json"), records);
}

export function loadQuality(dir: string): QualityRecord[] {
  return loadJson<QualityRecord[]>(join(dir, "quality.json"), []);
}

/* ------------------------------------------------------------------ */
/*  Usage                                                               */
/* ------------------------------------------------------------------ */

export function appendUsage(dir: string, record: UsageRecord): void {
  const records = loadJson<UsageRecord[]>(join(dir, "usage.json"), []);
  records.push(record);
  saveJson(join(dir, "usage.json"), records);
}

export function loadUsage(dir: string): UsageRecord[] {
  return loadJson<UsageRecord[]>(join(dir, "usage.json"), []);
}

/* ------------------------------------------------------------------ */
/*  Notes                                                               */
/* ------------------------------------------------------------------ */

export function saveNotes(dir: string, notes: NotesData): void {
  saveJson(join(dir, "notes.json"), notes);
}

export function loadNotes(dir: string): NotesData {
  return loadJson<NotesData>(join(dir, "notes.json"), {});
}

/* ------------------------------------------------------------------ */
/*  Chapters                                                            */
/* ------------------------------------------------------------------ */

export function saveChapter(dir: string, index: number, title: string, content: string): void {
  const safeTitle = title.replace(/[\/\\<>:"|?*]/g, "-");
  const filename = `${String(index).padStart(2, "0")}-${safeTitle}.md`;
  writeFileSync(join(dir, "chapters", filename), `# 第${index}章 · ${title}\n\n${content}`, "utf-8");
}

export function loadChapter(dir: string, index: number): { title: string; content: string } | null {
  const chaptersDir = join(dir, "chapters");
  if (!existsSync(chaptersDir)) return null;
  const prefix = `${String(index).padStart(2, "0")}-`;
  for (const file of readdirSync(chaptersDir)) {
    if (file.startsWith(prefix) && file.endsWith(".md")) {
      const raw = readFileSync(join(chaptersDir, file), "utf-8");
      const titleMatch = raw.match(/^# 第\d+章 · (.+)/);
      const content = raw.replace(/^# 第\d+章 · .+\n\n/, "");
      return { title: titleMatch?.[1] ?? "", content };
    }
  }
  return null;
}

export function countChapters(dir: string): number {
  const chaptersDir = join(dir, "chapters");
  if (!existsSync(chaptersDir)) return 0;
  return readdirSync(chaptersDir).filter((f) => f.endsWith(".md")).length;
}

/* ------------------------------------------------------------------ */
/*  Lock                                                                */
/* ------------------------------------------------------------------ */

export function acquireLock(dir: string): boolean {
  const lockPath = join(dir, ".run.lock");
  if (existsSync(lockPath)) {
    const raw = readFileSync(lockPath, "utf-8");
    try {
      const { pid, timestamp } = JSON.parse(raw);
      // Stale lock (>30 min)
      if (Date.now() - timestamp > 30 * 60 * 1000) {
        releaseLock(dir);
        return acquireLock(dir);
      }
      // Check if process still running
      try {
        process.kill(pid, 0);
        return false; // Lock held by live process
      } catch {
        releaseLock(dir);
        return acquireLock(dir);
      }
    } catch {
      releaseLock(dir);
      return acquireLock(dir);
    }
  }
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }), "utf-8");
  return true;
}

export function releaseLock(dir: string): void {
  const lockPath = join(dir, ".run.lock");
  if (existsSync(lockPath)) unlinkSync(lockPath);
}
