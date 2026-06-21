import { jsonOk } from "@/lib/http/json";
import { computeQualityTrend } from "@/lib/evals/qualityTrend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/novels/:id/quality/trend
 *
 * Aggregate quality scores across all completed chapters.
 * Runs evaluateNovelQuality on sliding windows of 3 chapters.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

    const result = await computeQualityTrend(id);
  if ('coldStart' in result && result.coldStart) {
    return jsonOk(result);
  }
  return jsonOk(result);
}