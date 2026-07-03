import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { Config } from "../../src/config.js";
import type { MediaProvider } from "../../src/providers/types.js";

function fakeProvider(name: "openai" | "fal", video = true): MediaProvider {
  return {
    name,
    capabilities: () => ({ image: true, video, models: [{ id: "m1", kind: "image", note: "test model" }] }),
    generateImage: vi.fn(async () => ({
      outputs: [{ base64: Buffer.from("89504e470d0a1a0a", "hex").toString("base64"), mimeType: "image/png" }],
      metadata: { model: "m1" }
    })),
    generateVideo: vi.fn(async () => ({
      outputs: [{ base64: Buffer.alloc(10).toString("base64"), mimeType: "video/mp4" }],
      metadata: {}
    }))
  };
}

async function connect(providers: Map<string, MediaProvider> | undefined) {
  const cfg: Config = { outputDir: await fs.mkdtemp(path.join(os.tmpdir(), "mg-gt-")), keys: {} };
  const server = createServer(cfg, { providers: providers as never });
  const client = new Client({ name: "t", version: "0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

describe("BYOK tools", () => {
  it("generate_* absent with empty registry; list_providers present with setup help", async () => {
    const client = await connect(new Map());
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("generate_image");
    expect(names).not.toContain("generate_video");
    expect(names).toContain("list_providers");
    const res = await client.callTool({ name: "list_providers", arguments: {} });
    expect(JSON.stringify(res.content)).toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|FAL_KEY/);
  });

  it("generate_image saves file and returns path", async () => {
    const reg = new Map<string, MediaProvider>([["openai", fakeProvider("openai")]]);
    const client = await connect(reg);
    const res = await client.callTool({ name: "generate_image", arguments: { prompt: "a red cube" } });
    expect(res.isError ?? false).toBe(false);
    expect(JSON.stringify(res.content)).toMatch(/\.png/);
  });

  it("generate_image propagates the provider's real mime type instead of hardcoding png", async () => {
    const provider: MediaProvider = {
      name: "openai",
      capabilities: () => ({ image: true, video: true, models: [{ id: "m1", kind: "image", note: "test model" }] }),
      generateImage: vi.fn(async () => ({
        outputs: [{ base64: Buffer.from("52494646", "hex").toString("base64"), mimeType: "image/webp" }],
        metadata: { model: "m1" }
      })),
      generateVideo: vi.fn(async () => ({ outputs: [], metadata: {} }))
    };
    const reg = new Map<string, MediaProvider>([["openai", provider]]);
    const client = await connect(reg);
    const res = await client.callTool({ name: "generate_image", arguments: { prompt: "a red cube" } });
    expect(res.isError ?? false).toBe(false);
    const blocks = res.content as Array<{ type: string; mimeType?: string }>;
    expect(blocks.some((b) => b.type === "image" && b.mimeType === "image/webp")).toBe(true);
  });

  it("generate_video errors when chosen provider lacks video", async () => {
    const reg = new Map<string, MediaProvider>([["openai", fakeProvider("openai", false)]]);
    const client = await connect(reg);
    const res = await client.callTool({ name: "generate_video", arguments: { prompt: "waves" } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("video");
  });

  it("generate_video saves file, returns path, and forwards progress notifications", async () => {
    const provider: MediaProvider = {
      name: "openai",
      capabilities: () => ({ image: true, video: true, models: [{ id: "m1", kind: "video", note: "test model" }] }),
      generateImage: vi.fn(async () => ({ outputs: [], metadata: {} })),
      generateVideo: vi.fn(async (_params, onProgress) => {
        if (onProgress) await onProgress("rendering");
        return { outputs: [{ base64: Buffer.alloc(10).toString("base64"), mimeType: "video/mp4" }], metadata: {} };
      })
    };
    const reg = new Map<string, MediaProvider>([["openai", provider]]);
    const client = await connect(reg);
    const progress: number[] = [];
    const res = await client.callTool(
      { name: "generate_video", arguments: { prompt: "a wave crashing" } },
      undefined,
      { onprogress: (p) => { progress.push(p.progress); }, resetTimeoutOnProgress: true }
    );
    expect(res.isError ?? false).toBe(false);
    expect(JSON.stringify(res.content)).toMatch(/Saved: .*\.mp4/);
    expect(provider.generateVideo).toHaveBeenCalledOnce();
    expect(progress.length).toBeGreaterThan(0);
  });

  it("generate_video maps provider failures to isError with 'generation failed:' prefix", async () => {
    const provider: MediaProvider = {
      name: "openai",
      capabilities: () => ({ image: true, video: true, models: [{ id: "m1", kind: "video", note: "test model" }] }),
      generateImage: vi.fn(async () => ({ outputs: [], metadata: {} })),
      generateVideo: vi.fn(async () => { throw new Error("upstream 500"); })
    };
    const reg = new Map<string, MediaProvider>([["openai", provider]]);
    const client = await connect(reg);
    const res = await client.callTool({ name: "generate_video", arguments: { prompt: "waves" } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("generation failed: upstream 500");
  });

  it("generate_image maps provider failures to isError with 'generation failed:' prefix", async () => {
    const provider: MediaProvider = {
      name: "openai",
      capabilities: () => ({ image: true, video: true, models: [{ id: "m1", kind: "image", note: "test model" }] }),
      generateImage: vi.fn(async () => { throw new Error("rate limited"); }),
      generateVideo: vi.fn(async () => ({ outputs: [], metadata: {} }))
    };
    const reg = new Map<string, MediaProvider>([["openai", provider]]);
    const client = await connect(reg);
    const res = await client.callTool({ name: "generate_image", arguments: { prompt: "a red cube" } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("generation failed: rate limited");
  });

  it("list_providers reports capabilities", async () => {
    const reg = new Map<string, MediaProvider>([["fal", fakeProvider("fal")]]);
    const client = await connect(reg);
    const res = await client.callTool({ name: "list_providers", arguments: {} });
    const text = JSON.stringify(res.content);
    expect(text).toContain("fal");
    expect(text).toContain("m1");
  });
});
