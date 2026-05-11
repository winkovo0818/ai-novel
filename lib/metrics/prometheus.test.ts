import { describe, it, expect } from "vitest";

import { formatMetricFamily, formatMetrics } from "./prometheus";

describe("formatMetricFamily", () => {
  it("emits HELP / TYPE preamble and a single labelless sample", () => {
    const out = formatMetricFamily({
      name: "ai_novel_novels_total",
      help: "Total number of novels",
      type: "gauge",
      samples: [{ value: 42 }],
    });
    expect(out).toBe(
      [
        "# HELP ai_novel_novels_total Total number of novels",
        "# TYPE ai_novel_novels_total gauge",
        "ai_novel_novels_total 42",
      ].join("\n"),
    );
  });

  it("renders multiple labelled samples in input order", () => {
    const out = formatMetricFamily({
      name: "ai_novel_chapters_total",
      help: "Chapter count by status",
      type: "gauge",
      samples: [
        { labels: { status: "draft" }, value: 3 },
        { labels: { status: "done" }, value: 7 },
      ],
    });
    expect(out).toContain('ai_novel_chapters_total{status="draft"} 3');
    expect(out).toContain('ai_novel_chapters_total{status="done"} 7');
  });

  it("escapes special characters in label values", () => {
    const out = formatMetricFamily({
      name: "ai_novel_errors_total",
      help: "Errors",
      type: "counter",
      samples: [{ labels: { msg: 'has "quote" and \\ and \n newline' }, value: 1 }],
    });
    expect(out).toContain('msg="has \\"quote\\" and \\\\ and \\n newline"');
  });

  it("escapes backslash + newline in HELP but keeps quotes raw", () => {
    const out = formatMetricFamily({
      name: "x",
      help: 'has \\ and \n in it, "quotes" stay',
      type: "gauge",
      samples: [{ value: 0 }],
    });
    expect(out).toContain('# HELP x has \\\\ and \\n in it, "quotes" stay');
  });

  it("encodes +Inf / -Inf / NaN per spec", () => {
    const out = formatMetricFamily({
      name: "x",
      help: "edges",
      type: "gauge",
      samples: [
        { labels: { kind: "pos" }, value: Infinity },
        { labels: { kind: "neg" }, value: -Infinity },
        { labels: { kind: "nan" }, value: NaN },
      ],
    });
    expect(out).toContain('x{kind="pos"} +Inf');
    expect(out).toContain('x{kind="neg"} -Inf');
    expect(out).toContain('x{kind="nan"} NaN');
  });

  it("joins multiple labels with comma, no spaces", () => {
    const out = formatMetricFamily({
      name: "x",
      help: "h",
      type: "counter",
      samples: [{ labels: { a: "1", b: "2" }, value: 5 }],
    });
    expect(out).toContain('x{a="1",b="2"} 5');
  });
});

describe("formatMetrics", () => {
  it("separates families with blank line and terminates with newline", () => {
    const out = formatMetrics([
      {
        name: "a_total",
        help: "A",
        type: "counter",
        samples: [{ value: 1 }],
      },
      {
        name: "b_gauge",
        help: "B",
        type: "gauge",
        samples: [{ value: 2 }],
      },
    ]);
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toMatch(/a_total 1\n\n# HELP b_gauge/);
  });
});
