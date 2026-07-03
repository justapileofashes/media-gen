import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { renderSvg } from "../../src/render/svg.js";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#3b82f6"/></svg>`;

describe("renderSvg", () => {
  it("renders SVG to PNG at requested size", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-svg-"));
    const out = path.join(dir, "a.png");
    const res = await renderSvg({ source: SVG, width: 200, height: 100, outputFormat: "png", outPath: out });
    expect(res.path).toBe(out);
    expect(res.bytes).toBeGreaterThan(0);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
    expect(meta.format).toBe("png");
  });

  it("supports webp output", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-svg-"));
    const out = path.join(dir, "a.webp");
    const res = await renderSvg({ source: SVG, width: 64, height: 32, outputFormat: "webp", outPath: out });
    expect((await sharp(res.path).metadata()).format).toBe("webp");
  });

  it("rejects invalid SVG with an error message", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-svg-"));
    await expect(
      renderSvg({ source: "not svg at all", width: 10, height: 10, outputFormat: "png", outPath: path.join(dir, "b.png") })
    ).rejects.toThrow();
  });
});
