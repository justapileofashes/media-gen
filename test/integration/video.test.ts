import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderVideo } from "../../src/render/video.js";

const DRAW = `
function draw(ctx, t) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#0f0"; ctx.fillRect(10 + t * 50, 10, 20, 20);
}`;

describe("renderVideo", () => {
  it("renders a deterministic mp4 with sample frames and progress", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-vid-"));
    const out = path.join(dir, "anim.mp4");
    const ticks: number[] = [];
    const res = await renderVideo({
      drawCode: DRAW, durationSeconds: 1, fps: 24, width: 128, height: 128,
      outPath: out,
      onProgress: async (done) => { ticks.push(done); }
    });
    expect(res.frames).toBe(24);
    expect(res.bytes).toBeGreaterThan(500);
    expect(res.samplePaths).toHaveLength(3);
    for (const p of res.samplePaths) expect((await fs.stat(p)).size).toBeGreaterThan(0);
    expect(ticks.length).toBeGreaterThan(0);
  });

  it("surfaces user draw() errors with frame context", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-vid-"));
    await expect(renderVideo({
      drawCode: `function draw(ctx, t){ if (t > 0.1) throw new Error("boom"); ctx.fillRect(0,0,1,1); }`,
      durationSeconds: 1, fps: 24, width: 64, height: 64,
      outPath: path.join(dir, "bad.mp4")
    })).rejects.toThrow(/frame \d+.*boom/s);
  });

  it("rejects zero-frame requests before rendering", async () => {
    await expect(renderVideo({
      drawCode: "function draw(ctx,t){}",
      durationSeconds: 0, fps: 24, width: 64, height: 64,
      outPath: "unused.mp4"
    })).rejects.toThrow(/at least 1 frame/);
  });
});
