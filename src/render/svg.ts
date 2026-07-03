import fs from "node:fs/promises";
import sharp from "sharp";

export interface RenderedFile {
  path: string;
  bytes: number;
  width: number;
  height: number;
}

export interface SvgRenderOptions {
  source: string;
  width: number;
  height: number;
  outputFormat: "png" | "jpeg" | "webp";
  outPath: string;
}

export async function renderSvg(opts: SvgRenderOptions): Promise<RenderedFile> {
  const pipeline = sharp(Buffer.from(opts.source), { density: 150 })
    .resize(opts.width, opts.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFormat(opts.outputFormat);
  await pipeline.toFile(opts.outPath);
  const stat = await fs.stat(opts.outPath);
  return { path: opts.outPath, bytes: stat.size, width: opts.width, height: opts.height };
}
