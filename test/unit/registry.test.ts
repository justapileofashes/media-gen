import { describe, it, expect } from "vitest";
import { buildRegistry, defaultProvider } from "../../src/providers/registry.js";
import type { MediaProvider, ProviderName } from "../../src/providers/types.js";

function fake(name: ProviderName): (key: string) => MediaProvider {
  return (key) => ({
    name,
    capabilities: () => ({ image: true, video: false, models: [] }),
    generateImage: async () => ({ outputs: [], metadata: { key } }),
    generateVideo: async () => ({ outputs: [], metadata: {} })
  });
}

const factories = { openai: fake("openai"), gemini: fake("gemini"), fal: fake("fal") };

describe("buildRegistry", () => {
  it("instantiates only providers with keys", () => {
    const reg = buildRegistry({ outputDir: "x", keys: { fal: "f1" } }, factories);
    expect([...reg.keys()]).toEqual(["fal"]);
  });

  it("empty when no keys", () => {
    const reg = buildRegistry({ outputDir: "x", keys: {} }, factories);
    expect(reg.size).toBe(0);
  });

  it("all three when all keys present", () => {
    const reg = buildRegistry({ outputDir: "x", keys: { openai: "a", gemini: "b", fal: "c" } }, factories);
    expect(reg.size).toBe(3);
  });
});

describe("defaultProvider", () => {
  it("prefers openai > gemini > fal", () => {
    const reg = buildRegistry({ outputDir: "x", keys: { gemini: "b", fal: "c" } }, factories);
    expect(defaultProvider(reg)).toBe("gemini");
  });
  it("returns openai when all three configured", () => {
    const reg = buildRegistry({ outputDir: "x", keys: { openai: "a", gemini: "b", fal: "c" } }, factories);
    expect(defaultProvider(reg)).toBe("openai");
  });
  it("undefined when empty", () => {
    expect(defaultProvider(new Map())).toBeUndefined();
  });
});
