import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateModelCost } from "./pricing";
afterEach(() => vi.unstubAllEnvs());
describe("configurable model pricing", () => {
  it("uses model-specific rates", () => {
    vi.stubEnv("LLM_PRICING_JSON", JSON.stringify({ expensive: { input: 10, output: 30 }, "*": { input: 2, output: 4 } }));
    expect(calculateModelCost(1000, 500, "expensive")).toBe(0.025);
    expect(calculateModelCost(1000, 500, "other")).toBe(0.004);
  });
  it("rejects invalid rates", () => { expect(() => calculateModelCost(1, 1, "m", { input: -1, output: 1 })).toThrow(); });
  it("keeps the legacy estimate when no override exists", () => {
    vi.stubEnv("LLM_PRICING_JSON", ""); expect(calculateModelCost(1_000_000, 0, "deepseek-chat")).toBe(1);
    expect(calculateModelCost(0, 1_000_000, "deepseek-reasoner")).toBe(16);
  });
});
