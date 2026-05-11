/**
 * Tiny Prometheus text exposition format encoder.
 *
 * Why not prom-client (the standard npm SDK)?
 *   - Next.js routes deploy as serverless functions on Vercel; each cold
 *     start is a fresh process, so in-memory Counter/Gauge state would
 *     reset on every scale-out event.
 *   - All the metrics we care about already live in Postgres
 *     (LlmUsage, BackgroundJob, Novel/Chapter). Scrape-time aggregation
 *     keeps the source of truth in one place.
 *   - The text format is ~12 lines to encode.
 *
 * Format reference:
 * https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details
 */

export type MetricType = "counter" | "gauge";

export interface MetricSample {
  /** Labels are joined as `{k="v",k2="v2"}`; values are escaped. */
  labels?: Record<string, string | number>;
  value: number;
}

export interface MetricFamily {
  name: string;
  help: string;
  type: MetricType;
  samples: MetricSample[];
}

/**
 * Escape a label *value* per the Prometheus text format spec:
 * backslash, double-quote, newline.
 */
function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Escape a HELP line — only backslash and newline are special there.
 */
function escapeHelp(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function formatLabels(labels?: Record<string, string | number>): string {
  if (!labels) return "";
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const inner = entries
    .map(([k, v]) => `${k}="${escapeLabelValue(String(v))}"`)
    .join(",");
  return `{${inner}}`;
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) {
    if (value === Infinity) return "+Inf";
    if (value === -Infinity) return "-Inf";
    return "NaN";
  }
  return String(value);
}

export function formatMetricFamily(family: MetricFamily): string {
  const lines: string[] = [
    `# HELP ${family.name} ${escapeHelp(family.help)}`,
    `# TYPE ${family.name} ${family.type}`,
  ];
  for (const sample of family.samples) {
    lines.push(`${family.name}${formatLabels(sample.labels)} ${formatValue(sample.value)}`);
  }
  return lines.join("\n");
}

export function formatMetrics(families: MetricFamily[]): string {
  // Trailing newline is required by the spec.
  return families.map(formatMetricFamily).join("\n\n") + "\n";
}
