import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { Config } from "../../src/config.js";

async function setup(renderVideo: unknown) {
  const cfg: Config = { outputDir: await fs.mkdtemp(path.join(os.tmpdir(), "mg-vt-")), keys: {} };
  const server = createServer(cfg, { renderers: { renderVideo: renderVideo as never } });
  const client = new Client({ name: "t", version: "0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return { cfg, client };
}

describe("render_video tool", () => {
  // The frame-budget guard (frames > MAX_FRAMES) is defense-in-depth: with the
  // current zod caps (duration_seconds <= 60, fps <= 60) no schema-valid input
  // can exceed MAX_FRAMES (3600 = 60*60), so the boundary itself must succeed.
  it("accepts the maximum schema-valid frame count (60s @ 60fps = 3600 frames)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-vt3-"));
    const cfg: Config = { outputDir: dir, keys: {} };
    const mp4 = path.join(dir, "v.mp4");
    const sample = path.join(dir, "v-sample-0.png");
    await fs.writeFile(mp4, Buffer.alloc(600));
    await fs.writeFile(sample, Buffer.from("89504e470d0a1a0a", "hex"));
    const renderVideo = vi.fn(async () => ({
      path: mp4,
      bytes: 600,
      frames: 3600,
      durationSeconds: 60,
      samplePaths: [sample]
    }));
    const server = createServer(cfg, { renderers: { renderVideo: renderVideo as never } });
    const client = new Client({ name: "t", version: "0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);

    const res = await client.callTool({
      name: "render_video",
      arguments: { draw_code: "function draw(){}", duration_seconds: 60, fps: 60 }
    });
    expect(res.isError ?? false).toBe(false);
    expect(renderVideo).toHaveBeenCalledOnce();
  });

  it("returns video path and sample frame images, forwards progress", async () => {
    const { cfg, client } = await (async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-vt2-"));
      const cfg: Config = { outputDir: dir, keys: {} };
      const mp4 = path.join(dir, "v.mp4");
      const sample = path.join(dir, "v-sample-0.png");
      await fs.writeFile(mp4, Buffer.alloc(600));
      await fs.writeFile(sample, Buffer.from("89504e470d0a1a0a", "hex"));
      const renderVideo = vi.fn(async (o: { onProgress?: (d: number, t: number, m: string) => Promise<void> }) => {
        if (o.onProgress) await o.onProgress(1, 2, "rendering");
        return { path: mp4, bytes: 600, frames: 150, durationSeconds: 5, samplePaths: [sample] };
      });
      const server = createServer(cfg, { renderers: { renderVideo: renderVideo as never } });
      const client = new Client({ name: "t", version: "0" });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(st), client.connect(ct)]);
      return { cfg, client };
    })();

    const progress: number[] = [];
    const res = await client.callTool(
      { name: "render_video", arguments: { draw_code: "function draw(ctx,t){}" } },
      undefined,
      { onprogress: (p) => { progress.push(p.progress); }, resetTimeoutOnProgress: true }
    );
    expect(res.isError ?? false).toBe(false);
    const text = JSON.stringify(res.content);
    expect(text).toContain("v.mp4");
    expect(text).toContain("150");
    expect(progress.length).toBeGreaterThan(0);
  });

  it("maps renderer errors to isError", async () => {
    const renderVideo = vi.fn(async () => { throw new Error("draw() failed at frame 3: boom"); });
    const { client } = await setup(renderVideo);
    const res = await client.callTool({ name: "render_video", arguments: { draw_code: "function draw(){}" } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("frame 3");
  });
});
