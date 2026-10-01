import { describe, expect, it } from "vitest";
import { getLlmCallContext, withLlmCallContext } from "./callContext";
describe("LLM call attribution", () => {
  it("keeps concurrent users isolated across asynchronous calls", async () => {
    const users = await Promise.all(["a", "b"].map(userId => withLlmCallContext({ userId }, async () => {
      await Promise.resolve(); return getLlmCallContext()?.userId;
    })));
    expect(users).toEqual(["a", "b"]); expect(getLlmCallContext()).toBeUndefined();
  });
});
