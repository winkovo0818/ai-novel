/**
 * Backup readiness check.
 *
 * The script verifies that production backup monitoring has enough signal to
 * catch a bad release before data recovery is needed: database connectivity,
 * key table counts, latest application write, and backup freshness.
 */

type CheckStatus = "ok" | "warn" | "fail";

export interface BackupCheckDb {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  $disconnect?: () => Promise<void>;
}

interface BackupCheckEnv {
  [key: string]: string | undefined;
}

interface BackupCheckTable {
  name: string;
  timestampColumn?: string;
}

export interface TableCount {
  table: string;
  count: number;
}

export interface LatestWrite {
  table: string;
  at: string;
  ageHours: number;
}

export interface BackupFreshness {
  source: string;
  at: string;
  ageHours: number;
  maxAgeHours: number;
}

export interface BackupCheckItem {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface BackupCheckReport {
  ok: boolean;
  checks: BackupCheckItem[];
  tableCounts: TableCount[];
  latestWrite: LatestWrite | null;
  backup: BackupFreshness | null;
}

const KEY_TABLES: BackupCheckTable[] = [
  { name: "User", timestampColumn: "updated_at" },
  { name: "OnboardingSession", timestampColumn: "updated_at" },
  { name: "Novel", timestampColumn: "created_at" },
  { name: "BibleDraft", timestampColumn: "updated_at" },
  { name: "ChapterDraft", timestampColumn: "updated_at" },
  { name: "ChapterVersion", timestampColumn: "created_at" },
  { name: "MemoryChunk", timestampColumn: "updated_at" },
  { name: "LlmUsage", timestampColumn: "created_at" },
  { name: "ModerationAudit", timestampColumn: "created_at" },
  { name: "BackgroundJob", timestampColumn: "updated_at" },
  { name: "DraftSession", timestampColumn: "updated_at" },
  { name: "ExportEvent", timestampColumn: "created_at" },
];

const DEFAULT_MAX_BACKUP_AGE_HOURS = 26;
const DEFAULT_MAX_RECENT_WRITE_AGE_HOURS = 168;
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export async function buildBackupCheckReport(
  db: BackupCheckDb,
  env: BackupCheckEnv = process.env,
  now = new Date(),
): Promise<BackupCheckReport> {
  const checks: BackupCheckItem[] = [];
  let tableCounts: TableCount[] = [];
  let latestWrite: LatestWrite | null = null;
  let backup: BackupFreshness | null = null;

  try {
    await db.$queryRawUnsafe('SELECT 1 AS "ok"');
    checks.push({
      name: "database_connection",
      status: "ok",
      message: "Database accepted a simple query.",
    });
  } catch (error) {
    checks.push({
      name: "database_connection",
      status: "fail",
      message: `Database connection failed: ${errorMessage(error)}`,
    });
    return finishReport(checks, tableCounts, latestWrite, backup);
  }

  try {
    tableCounts = await loadTableCounts(db);
    checks.push({
      name: "key_table_counts",
      status: "ok",
      message: `Read counts for ${tableCounts.length} key tables.`,
    });
  } catch (error) {
    checks.push({
      name: "key_table_counts",
      status: "fail",
      message: `Could not read key table counts: ${errorMessage(error)}`,
    });
  }

  try {
    latestWrite = await loadLatestWrite(db, now);
    const maxAgeHours = readPositiveNumber(
      env.BACKUP_CHECK_MAX_RECENT_WRITE_HOURS,
      DEFAULT_MAX_RECENT_WRITE_AGE_HOURS,
    );
    const requireRecentWrite = envFlag(env.BACKUP_CHECK_REQUIRE_RECENT_WRITE);

    if (!latestWrite) {
      checks.push({
        name: "latest_write",
        status: requireRecentWrite ? "fail" : "warn",
        message: "No timestamped application writes were found in key tables.",
      });
    } else if (latestWrite.ageHours > maxAgeHours) {
      checks.push({
        name: "latest_write",
        status: requireRecentWrite ? "fail" : "warn",
        message: `Latest write is ${formatHours(latestWrite.ageHours)} old in ${latestWrite.table}; limit is ${formatHours(maxAgeHours)}.`,
      });
    } else {
      checks.push({
        name: "latest_write",
        status: "ok",
        message: `Latest write is ${latestWrite.at} from ${latestWrite.table}.`,
      });
    }
  } catch (error) {
    checks.push({
      name: "latest_write",
      status: "fail",
      message: `Could not read latest write timestamp: ${errorMessage(error)}`,
    });
  }

  const backupTimestamp = readBackupTimestamp(env);
  const requireBackupTimestamp = backupTimestampRequired(env);
  const maxBackupAgeHours = readPositiveNumber(
    env.BACKUP_CHECK_MAX_BACKUP_AGE_HOURS,
    DEFAULT_MAX_BACKUP_AGE_HOURS,
  );

  if (!backupTimestamp) {
    checks.push({
      name: "backup_freshness",
      status: requireBackupTimestamp ? "fail" : "warn",
      message:
        "No backup timestamp found. Set BACKUP_LAST_SUCCESS_AT or BACKUP_CHECK_LAST_SUCCESS_AT.",
    });
  } else {
    const parsed = parseDate(backupTimestamp.value);
    if (!parsed) {
      checks.push({
        name: "backup_freshness",
        status: "fail",
        message: `${backupTimestamp.source} is not a valid ISO timestamp.`,
      });
    } else if (parsed.getTime() - now.getTime() > FUTURE_SKEW_TOLERANCE_MS) {
      checks.push({
        name: "backup_freshness",
        status: "fail",
        message: `${backupTimestamp.source} is in the future: ${parsed.toISOString()}.`,
      });
    } else {
      backup = {
        source: backupTimestamp.source,
        at: parsed.toISOString(),
        ageHours: ageHours(parsed, now),
        maxAgeHours: maxBackupAgeHours,
      };
      checks.push({
        name: "backup_freshness",
        status: backup.ageHours > maxBackupAgeHours ? "fail" : "ok",
        message:
          backup.ageHours > maxBackupAgeHours
            ? `Last backup is ${formatHours(backup.ageHours)} old; limit is ${formatHours(maxBackupAgeHours)}.`
            : `Last backup is ${formatHours(backup.ageHours)} old.`,
      });
    }
  }

  return finishReport(checks, tableCounts, latestWrite, backup);
}

export async function runBackupCheckCli(
  options: {
    db?: BackupCheckDb;
    env?: BackupCheckEnv;
    now?: Date;
    logger?: Pick<Console, "log" | "error">;
  } = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const db = options.db ?? (await loadPrisma());

  try {
    const report = await buildBackupCheckReport(db, env, options.now ?? new Date());
    if (envFlag(env.BACKUP_CHECK_JSON)) {
      logger.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report, logger);
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    logger.error(`[backup-check] failed: ${errorMessage(error)}`);
    return 1;
  } finally {
    if (!options.db && db.$disconnect) {
      await db.$disconnect();
    }
  }
}

async function loadPrisma(): Promise<BackupCheckDb> {
  const dbModule = await import("../lib/db");
  return dbModule.prisma;
}

async function loadTableCounts(db: BackupCheckDb): Promise<TableCount[]> {
  return Promise.all(
    KEY_TABLES.map(async (table) => {
      const rows = await db.$queryRawUnsafe<QueryRow[]>(
        `SELECT COUNT(*)::text AS "value" FROM ${quoteIdentifier(table.name)}`,
      );
      return {
        table: table.name,
        count: readNumberValue(rows, `count(${table.name})`),
      };
    }),
  );
}

async function loadLatestWrite(db: BackupCheckDb, now: Date): Promise<LatestWrite | null> {
  const rows = await Promise.all(
    KEY_TABLES.filter((table) => table.timestampColumn).map(async (table) => {
      const timestampColumn = table.timestampColumn ?? "created_at";
      const queryRows = await db.$queryRawUnsafe<QueryRow[]>(
        `SELECT MAX(${quoteIdentifier(timestampColumn)}) AS "value" FROM ${quoteIdentifier(table.name)}`,
      );
      return {
        table: table.name,
        at: readDateValue(queryRows),
      };
    }),
  );
  const latest = rows
    .filter((row): row is { table: string; at: Date } => row.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (!latest) return null;
  return {
    table: latest.table,
    at: latest.at.toISOString(),
    ageHours: ageHours(latest.at, now),
  };
}

function finishReport(
  checks: BackupCheckItem[],
  tableCounts: TableCount[],
  latestWrite: LatestWrite | null,
  backup: BackupFreshness | null,
): BackupCheckReport {
  return {
    ok: !checks.some((check) => check.status === "fail"),
    checks,
    tableCounts,
    latestWrite,
    backup,
  };
}

function printReport(report: BackupCheckReport, logger: Pick<Console, "log">): void {
  logger.log("[backup-check] checks");
  for (const check of report.checks) {
    logger.log(`[backup-check] ${check.status.toUpperCase()} ${check.name}: ${check.message}`);
  }

  logger.log("[backup-check] key table counts");
  for (const row of report.tableCounts) {
    logger.log(`[backup-check] - ${row.table}: ${row.count}`);
  }

  if (report.latestWrite) {
    logger.log(
      `[backup-check] latest write: ${report.latestWrite.at} (${formatHours(report.latestWrite.ageHours)} old, ${report.latestWrite.table})`,
    );
  }
  if (report.backup) {
    logger.log(
      `[backup-check] backup: ${report.backup.at} (${formatHours(report.backup.ageHours)} old, ${report.backup.source})`,
    );
  }

  logger.log(report.ok ? "[backup-check] PASS" : "[backup-check] FAIL");
}

type QueryRow = Record<string, unknown>;

function readNumberValue(rows: QueryRow[], label: string): number {
  const value = rows[0]?.value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Invalid numeric result for ${label}`);
}

function readDateValue(rows: QueryRow[]): Date | null {
  const value = rows[0]?.value;
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") return parseDate(value);
  throw new Error("Invalid timestamp result");
}

function readBackupTimestamp(env: BackupCheckEnv): { source: string; value: string } | null {
  if (env.BACKUP_LAST_SUCCESS_AT) {
    return { source: "BACKUP_LAST_SUCCESS_AT", value: env.BACKUP_LAST_SUCCESS_AT };
  }
  if (env.BACKUP_CHECK_LAST_SUCCESS_AT) {
    return { source: "BACKUP_CHECK_LAST_SUCCESS_AT", value: env.BACKUP_CHECK_LAST_SUCCESS_AT };
  }
  return null;
}

function backupTimestampRequired(env: BackupCheckEnv): boolean {
  if (env.BACKUP_CHECK_REQUIRE_BACKUP === "0") return false;
  if (env.BACKUP_CHECK_REQUIRE_BACKUP === "1") return true;
  return env.NODE_ENV === "production";
}

function envFlag(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE";
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function ageHours(past: Date, now: Date): number {
  return Math.max(0, (now.getTime() - past.getTime()) / 3_600_000);
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1]?.endsWith("backup-check.ts") || process.argv[1]?.endsWith("backup-check.js")) {
  runBackupCheckCli().then((code) => {
    process.exitCode = code;
  });
}
