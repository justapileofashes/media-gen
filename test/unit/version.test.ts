import { describe, it, expect } from "vitest";
import { SERVER_NAME, SERVER_VERSION } from "../../src/version.js";

describe("version", () => {
  it("exposes server identity", () => {
    expect(SERVER_NAME).toBe("media-gen");
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
