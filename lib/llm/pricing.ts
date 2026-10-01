export interface ModelPricing { input: number; output: number }

/** CNY per million tokens. Overrides use exact model names, with '*' as fallback. */
export function calculateModelCost(tokenIn: number, tokenOut: number, model: string, pricing?: ModelPricing): number {
  if (!pricing && process.env.LLM_PRICING_JSON) {
    const rates = JSON.parse(process.env.LLM_PRICING_JSON) as Record<string, ModelPricing>;
    pricing = rates[model] ?? rates["*"];
  }
  pricing ??= model.includes("reasoner") || model.includes("r1")
    ? { input: 4, output: 16 } : { input: 1, output: 2 };
  if (![pricing.input, pricing.output].every(n => Number.isFinite(n) && n >= 0)) {
    throw new Error(`Invalid LLM pricing for ${model}`);
  }
  return (tokenIn * pricing.input + tokenOut * pricing.output) / 1_000_000;
}
