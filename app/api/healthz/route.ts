import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckResult {
  ok: boolean;
  /** Round-trip in ms; only set when ok=true. */
  took_ms?: number;
  /** Short error class for ops dashboards. */
  code?: string;
  /** Free-form detail; truncated to keep the public payload small. */
  message?: string;
}

const TIMEOUT_MS = 1500;

function withTimeout<T>(p: Promise<T>, label: string, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function checkDb(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, "db");
    return { ok: true, took_ms: Date.now() - start };
  } catch (err) {
    return classify(err, "DB_UNREACHABLE");
  }
}

/**
 * Probe pgvector by asking Postgres whether the extension is registered.
 * We only check existence — running an actual `<=>` operation here would
 * hold a connection on every healthz hit.
 */
async function checkPgVector(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const rows = await withTimeout(
      prisma.$queryRaw<Array<{ installed: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) AS installed
      `,
      "pgvector",
    );
    if (!rows[0]?.installed) {
      return { ok: false, code: "PGVECTOR_MISSING", message: "vector extension not installed" };
    }
    return { ok: true, took_ms: Date.now() - start };
  } catch (err) {
    return classify(err, "PGVECTOR_UNREACHABLE");
  }
}

function checkAuthConfig(): CheckResult {
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    return {
      ok: false,
      code: "AUTH_SECRET_MISSING",
      message: "AUTH_SECRET is required in production",
    };
  }
  return { ok: true };
}

function classify(err: unknown, fallbackCode: string): CheckResult {
  const message = err instanceof Error ? err.message : "unknown error";
  const code = /timed out/i.test(message) ? `${fallbackCode}_TIMEOUT` : fallbackCode;
  return { ok: false, code, message: message.slice(0, 200) };
}

/**
 * GET /api/healthz — public liveness/readiness probe.
 *
 * Aggregates DB + pgvector + auth config checks. Returns 200 when all
 * are green, 503 when any required check fails. Each failure carries a
 * short `code` so monitoring can alert on specific subsystems.
 *
 * Deeper LLM-side checks live at /api/healthz/llm and stay admin-only —
 * we don't want to expose model identifiers / latency to unauthenticated
 * scanners.
 */
export async function GET() {
  const [db, pgvector] = await Promise.all([checkDb(), checkPgVector()]);
  const auth = checkAuthConfig();

  const checks = { db, pgvector, auth };
  const allOk = db.ok && pgvector.ok && auth.ok;

  return Response.json(
    {
      ok: allOk,
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
