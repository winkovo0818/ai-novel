import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireLock, releaseLock, saveChapter, loadChapter, projectDir } from "./storage";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const directory = () => { const dir = mkdtempSync(join(tmpdir(), "novel-lock-")); dirs.push(dir); return dir; };
describe("CLI persistence", () => {
  it("never steals an old lock from a live writer", () => {
    const dir = directory(); writeFileSync(join(dir, ".run.lock"), JSON.stringify({ pid: process.pid, timestamp: 0 }));
    expect(acquireLock(dir)).toBe(false); releaseLock(dir); expect(existsSync(join(dir, ".run.lock"))).toBe(false);
  });
  it("allows only one lock owner", () => { const dir = directory(); expect(acquireLock(dir)).toBe(true); expect(acquireLock(dir)).toBe(false); releaseLock(dir); });
  it("prevents titles from escaping the export directory", () => {
    expect(projectDir("/tmp/exports", "../../other").startsWith(resolve("/tmp/exports") + "/")).toBe(true);
  });
  it("does not overwrite an existing chapter file", async () => {
    const dir = directory(); const { mkdirSync } = await import("node:fs"); mkdirSync(join(dir, "chapters"));
    saveChapter(dir, 1, "第一章", "用户正文"); expect(() => saveChapter(dir, 1, "第一章", "覆盖")).toThrow();
    expect(loadChapter(dir, 1)?.content).toBe("用户正文");
  });
});
