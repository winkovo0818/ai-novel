import { describe, expect, it } from "vitest";
import { sseEncode, sseHeartbeat } from "./sseEncode";

describe("sseEncode", () => {
  it("encodes event and JSON data", () => {
    expect(sseEncode("meta", { title: "逆魂纪" })).toBe(
      'event: meta\ndata: {"title":"逆魂纪"}\n\n',
    );
  });

  it("encodes heartbeat comments", () => {
    expect(sseHeartbeat()).toBe(":heartbeat\n\n");
  });
});
