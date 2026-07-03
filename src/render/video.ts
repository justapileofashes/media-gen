import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withPage } from "./browser.js";
import { buildHarness } from "./harness.js";
import { encodeFrames, frameName } from "./ffmpeg.js";

export interface VideoResult {
  path: string;
  bytes: number;
  frames: number;
  durationSeconds: number;
  samplePaths: string[];
}

export interface VideoRenderOptions {
  drawCode: string;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  outPath: string;
  onProgress?: (done: number, total: number, message: string) => Promise<void>;
}

const HARD_CAP_MS = 10 * 60 * 1000;

export async function renderVideo(opts: VideoRenderOptions): Promise<VideoResult> {
  const totalFrames = Math.round(opts.durationSeconds * opts.fps);
  if (totalFrames < 1) {
    throw new Error(`duration_seconds (${opts.durationSeconds}) x fps (${opts.fps}) must yield at least 1 frame`);
  }
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "media-gen-frames-"));
  const started = Date.now();
  try {
    await withPage({ width: opts.width, height: opts.height, timeoutMs: HARD_CAP_MS }, async (page) => {
      await page.setContent(buildHarness(opts.drawCode, opts.width, opts.height), { waitUntil: "domcontentloaded" });
      const canvas = page.locator("#c");
      for (let frame = 0; frame < totalFrames; frame++) {
        if (Date.now() - started > HARD_CAP_MS) throw new Error(`render exceeded ${HARD_CAP_MS / 60000} minute cap at frame ${frame}`);
        const err = await page.evaluate(
          ([t, f]) => (window as unknown as { __renderFrame(t: number, f: number): string | null }).__renderFrame(t, f),
          [frame / opts.fps, frame] as [number, number]
        );
        if (err !== null) throw new Error(`draw() failed at frame ${frame}: ${err}`);
        await canvas.screenshot({ path: path.join(framesDir, frameName(frame)) });
        if (opts.onProgress && (frame % 10 === 0 || frame === totalFrames - 1)) {
          await opts.onProgress(frame + 1, totalFrames + 1, `rendered frame ${frame + 1}/${totalFrames}`);
        }
      }
    });

    if (opts.onProgress) await opts.onProgress(totalFrames, totalFrames + 1, "encoding mp4");
    if (Date.now() - started > HARD_CAP_MS) {
      throw new Error(`render exceeded ${HARD_CAP_MS / 60000} minute cap before encoding`);
    }
    await encodeFrames(framesDir, opts.fps, opts.outPath);
    if (opts.onProgress) await opts.onProgress(totalFrames + 1, totalFrames + 1, "done");

    const sampleIdx = [0, Math.floor(totalFrames / 2), totalFrames - 1];
    const baseNoExt = opts.outPath.replace(/\.mp4$/i, "");
    const samplePaths: string[] = [];
    for (let i = 0; i < sampleIdx.length; i++) {
      const dest = `${baseNoExt}-sample-${i}.png`;
      await fs.copyFile(path.join(framesDir, frameName(sampleIdx[i])), dest);
      samplePaths.push(dest);
    }

    const stat = await fs.stat(opts.outPath);
    return {
      path: opts.outPath,
      bytes: stat.size,
      frames: totalFrames,
      durationSeconds: opts.durationSeconds,
      samplePaths
    };
  } finally {
    await fs.rm(framesDir, { recursive: true, force: true });
  }
}
