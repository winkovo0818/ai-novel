import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts", "app/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/route.ts",
        "app/**/page.tsx",
        "app/**/layout.tsx",
        "lib/db.ts",
      ],
      // Thresholds are set a couple of points below the current baseline so
      // routine churn does not break CI, but a real regression (e.g. a new
      // un-tested module landing at 0%) trips the gate. Bump these whenever
      // the actual coverage rises meaningfully — see docs/STATUS.md.
      thresholds: {
        lines: 64,
        statements: 64,
        functions: 90,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
});
