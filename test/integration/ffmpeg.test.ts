import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { encodeFrames, frameName } from "../../src/render/ffmpeg.js";

describe("encodeFrames", () => {
  it("encodes a PNG sequence to a playable mp4", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-ff-"));
    for (let i = 0; i < 6; i++) {
      const shade = Math.round((i / 5) * 255);
      await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: shade, g: 0, b: 0 } } })
        .png().toFile(path.join(dir, frameName(i)));
    }
    const out = path.join(dir, "out.mp4");
    await encodeFrames(dir, 30, out);
    const stat = await fs.stat(out);
    expect(stat.size).toBeGreaterThan(500);
    const head = await fs.readFile(out);
    expect(head.subarray(4, 8).toString()).toBe("ftyp"); // mp4 container magic
  });

  it("rejects with stderr detail when frames missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-ff-"));
    await expect(encodeFrames(dir, 30, path.join(dir, "out.mp4"))).rejects.toThrow(/ffmpeg/i);
  });
});
