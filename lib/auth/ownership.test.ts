import { describe, expect, it } from "vitest";

import { canAccessOwnerResource } from "./ownership";

describe("canAccessOwnerResource", () => {
  it("allows the owner", () => {
    expect(canAccessOwnerResource("user-1", "user-1")).toBe(true);
  });

  it("denies a different user", () => {
    expect(canAccessOwnerResource("user-1", "user-2")).toBe(false);
  });

  it("denies unauthenticated callers", () => {
    expect(canAccessOwnerResource("user-1", null)).toBe(false);
  });

  it("denies access to ownerless (anonymous) resources by default", () => {
    expect(canAccessOwnerResource(null, "user-1")).toBe(false);
    expect(canAccessOwnerResource(undefined, "user-1")).toBe(false);
  });

  it("denies even when both sides are missing", () => {
    expect(canAccessOwnerResource(null, null)).toBe(false);
  });
});
