import { describe, expect, it } from "vitest";

import { canAccessOwnerResource, canClaimAnonymousResource } from "./ownership";

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

describe("canClaimAnonymousResource", () => {
  it("allows the existing owner to access their own resource", () => {
    expect(canClaimAnonymousResource("user-1", "user-1")).toBe(true);
  });

  it("denies a different authenticated user from claiming an owned resource", () => {
    expect(canClaimAnonymousResource("user-1", "user-2")).toBe(false);
  });

  it("denies unauthenticated claim attempts", () => {
    expect(canClaimAnonymousResource(null, null)).toBe(false);
    expect(canClaimAnonymousResource("user-1", null)).toBe(false);
  });

  it("allows an authenticated user to claim an ownerless resource", () => {
    expect(canClaimAnonymousResource(null, "user-1")).toBe(true);
    expect(canClaimAnonymousResource(undefined, "user-1")).toBe(true);
  });
});
