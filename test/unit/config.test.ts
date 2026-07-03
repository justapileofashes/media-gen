import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("defaults output dir to ./generated-media resolved absolute", () => {
    const cfg = loadConfig({});
    expect(path.isAbsolute(cfg.outputDir)).toBe(true);
    expect(cfg.outputDir.endsWith("generated-media")).toBe(true);
  });

  it("honors MEDIA_OUTPUT_DIR", () => {
    const cfg = loadConfig({ MEDIA_OUTPUT_DIR: "D:\\out\\media" });
    expect(cfg.outputDir).toBe(path.resolve("D:\\out\\media"));
  });

  it("collects only present keys and no others", () => {
    const cfg = loadConfig({ OPENAI_API_KEY: "sk-1", FAL_KEY: "f-1" });
    expect(cfg.keys).toEqual({ openai: "sk-1", fal: "f-1" });
  });

  it("ignores empty-string keys", () => {
    const cfg = loadConfig({ GEMINI_API_KEY: "  " });
    expect(cfg.keys).toEqual({});
  });

  it("collects a gemini key when present", () => {
    const cfg = loadConfig({ GEMINI_API_KEY: "g-1" });
    expect(cfg.keys).toEqual({ gemini: "g-1" });
  });
});
