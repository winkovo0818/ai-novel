import { afterEach, describe, expect, it, vi } from "vitest";

import { isE2eBypassEnabled } from "./e2eBypass";

describe("isE2eBypassEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when E2E_AUTH_BYPASS=1 outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    expect(isE2eBypassEnabled()).toBe(true);
  });

  it("returns false when E2E_AUTH_BYPASS is unset", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_AUTH_BYPASS", "");
    expect(isE2eBypassEnabled()).toBe(false);
  });

  it("returns false for values other than '1'", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    expect(isE2eBypassEnabled()).toBe(false);
  });

  // 关键安全保险:CI/CD 环境变量泄漏到生产配置时,bypass 必须依然关闭。
  it("returns false in production even when E2E_AUTH_BYPASS=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    expect(isE2eBypassEnabled()).toBe(false);
  });
});
