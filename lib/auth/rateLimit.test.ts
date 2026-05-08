import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited } from "./rateLimit";

describe("isRateLimited", () => {
  beforeEach(() => {
    // The module uses a module-level Map, so we test by exceeding the limit
  });

  it("allows requests under the limit", () => {
    const identifier = `test-allow-${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      expect(isRateLimited(identifier, "/api/something")).toBe(false);
    }
  });

  it("blocks requests over the default limit (30/min)", () => {
    const identifier = `test-block-${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      isRateLimited(identifier, "/api/something");
    }
    expect(isRateLimited(identifier, "/api/something")).toBe(true);
  });

  it("uses a lower limit for draft routes (10/min)", () => {
    const identifier = `test-draft-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      isRateLimited(identifier, "/api/novels/123/chapters/draft");
    }
    expect(isRateLimited(identifier, "/api/novels/123/chapters/draft")).toBe(true);
  });

  it("tracks different identifiers independently", () => {
    const id1 = `test-ind1-${Date.now()}`;
    const id2 = `test-ind2-${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      isRateLimited(id1, "/api/something");
    }
    expect(isRateLimited(id1, "/api/something")).toBe(true);
    expect(isRateLimited(id2, "/api/something")).toBe(false);
  });
});
