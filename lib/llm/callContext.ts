import type { QuotaCheck } from "./usage";
import { AsyncLocalStorage } from "node:async_hooks";

/** Attribution and cancellation shared by every call in one background run. */
export interface LlmCallContext {
  userId?: string;
  novelId?: string;
  signal?: AbortSignal;
  enforceQuota?: boolean;
  beforeCall?: () => Promise<void>;
  onQuotaBlocked?: (quota: QuotaCheck) => Promise<void>;
  onCost?: (cny: number) => Promise<void>;
}

const storage = new AsyncLocalStorage<LlmCallContext>();
export function getLlmCallContext(): LlmCallContext | undefined { return storage.getStore(); }
export function withLlmCallContext<T>(context: LlmCallContext, run: () => Promise<T>): Promise<T> {
  return storage.run(context, run);
}
