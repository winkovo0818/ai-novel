import { describe, expect, it, vi } from "vitest";
import { buildBackupCheckReport, runBackupCheckCli, type BackupCheckDb } from "./backup-check";

function createDb(rowsByQuery: Record<string, Array<Record<string, unknown>>>): BackupCheckDb & {
  $disconnect: ReturnType<typeof vi.fn>;
} {
  return {
    $queryRawUnsafe: async <T,>(query: string): Promise<T> => {
      const key = Object.keys(rowsByQuery).find((pattern) => query.includes(pattern));
      if (!key) throw new Error(`Unexpected query: ${query}`);
      return rowsByQuery[key] as T;
    },
    $disconnect: vi.fn(),
  };
}

const now = new Date("2026-05-28T12:00:00.000Z");

describe("buildBackupCheckReport", () => {
  it("passes when database, key tables, latest write, and backup freshness are healthy", async () => {
    const db = createDb({
      "SELECT 1": [{ ok: 1 }],
      "COUNT(*)": [{ value: "2" }],
      "MAX": [{ value: new Date("2026-05-28T11:30:00.000Z") }],
    });

    const report = await buildBackupCheckReport(
      db,
      {
        NODE_ENV: "production",
        BACKUP_LAST_SUCCESS_AT: "2026-05-28T10:00:00.000Z",
      },
      now,
    );

    expect(report.ok).toBe(true);
    expect(report.tableCounts.length).toBeGreaterThan(5);
    expect(report.latestWrite).toMatchObject({
      at: "2026-05-28T11:30:00.000Z",
      ageHours: 0.5,
    });
    expect(report.backup).toMatchObject({
      source: "BACKUP_LAST_SUCCESS_AT",
      at: "2026-05-28T10:00:00.000Z",
      ageHours: 2,
      maxAgeHours: 26,
    });
    expect(report.checks.map((check) => check.status)).not.toContain("fail");
  });

  it("fails in production when no backup timestamp is present", async () => {
    const db = createDb({
      "SELECT 1": [{ ok: 1 }],
      "COUNT(*)": [{ value: "0" }],
      "MAX": [{ value: null }],
    });

    const report = await buildBackupCheckReport(db, { NODE_ENV: "production" }, now);

    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: "backup_freshness",
        status: "fail",
      }),
    );
  });

  it("fails when the last successful backup is too old", async () => {
    const db = createDb({
      "SELECT 1": [{ ok: 1 }],
      "COUNT(*)": [{ value: "1" }],
      "MAX": [{ value: new Date("2026-05-28T11:00:00.000Z") }],
    });

    const report = await buildBackupCheckReport(
      db,
      {
        NODE_ENV: "production",
        BACKUP_CHECK_LAST_SUCCESS_AT: "2026-05-26T00:00:00.000Z",
        BACKUP_CHECK_MAX_BACKUP_AGE_HOURS: "24",
      },
      now,
    );

    expect(report.ok).toBe(false);
    expect(report.backup).toMatchObject({ ageHours: 60, maxAgeHours: 24 });
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: "backup_freshness",
        status: "fail",
      }),
    );
  });
});

describe("runBackupCheckCli", () => {
  it("prints JSON and returns a non-zero exit code when checks fail", async () => {
    const db = createDb({
      "SELECT 1": [{ ok: 1 }],
      "COUNT(*)": [{ value: "1" }],
      "MAX": [{ value: null }],
    });
    const logger = {
      log: vi.fn(),
      error: vi.fn(),
    };

    const code = await runBackupCheckCli({
      db,
      env: { NODE_ENV: "production", BACKUP_CHECK_JSON: "1" },
      now,
      logger,
    });

    expect(code).toBe(1);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('"ok": false'));
    expect(db.$disconnect).not.toHaveBeenCalled();
  });
});
